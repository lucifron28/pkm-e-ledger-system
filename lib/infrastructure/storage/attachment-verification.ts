import "server-only";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { get } from "@vercel/blob";
import { prisma } from "../../db/prisma";
import { AccessDeniedError, ValidationError } from "../../domain/errors";
import {
  defaultAttachmentStorageService,
  getBlobAccess,
  isBlobStorageKey,
} from "./attachment-store";
import {
  validateAttachmentMetadata,
  validateFileMagicBytes,
} from "../../domain/attachments";
import type { SessionUser } from "../../auth/session";

export interface VerifiedAttachmentStorageResult {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export async function verifyAndSecureAttachmentStorage(
  input: {
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  },
  user: SessionUser
): Promise<VerifiedAttachmentStorageResult> {
  const { storageKey, originalName, mimeType, sizeBytes } = input;

  if (!user || !user.organizationId) {
    throw new AccessDeniedError("User must belong to an organization.");
  }

  if (!storageKey || typeof storageKey !== "string" || storageKey.trim().length === 0) {
    throw new ValidationError("Attachment storage reference is required.");
  }

  // 1. Replay prevention: check if this storageKey has already been used in another record
  const existing = await prisma.attachment.findUnique({
    where: { storageKey: storageKey.trim() },
    select: { id: true },
  });
  if (existing) {
    throw new ValidationError("Attachment reference has already been used by another record.");
  }

  // 2. Cloud blob storage path & host verification
  if (isBlobStorageKey(storageKey)) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(storageKey);
    } catch {
      throw new ValidationError("Invalid attachment storage URL.");
    }

    // Host verification: reject arbitrary untrusted third-party storage hosts
    const hostname = parsedUrl.hostname.toLowerCase();
    const isVercelBlobHost =
      hostname.endsWith(".blob.vercel-storage.com") ||
      hostname === "blob.vercel-storage.com" ||
      (process.env.NODE_ENV !== "production" &&
        (hostname === "localhost" || hostname === "127.0.0.1"));

    if (!isVercelBlobHost) {
      throw new ValidationError(
        "Untrusted storage host. Attachment must originate from authorized storage."
      );
    }

    // Organization scope verification: pathname MUST start with /attachments/<organizationId>/
    const expectedPrefix = `/attachments/${user.organizationId}/`;
    if (!parsedUrl.pathname.startsWith(expectedPrefix)) {
      throw new AccessDeniedError("Attachment does not belong to your organization.");
    }

    // 3. Storage existence, actual size, and magic bytes verification
    let actualSize = sizeBytes;
    let firstBytes = new Uint8Array(0);

    try {
      const blobResult = await get(storageKey, { access: getBlobAccess() }).catch(
        async () => {
          return await get(storageKey, { access: "public" });
        }
      );

      if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
        throw new ValidationError("Attachment file does not exist in storage.");
      }

      actualSize = blobResult.blob.size;
      const reader = blobResult.stream.getReader();
      const { value } = await reader.read();
      reader.releaseLock();
      firstBytes = value ? new Uint8Array(Buffer.from(value).subarray(0, 16)) : new Uint8Array(0);
    } catch (err: unknown) {
      if (err instanceof ValidationError || err instanceof AccessDeniedError) throw err;

      // Fallback: fetch directly if blob get helper encountered access discrepancy
      try {
        const fetchRes = await fetch(storageKey, { method: "GET" });
        if (!fetchRes.ok) {
          throw new ValidationError("Attachment file does not exist in storage.");
        }
        const ab = await fetchRes.arrayBuffer();
        actualSize = ab.byteLength;
        firstBytes = new Uint8Array(Buffer.from(ab).subarray(0, 16));
      } catch (fetchErr: unknown) {
        if (fetchErr instanceof ValidationError || fetchErr instanceof AccessDeniedError) {
          throw fetchErr;
        }
        throw new ValidationError("Failed to verify attachment in storage.");
      }
    }

    // 4. File limits & server-side signature verification
    const metaError = validateAttachmentMetadata(originalName, mimeType, actualSize);
    if (metaError) {
      await defaultAttachmentStorageService.deleteActiveFile(storageKey).catch(() => undefined);
      throw new ValidationError(metaError);
    }

    if (!validateFileMagicBytes(firstBytes, mimeType)) {
      await defaultAttachmentStorageService.deleteActiveFile(storageKey).catch(() => undefined);
      throw new ValidationError("File content signature does not match its declared type.");
    }

    return {
      storageKey,
      originalName,
      mimeType,
      sizeBytes: actualSize,
    };
  }

  // 5. Local staging verification (for local development & offline tests)
  const stagingDir = defaultAttachmentStorageService.getStagingDir();
  const safeBaseName = path.basename(storageKey);
  const resolvedPath = path.resolve(stagingDir, safeBaseName);

  if (!resolvedPath.startsWith(stagingDir) || !existsSync(resolvedPath)) {
    throw new ValidationError("Attachment file does not exist in staging.");
  }

  const stat = await fs.stat(resolvedPath);
  const actualSize = stat.size;

  const metaError = validateAttachmentMetadata(originalName, mimeType, actualSize);
  if (metaError) {
    throw new ValidationError(metaError);
  }

  const fileHandle = await fs.open(resolvedPath, "r");
  const buffer = Buffer.alloc(16);
  await fileHandle.read(buffer, 0, 16, 0);
  await fileHandle.close();

  if (!validateFileMagicBytes(new Uint8Array(buffer), mimeType)) {
    await fs.unlink(resolvedPath).catch(() => undefined);
    throw new ValidationError("File content signature does not match its declared type.");
  }

  return {
    storageKey,
    originalName,
    mimeType,
    sizeBytes: actualSize,
  };
}
