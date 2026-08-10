"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "../db/prisma";
import { requireManagementUser } from "../auth/require-auth";
import type { SessionUser } from "../auth/session";
import { createAuditLog } from "../data/audit-log";
import { validateAndReadAttachmentFile } from "../domain/attachments";
import { AuditAction, Prisma } from "@prisma/client";
import type { AttachmentStorageProvider, ValidatedStagedUpload } from "../infrastructure/storage/attachment-store";
import { defaultAttachmentStorageService } from "../infrastructure/storage/attachment-store";
import { withTransientRetry } from "../infrastructure/db/retry";
import {
  claimCommandReceipt,
  processIdempotentCommand,
  releaseCommandReceipt,
} from "../application/idempotency";
import { getAttachmentOwnerIds } from "../application/attachment-input";
import type { AttachmentOwnerIds } from "../application/attachment-input";
import { DomainError, ValidationError } from "../domain/errors";

export type AttachmentState = { error?: string } | null;

function getOwnerIds(formData: FormData): AttachmentOwnerIds {
  return getAttachmentOwnerIds(formData.get("transactionId")?.toString(), formData.get("cashTransferId")?.toString());
}

function getFile(formData: FormData): File {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) throw new ValidationError("File is required.");
  return file;
}

function getIdempotencyKey(formData: FormData, fallback: string): string {
  return formData.get("idempotencyKey")?.toString().trim() || fallback;
}

async function persistAttachmentRecord({
  user,
  owner,
  validated,
  storageKey,
  idempotencyKey,
  payload,
  claimToken,
}: {
  user: SessionUser;
  owner: AttachmentOwnerIds;
  validated: Pick<ValidatedStagedUpload, "originalName" | "mimeType" | "sizeBytes">;
  storageKey: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  claimToken: string;
}) {
  return withTransientRetry(() =>
    processIdempotentCommand<{ id: string }>(
      user.id,
      user.organizationId!,
      "UPLOAD_ATTACHMENT",
      idempotencyKey,
      payload,
      async (tx) => {
        const transaction = owner.transactionId
          ? await tx.transaction.findFirst({
              where: { id: owner.transactionId, organizationId: user.organizationId!, deletedAt: null },
              select: { id: true },
            })
          : null;
        const transfer = owner.cashTransferId
          ? await tx.cashTransfer.findFirst({
              where: { id: owner.cashTransferId, organizationId: user.organizationId!, deletedAt: null },
              select: { id: true },
            })
          : null;
        if (!transaction && !transfer) throw new ValidationError("Attachment owner not found or access denied.");

        const attachment = await tx.attachment.create({
          data: {
            transactionId: transaction?.id || null,
            cashTransferId: transfer?.id || null,
            uploadedById: user.id,
            originalName: validated.originalName,
            storageKey,
            mimeType: validated.mimeType,
            sizeBytes: validated.sizeBytes,
          },
        });

        await createAuditLog({
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role,
          action: AuditAction.UPLOADED_ATTACHMENT,
          entityType: "Attachment",
          entityId: attachment.id,
          metadata: {
            transactionId: transaction?.id || null,
            cashTransferId: transfer?.id || null,
            originalName: validated.originalName,
            sizeBytes: validated.sizeBytes,
          },
          tx,
        });

        return { result: { id: attachment.id }, resultEntityType: "Attachment", resultEntityId: attachment.id };
      },
      { claimToken },
    ),
  );
}

export async function uploadAttachmentAction(
  _prevState: AttachmentState,
  formData: FormData
): Promise<AttachmentState> {
  const user = await requireManagementUser();
  if (!user.organizationId) return { error: "You are not assigned to an organization." };

  let owner: { transactionId: string | null; cashTransferId: string | null };
  let file: File;
  try {
    owner = getOwnerIds(formData);
    file = getFile(formData);
  } catch (error) {
    return { error: error instanceof DomainError ? error.message : "Attachment owner and file are required." };
  }

  const validation = await validateAndReadAttachmentFile(file);
  if (!validation.success) return { error: validation.error };
  const validated = validation.data;
  const storage = defaultAttachmentStorageService;
  if (storage.mode === "vercel-blob") {
    return { error: "Use direct private storage upload for this deployment." };
  }
  const fileHash = crypto.createHash("sha256").update(validated.buffer).digest("hex");
  const ownerKey = owner.transactionId || owner.cashTransferId!;
  const commandType = "UPLOAD_ATTACHMENT";
  const idempotencyKey = getIdempotencyKey(formData, `upload-${ownerKey}-${fileHash}`);
  const payload = {
    ...owner,
    originalName: validated.originalName,
    mimeType: validated.mimeType,
    sizeBytes: validated.sizeBytes,
    fileHash,
  };

  let receipt;
  try {
    receipt = await claimCommandReceipt<{ id: string }>(
      user.id,
      user.organizationId,
      commandType,
      idempotencyKey,
      payload
    );
  } catch (error) {
    return { error: error instanceof DomainError ? error.message : "Could not claim attachment upload." };
  }
  if (receipt.status === "COMPLETED") return null;

  const claim = receipt.claim;
  let staged: Awaited<ReturnType<typeof storage.stageUpload>> | null = null;
  let storageKey: string | null = null;
  try {
    staged = await storage.stageUpload(validated.buffer, validated.originalName, validated.mimeType);
    const committed = await storage.commitUpload(staged.stageId, staged.extension);
    storageKey = committed.storageKey;

    const outcome = await persistAttachmentRecord({
      user,
      owner,
      validated: {
        originalName: validated.originalName,
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
      },
      storageKey: storageKey!,
      idempotencyKey,
      payload,
      claimToken: claim.claimToken,
    });

    if (outcome.disposition === "CACHED" && storageKey) {
      // Another claimant completed this upload; this caller's committed file
      // is unreferenced and must be removed. When EXECUTED, retain the file
      // without a second ownership query. Failures here keep the file for
      // reconciliation rather than risk deleting a referenced file.
      await storage.deleteActiveFile(storageKey).catch(() => undefined);
    }
  } catch (error) {
    if (staged && !storageKey) {
      await storage.discardStagedUpload(staged.stageId, staged.extension).catch(() => undefined);
    }
    if (storageKey) {
      let lookupState: "LOOKUP_SUCCEEDED_REFERENCED" | "LOOKUP_SUCCEEDED_UNREFERENCED" | "LOOKUP_FAILED" = "LOOKUP_FAILED";
      try {
        const ref = await prisma.attachment.findFirst({
          where: { storageKey },
          select: { id: true },
        });
        lookupState = ref ? "LOOKUP_SUCCEEDED_REFERENCED" : "LOOKUP_SUCCEEDED_UNREFERENCED";
      } catch (lookupErr) {
        console.warn("[AttachmentAction] Ownership lookup failed; retaining active file for reconciliation:", lookupErr);
        lookupState = "LOOKUP_FAILED";
      }
      if (lookupState === "LOOKUP_SUCCEEDED_UNREFERENCED") {
        await storage.deleteActiveFile(storageKey).catch(() => undefined);
      }
    }
    await releaseCommandReceipt(claim).catch(() => undefined);
    if (error instanceof DomainError) return { error: error.message };
    console.error("Upload attachment error:", error);
    return { error: "Failed to upload attachment. Please try again." };
  }

  revalidatePath("/ledger");
  return null;
}

export async function finalizeStagedAttachmentUpload({
  user,
  owner,
  stagedKey,
  originalName,
  mimeType,
  sizeBytes,
  idempotencyKey,
}: {
  user: SessionUser;
  owner: AttachmentOwnerIds;
  stagedKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  idempotencyKey: string;
}): Promise<AttachmentState> {
  if (!user.organizationId) return { error: "You are not assigned to an organization." };

  const storage: AttachmentStorageProvider = defaultAttachmentStorageService;
  if (storage.mode !== "vercel-blob") return { error: "Private direct upload is not enabled for this environment." };

  const ownerKey = owner.transactionId || owner.cashTransferId!;
  const commandKey = idempotencyKey.trim() || `upload-${ownerKey}-${stagedKey}`;
  const payload = {
    ...owner,
    originalName,
    mimeType,
    sizeBytes,
    stagedKey: stagedKey.trim(),
  };

  let receipt;
  try {
    receipt = await claimCommandReceipt<{ id: string }>(
      user.id,
      user.organizationId,
      "UPLOAD_ATTACHMENT",
      commandKey,
      payload,
    );
  } catch (error) {
    return { error: error instanceof DomainError ? error.message : "Could not claim attachment upload." };
  }
  if (receipt.status === "COMPLETED") {
    await storage.discardStagedObject(stagedKey).catch(() => undefined);
    return null;
  }

  const claim = receipt.claim;
  let validated: ValidatedStagedUpload;
  try {
    validated = await storage.validateStagedUpload(stagedKey, originalName, mimeType, sizeBytes);
  } catch (error) {
    await releaseCommandReceipt(claim).catch(() => undefined);
    return { error: error instanceof DomainError ? error.message : "Staged upload could not be validated." };
  }

  let storageKey: string | null = null;
  try {
    const committed = await storage.commitValidatedStagedUpload(validated);
    storageKey = committed.storageKey;
    const outcome = await persistAttachmentRecord({
      user,
      owner,
      validated,
      storageKey,
      idempotencyKey: commandKey,
      payload,
      claimToken: claim.claimToken,
    });

    if (outcome.disposition === "CACHED") {
      await storage.deleteActiveFile(storageKey).catch(() => undefined);
    }
    await storage.discardStagedObject(validated.stagedKey).catch(() => undefined);
  } catch (error) {
    if (storageKey) {
      let lookupState: "LOOKUP_SUCCEEDED_REFERENCED" | "LOOKUP_SUCCEEDED_UNREFERENCED" | "LOOKUP_FAILED" = "LOOKUP_FAILED";
      try {
        const ref = await prisma.attachment.findFirst({ where: { storageKey }, select: { id: true } });
        lookupState = ref ? "LOOKUP_SUCCEEDED_REFERENCED" : "LOOKUP_SUCCEEDED_UNREFERENCED";
      } catch (lookupError) {
        console.warn("[AttachmentAction] Ownership lookup failed; retaining active Blob for reconciliation:", lookupError);
      }
      if (lookupState === "LOOKUP_SUCCEEDED_UNREFERENCED") {
        await storage.deleteActiveFile(storageKey).catch(() => undefined);
      }
    }
    await releaseCommandReceipt(claim).catch(() => undefined);
    if (error instanceof DomainError) return { error: error.message };
    console.error("Finalize attachment upload error:", error);
    return { error: "Failed to finalize attachment. Please try again." };
  }

  revalidatePath("/ledger");
  return null;
}

export async function deleteAttachmentAction(
  _prevState: AttachmentState,
  formData: FormData
): Promise<AttachmentState> {
  const user = await requireManagementUser();
  if (!user.organizationId) return { error: "You are not assigned to an organization." };

  const attachmentId = formData.get("attachmentId")?.toString().trim();
  if (!attachmentId) return { error: "Attachment ID is required." };
  const idempotencyKey = getIdempotencyKey(formData, `delete-attachment-${attachmentId}`);
  const payload = { attachmentId };

  let receipt;
  try {
    receipt = await claimCommandReceipt<{ id: string }>(
      user.id,
      user.organizationId,
      "DELETE_ATTACHMENT",
      idempotencyKey,
      payload
    );
  } catch (error) {
    return { error: error instanceof DomainError ? error.message : "Could not claim attachment deletion." };
  }
  if (receipt.status === "COMPLETED") return null;
  const claim = receipt.claim;

  let attachment;
  try {
    attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        transaction: { select: { id: true, organizationId: true, deletedAt: true } },
        cashTransfer: { select: { id: true, organizationId: true, deletedAt: true } },
      },
    });
  } catch {
    await releaseCommandReceipt(claim).catch(() => undefined);
    return { error: "Failed to locate attachment. Please try again." };
  }

  const ownerOrgId = attachment?.transaction?.organizationId || attachment?.cashTransfer?.organizationId;
  if (!attachment || !ownerOrgId || ownerOrgId !== user.organizationId || attachment.transaction?.deletedAt || attachment.cashTransfer?.deletedAt) {
    await releaseCommandReceipt(claim).catch(() => undefined);
    return { error: "Attachment not found or access denied." };
  }

  let trashKey: string | null = null;
  let databaseDeleted = false;
  try {
    trashKey = await defaultAttachmentStorageService.moveToTrash(attachment.storageKey, {
      attachmentId: attachment.id,
      transactionId: attachment.transactionId,
      cashTransferId: attachment.cashTransferId,
    });

    await withTransientRetry(() =>
      processIdempotentCommand(
        user.id,
        user.organizationId!,
        "DELETE_ATTACHMENT",
        idempotencyKey,
        payload,
        async (tx) => {
          const scoped = await tx.attachment.findUnique({
            where: { id: attachment.id },
            include: {
              transaction: { select: { id: true, organizationId: true, deletedAt: true } },
              cashTransfer: { select: { id: true, organizationId: true, deletedAt: true } },
            },
          });
          if (!scoped) throw new ValidationError("Attachment was already deleted.");
          if (scoped.transaction?.organizationId !== user.organizationId && scoped.cashTransfer?.organizationId !== user.organizationId) {
            throw new ValidationError("Access denied.");
          }
          if (scoped.transaction?.deletedAt || scoped.cashTransfer?.deletedAt) {
            throw new ValidationError("Deleted-entry attachments cannot be accessed.");
          }

          const attachmentCount = scoped.transactionId
            ? await tx.attachment.count({ where: { transactionId: scoped.transactionId } })
            : await tx.attachment.count({ where: { cashTransferId: scoped.cashTransferId! } });
          if (attachmentCount <= 1) {
            throw new ValidationError("Cannot delete the final supporting attachment.");
          }

          const ownerCondition = scoped.transactionId
            ? Prisma.sql`"transactionId" = ${scoped.transactionId}`
            : Prisma.sql`"cashTransferId" = ${scoped.cashTransferId}`;
          const deleted = await tx.$executeRaw(
            Prisma.sql`
              DELETE FROM "Attachment"
              WHERE "id" = ${scoped.id}
                AND ${ownerCondition}
                AND (SELECT COUNT(*) FROM "Attachment" WHERE ${ownerCondition}) > 1
            `
          );
          if (deleted !== 1) throw new ValidationError("Cannot delete the final supporting attachment.");

          await createAuditLog({
            userId: user.id,
            organizationId: user.organizationId,
            role: user.role,
            action: AuditAction.DELETED_ATTACHMENT,
            entityType: "Attachment",
            entityId: scoped.id,
            metadata: {
              transactionId: scoped.transactionId,
              cashTransferId: scoped.cashTransferId,
              originalName: scoped.originalName,
            },
            tx,
          });

          return { result: { id: scoped.id }, resultEntityType: "Attachment", resultEntityId: scoped.id };
        },
        { claimToken: claim.claimToken }
      )
    );
    databaseDeleted = true;
    if (trashKey) {
      await defaultAttachmentStorageService.permanentlyDelete(trashKey).catch((err) => {
        console.warn("Physical trash deletion failed after DB deletion; retained DB_DELETED manifest for reconciliation:", err);
      });
    }
  } catch (error) {
    if (!databaseDeleted && trashKey) {
      await defaultAttachmentStorageService.restoreFromTrash(trashKey, attachment.storageKey).catch(() => undefined);
    }
    await releaseCommandReceipt(claim).catch(() => undefined);
    if (error instanceof DomainError) return { error: error.message };
    console.error("Delete attachment error:", error);
    return { error: "Failed to delete attachment. Please try again." };
  }

  revalidatePath("/ledger");
  return null;
}
