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
  authorizationRequestHash: string;
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

interface UploadAuthorizationPayload {
  uploadId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

function hashUploadAuthorization(
  input: RecordUploadAuthInput
): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      actorUserId: input.userId,
      organizationId: input.organizationId,
      commandType: "UPLOAD_AUTHORIZATION",
      uploadId: input.uploadId,
      storageKey: input.storageKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    }))
    .digest("hex");
}

export async function recordUploadAuthorization(
  input: RecordUploadAuthInput
): Promise<string> {
  const idempotencyKey = `upload-auth-${input.uploadId}`;
  const requestHash = hashUploadAuthorization(input);
  const responseJson = JSON.stringify({
    uploadId: input.uploadId,
    storageKey: input.storageKey,
    originalName: input.originalName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  } satisfies UploadAuthorizationPayload);
  const leaseExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  try {
    await prisma.commandReceipt.create({
      data: {
        actorUserId: input.userId,
        organizationId: input.organizationId,
        commandType: "UPLOAD_AUTHORIZATION",
        idempotencyKey,
        requestHash,
        status: "PENDING",
        leaseExpiresAt,
        responseJson,
      },
    });
  } catch (error: unknown) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "P2002"
    ) {
      throw error;
    }

    const existing = await prisma.commandReceipt.findUnique({
      where: {
        actorUserId_idempotencyKey: {
          actorUserId: input.userId,
          idempotencyKey,
        },
      },
    });
    if (
      !existing ||
      existing.commandType !== "UPLOAD_AUTHORIZATION" ||
      existing.organizationId !== input.organizationId ||
      existing.requestHash !== requestHash ||
      existing.responseJson !== responseJson ||
      existing.status !== "PENDING" ||
      !existing.leaseExpiresAt ||
      existing.leaseExpiresAt.getTime() <= Date.now()
    ) {
      throw new ValidationError("Upload authorization is already used or does not match this upload.");
    }
    // An identical live pending request may retry token issuance, but never
    // extend its lease or change its identity/reference.
  }
  return requestHash;
}
async function findPendingUploadAuthorization(
  input: RecordUploadAuthInput
): Promise<{ requestHash: string; payload: UploadAuthorizationPayload }> {
  const requestHash = hashUploadAuthorization(input);
  const receipt = await prisma.commandReceipt.findUnique({
    where: {
      actorUserId_idempotencyKey: {
        actorUserId: input.userId,
        idempotencyKey: `upload-auth-${input.uploadId}`,
      },
    },
  });

  if (!receipt || receipt.commandType !== "UPLOAD_AUTHORIZATION") {
    throw new ValidationError("Upload authorization not found. Upload through the authorized flow.");
  }
  if (receipt.organizationId !== input.organizationId) {
    throw new AccessDeniedError("Upload authorization belongs to a different organization.");
  }
  if (receipt.status === "COMPLETED") {
    throw new ValidationError("Upload authorization has already been consumed.");
  }
  if (
    receipt.status !== "PENDING" ||
    !receipt.leaseExpiresAt ||
    receipt.leaseExpiresAt.getTime() <= Date.now()
  ) {
    throw new ValidationError("Upload authorization is expired or not pending.");
  }

  let payload: UploadAuthorizationPayload;
  try {
    payload = JSON.parse(receipt.responseJson || "") as UploadAuthorizationPayload;
  } catch {
    throw new ValidationError("Upload authorization data is invalid.");
  }
  if (
    payload.uploadId !== input.uploadId ||
    payload.storageKey !== input.storageKey ||
    payload.originalName !== input.originalName ||
    payload.mimeType !== input.mimeType ||
    payload.sizeBytes !== input.sizeBytes ||
    receipt.requestHash !== requestHash
  ) {
    throw new ValidationError("Submitted attachment does not match its authorized upload reference.");
  }

  return { requestHash, payload };
}

export async function consumeUploadAuthorization(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    organizationId: string;
    uploadId: string;
    requestHash: string;
    attachmentId: string;
  }
): Promise<void> {
  const now = new Date();
  const consumed = await tx.commandReceipt.updateMany({
    where: {
      actorUserId: input.userId,
      organizationId: input.organizationId,
      idempotencyKey: `upload-auth-${input.uploadId}`,
      commandType: "UPLOAD_AUTHORIZATION",
      requestHash: input.requestHash,
      status: "PENDING",
      leaseExpiresAt: { gt: now },
    },
    data: {
      status: "COMPLETED",
      completedAt: now,
      resultEntityType: "Attachment",
      resultEntityId: input.attachmentId,
    },
  });
  if (consumed.count !== 1) {
    throw new ValidationError("Upload authorization is expired, mismatched, or already consumed.");
  }
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
  if (!user || !user.organizationId) {
    throw new AccessDeniedError("User must belong to an organization.");
  }

  const { storageKey, originalName, mimeType, sizeBytes } = input;
  if (!storageKey || !storageKey.trim() || storageKey !== storageKey.trim()) {
    throw new ValidationError("Attachment storage reference is required and must be canonical.");
  }
  if (await prisma.attachment.findUnique({ where: { storageKey }, select: { id: true } })) {
    throw new ValidationError("Attachment reference has already been used by another record.");
  }

  if (isBlobStorageKey(storageKey)) {
    let submittedUrl: URL;
    try {
      submittedUrl = new URL(storageKey);
    } catch {
      throw new ValidationError("Invalid attachment storage URL.");
    }
    if (
      submittedUrl.protocol !== "https:" ||
      submittedUrl.username ||
      submittedUrl.password ||
      submittedUrl.port ||
      submittedUrl.search ||
      submittedUrl.hash
    ) {
      throw new ValidationError("Attachment URL is not canonical.");
    }

    const prefix = `/attachments/${user.organizationId}/`;
    if (!submittedUrl.pathname.startsWith(prefix)) {
      throw new AccessDeniedError("Attachment does not belong to your organization.");
    }
    const relativePath = submittedUrl.pathname.slice(1);
    const pathMatch = submittedUrl.pathname.slice(prefix.length).match(/^([A-Za-z0-9-]+)\.([a-z0-9]+)$/i);
    if (!pathMatch) throw new ValidationError("Invalid attachment path format in storage URL.");

    const uploadId = pathMatch[1];
    const extension = pathMatch[2].toLowerCase();
    const authorization = await findPendingUploadAuthorization({
      uploadId,
      userId: user.id,
      organizationId: user.organizationId,
      storageKey: relativePath,
      originalName,
      mimeType,
      sizeBytes,
    });
    if (path.extname(originalName).slice(1).toLowerCase() !== extension) {
      throw new ValidationError("Authorized upload extension does not match attachment name.");
    }

    // Resolve by authorized pathname using this application's store token. Never
    // fetch the client URL as a fallback, which would trust arbitrary stores.
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) throw new ValidationError("Authorized Blob store is not configured.");

    let blob;
    try {
      blob = await get(relativePath, {
        access: getBlobAccess(),
        token: blobToken,
        useCache: false,
      });
    } catch {
      throw new ValidationError("Uploaded file was not found in the authorized Blob store.");
    }
    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      throw new ValidationError("Uploaded file was not found in the authorized Blob store.");
    }

    const storedUrl = new URL(blob.blob.url);
    if (storedUrl.origin !== submittedUrl.origin || storedUrl.pathname !== submittedUrl.pathname) {
      throw new ValidationError("Submitted Blob URL does not match the authorized Blob store reference.");
    }

    const actualSize = blob.blob.size;
    if (actualSize !== authorization.payload.sizeBytes || actualSize !== sizeBytes) {
      throw new ValidationError("Stored attachment size differs from authorized upload.");
    }

    const reader = blob.stream.getReader();
    const bytes: number[] = [];
    try {
      while (bytes.length < 16) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          for (const byte of value.subarray(0, 16 - bytes.length)) bytes.push(byte);
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }

    const metaError = validateAttachmentMetadata(originalName, mimeType, actualSize);
    if (metaError) throw new ValidationError(metaError);
    if (!validateFileMagicBytes(Uint8Array.from(bytes), mimeType)) {
      throw new ValidationError("File content signature does not match its declared type.");
    }

    return {
      storageKey,
      originalName,
      mimeType,
      sizeBytes: actualSize,
      uploadId,
      authorizationRequestHash: authorization.requestHash,
    };
  }

  // Local references are plain server-issued stage filenames, never paths or URLs.
  if (path.basename(storageKey) !== storageKey || storageKey.includes("\\") || storageKey.includes("/")) {
    throw new ValidationError("Local attachment reference is not canonical.");
  }
  const extension = path.extname(storageKey).slice(1).toLowerCase();
  const stageId = path.basename(storageKey, path.extname(storageKey));
  if (!stageId || !extension) throw new ValidationError("Invalid local upload reference.");

  const authorization = await findPendingUploadAuthorization({
    uploadId: stageId,
    userId: user.id,
    organizationId: user.organizationId,
    storageKey,
    originalName,
    mimeType,
    sizeBytes,
  });
  if (path.extname(originalName).slice(1).toLowerCase() !== extension) {
    throw new ValidationError("Authorized upload extension does not match attachment name.");
  }

  const stagingPath = path.resolve(defaultAttachmentStorageService.getStagingDir(), storageKey);
  const activePath = defaultAttachmentStorageService.resolveActivePath(storageKey);
  const resolvedPath = existsSync(stagingPath) ? stagingPath : activePath;
  if (!existsSync(resolvedPath)) {
    throw new ValidationError("Authorized local attachment is missing from staging and active storage.");
  }

  const actualSize = (await fs.stat(resolvedPath)).size;
  const metaError = validateAttachmentMetadata(originalName, mimeType, actualSize);
  if (metaError || actualSize !== authorization.payload.sizeBytes || actualSize !== sizeBytes) {
    throw new ValidationError(metaError || "Stored attachment size differs from authorized upload.");
  }

  const handle = await fs.open(resolvedPath, "r");
  const bytes = Buffer.alloc(16);
  try {
    await handle.read(bytes, 0, 16, 0);
  } finally {
    await handle.close();
  }
  if (!validateFileMagicBytes(new Uint8Array(bytes), mimeType)) {
    throw new ValidationError("File content signature does not match its declared type.");
  }

  return {
    storageKey,
    originalName,
    mimeType,
    sizeBytes: actualSize,
    uploadId: stageId,
    authorizationRequestHash: authorization.requestHash,
    isLocalStaged: true,
    stageId,
    extension,
  };
}
