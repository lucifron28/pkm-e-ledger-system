import "server-only";
import crypto from "crypto";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { get } from "@vercel/blob";
import type { Prisma } from "@prisma/client";
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
  uploadId: string;
  isLocalStaged?: boolean;
  stageId?: string;
  extension?: string;
}

export interface RecordUploadAuthInput {
  uploadId: string;
  userId: string;
  organizationId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export async function recordUploadAuthorization(
  input: RecordUploadAuthInput
): Promise<void> {
  const { uploadId, userId, organizationId, storageKey, originalName, mimeType, sizeBytes } = input;
  const idempotencyKey = `upload-auth-${uploadId}`;
  const leaseExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours validity
  const requestHash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ uploadId, storageKey, organizationId, userId }))
    .digest("hex");

  await prisma.commandReceipt.upsert({
    where: {
      actorUserId_idempotencyKey: {
        actorUserId: userId,
        idempotencyKey,
      },
    },
    create: {
      actorUserId: userId,
      organizationId,
      commandType: "UPLOAD_AUTHORIZATION",
      idempotencyKey,
      requestHash,
      status: "PENDING",
      leaseExpiresAt,
      responseJson: JSON.stringify({
        uploadId,
        storageKey,
        originalName,
        mimeType,
        sizeBytes,
        createdAt: new Date().toISOString(),
      }),
    },
    update: {
      organizationId,
      leaseExpiresAt,
      status: "PENDING",
      requestHash,
      responseJson: JSON.stringify({
        uploadId,
        storageKey,
        originalName,
        mimeType,
        sizeBytes,
        createdAt: new Date().toISOString(),
      }),
    },
  });
}

export async function consumeUploadAuthorization(
  tx: Prisma.TransactionClient,
  userId: string,
  uploadId: string,
  attachmentId: string
): Promise<void> {
  await tx.commandReceipt.updateMany({
    where: {
      actorUserId: userId,
      idempotencyKey: `upload-auth-${uploadId}`,
      commandType: "UPLOAD_AUTHORIZATION",
      status: "PENDING",
    },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      resultEntityType: "Attachment",
      resultEntityId: attachmentId,
    },
  });
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
  const existingAttachment = await prisma.attachment.findUnique({
    where: { storageKey: storageKey.trim() },
    select: { id: true },
  });
  if (existingAttachment) {
    throw new ValidationError("Attachment reference has already been used by another record.");
  }

  let uploadId: string;

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

    // Extract uploadId from URL pathname: /attachments/<orgId>/<uploadId>.<ext>
    const match = parsedUrl.pathname.match(
      new RegExp(`^/attachments/${user.organizationId}/([^/.]+)\\.[a-z0-9]+$`, "i")
    );
    if (!match) {
      throw new ValidationError("Invalid attachment path format in storage URL.");
    }
    uploadId = match[1];

    // Verify upload authorization exists and was initiated by this user/organization
    const authReceipt = await prisma.commandReceipt.findUnique({
      where: {
        actorUserId_idempotencyKey: {
          actorUserId: user.id,
          idempotencyKey: `upload-auth-${uploadId}`,
        },
      },
    });

    if (!authReceipt || authReceipt.commandType !== "UPLOAD_AUTHORIZATION") {
      throw new ValidationError(
        "Upload authorization not found. Attachments must originate from an authorized upload."
      );
    }

    if (authReceipt.organizationId !== user.organizationId) {
      throw new AccessDeniedError(
        "Attachment upload authorization belongs to a different organization."
      );
    }

    if (authReceipt.status === "COMPLETED") {
      throw new ValidationError("Upload authorization has already been consumed.");
    }

    if (authReceipt.status !== "PENDING") {
      throw new ValidationError("Upload authorization is not in a valid pending state.");
    }

    if (authReceipt.leaseExpiresAt && Date.now() > authReceipt.leaseExpiresAt.getTime()) {
      throw new ValidationError("Upload authorization has expired. Please upload the file again.");
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
      uploadId,
      isLocalStaged: false,
    };
  }

  // 5. Local staging verification (for local development & offline tests)
  const stagingDir = defaultAttachmentStorageService.getStagingDir();
  const safeBaseName = path.basename(storageKey);
  const resolvedPath = path.resolve(stagingDir, safeBaseName);

  if (!resolvedPath.startsWith(stagingDir) || !existsSync(resolvedPath)) {
    throw new ValidationError("Attachment file does not exist in staging.");
  }

  const extension = path.extname(safeBaseName).replace(/^\./, "").toLowerCase();
  const stageId = safeBaseName.replace(/\.[^.]+$/, "");
  uploadId = stageId;

  // Verify upload authorization exists for local staged upload
  const authReceipt = await prisma.commandReceipt.findUnique({
    where: {
      actorUserId_idempotencyKey: {
        actorUserId: user.id,
        idempotencyKey: `upload-auth-${uploadId}`,
      },
    },
  });

  if (!authReceipt || authReceipt.commandType !== "UPLOAD_AUTHORIZATION") {
    throw new ValidationError(
      "Upload authorization not found. Attachments must originate from an authorized upload."
    );
  }

  if (authReceipt.organizationId !== user.organizationId) {
    throw new AccessDeniedError(
      "Attachment upload authorization belongs to a different organization."
    );
  }

  if (authReceipt.status === "COMPLETED") {
    throw new ValidationError("Upload authorization has already been consumed.");
  }

  if (authReceipt.status !== "PENDING") {
    throw new ValidationError("Upload authorization is not in a valid pending state.");
  }

  if (authReceipt.leaseExpiresAt && Date.now() > authReceipt.leaseExpiresAt.getTime()) {
    throw new ValidationError("Upload authorization has expired. Please upload the file again.");
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
    uploadId,
    isLocalStaged: true,
    stageId,
    extension,
  };
}
