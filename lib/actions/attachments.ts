"use server";

import path from "path";
import { revalidatePath } from "next/cache";
import { prisma } from "../db/prisma";
import { requireManagementUser } from "../auth/require-auth";
import { createAuditLog } from "../data/audit-log";
import { validateAndReadAttachmentFile } from "../domain/attachments";
import { AuditAction } from "@prisma/client";
import { defaultAttachmentStorageService } from "../infrastructure/storage/attachment-store";
import { DomainError, ValidationError } from "../domain/errors";

export type AttachmentState = { error?: string } | null;

export async function uploadAttachmentAction(
  _prevState: AttachmentState,
  formData: FormData
): Promise<AttachmentState> {
  const user = await requireManagementUser();
  if (!user.organizationId) return { error: "You are not assigned to an organization." };

  const transactionId = formData.get("transactionId")?.toString();
  const file = formData.get("file");
  if (!transactionId) return { error: "Transaction ID is required." };
  if (!(file instanceof File)) return { error: "File is required." };

  const validation = await validateAndReadAttachmentFile(file);
  if (!validation.success) {
    return { error: validation.error };
  }
  const validated = validation.data;

  // 1. Stage file under temporary random key
  const staged = await defaultAttachmentStorageService.stageUpload(
    validated.buffer,
    validated.originalName,
    validated.mimeType
  );

  let committedName: string | null = null;
  try {
    // 2. Commit file from staging to active store
    const committed = await defaultAttachmentStorageService.commitUpload(staged.stageId, staged.extension);
    committedName = committed.storedName;

    // 3. Atomically record metadata in DB transaction
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { id: transactionId, organizationId: user.organizationId!, deletedAt: null },
        select: { id: true },
      });

      if (!transaction) {
        throw new ValidationError("Transaction not found or access denied.");
      }

      const attachment = await tx.attachment.create({
        data: {
          transactionId: transaction.id,
          uploadedById: user.id,
          originalName: validated.originalName,
          storedName: committed.storedName,
          storagePath: committed.storagePath,
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
          transactionId: transaction.id,
          originalName: validated.originalName,
          sizeBytes: validated.sizeBytes,
        },
        tx,
      });
    });
  } catch (error) {
    // Compensation: discard staged or committed file on error
    await defaultAttachmentStorageService.discardStagedUpload(staged.stageId, staged.extension);
    if (committedName) {
      try {
        const activePath = defaultAttachmentStorageService.resolveActivePath(committedName);
        await defaultAttachmentStorageService.permanentlyDelete(path.basename(activePath));
      } catch {
        /* best effort */
      }
    }
    if (error instanceof DomainError) return { error: error.message };
    console.error("Upload attachment error:", error);
    return { error: "Failed to upload attachment. Please try again." };
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

  const attachmentId = formData.get("attachmentId")?.toString();
  if (!attachmentId) return { error: "Attachment ID is required." };

  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      transaction: {
        select: {
          id: true,
          organizationId: true,
          deletedAt: true,
          _count: {
            select: { attachments: true },
          },
        },
      },
      cashTransfer: {
        select: {
          id: true,
          organizationId: true,
          deletedAt: true,
          _count: {
            select: { attachments: true },
          },
        },
      },
    },
  });

  if (!attachment) return { error: "Attachment not found." };

  const ownerOrgId = attachment.transaction?.organizationId || attachment.cashTransfer?.organizationId;
  const isDeleted = Boolean(attachment.transaction?.deletedAt || attachment.cashTransfer?.deletedAt);

  if (!ownerOrgId || user.organizationId !== ownerOrgId || isDeleted) {
    return { error: "Access denied." };
  }

  // Single attachment restriction for active transaction/transfer
  if (attachment.transaction && attachment.transaction._count.attachments <= 1) {
    return { error: "Cannot delete attachment. Transactions must retain at least one supporting receipt." };
  }
  if (attachment.cashTransfer && attachment.cashTransfer._count.attachments <= 1) {
    return { error: "Cannot delete attachment. Cash transfers must retain at least one supporting document." };
  }

  // 1. Move file to temporary trash storage before DB transaction
  let trashKey: string | null = null;
  try {
    trashKey = await defaultAttachmentStorageService.moveToTrash(attachment.storedName);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    return { error: "Failed to move attachment file to trash." };
  }

  try {
    // 2. Perform DB deletion and audit log inside transaction
    await prisma.$transaction(async (tx) => {
      await tx.attachment.delete({
        where: { id: attachment.id },
      });

      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.DELETED_ATTACHMENT,
        entityType: "Attachment",
        entityId: attachment.id,
        metadata: {
          transactionId: attachment.transactionId,
          cashTransferId: attachment.cashTransferId,
          originalName: attachment.originalName,
        },
        tx,
      });
    });

    // 3. Permanently delete from trash only after DB commit succeeds
    if (trashKey) {
      await defaultAttachmentStorageService.permanentlyDelete(trashKey);
    }
  } catch (error) {
    // 4. Compensation: restore file from trash if DB transaction fails
    if (trashKey) {
      try {
        await defaultAttachmentStorageService.restoreFromTrash(trashKey, attachment.storedName);
      } catch {
        /* best effort */
      }
    }
    if (error instanceof DomainError) return { error: error.message };
    console.error("Delete attachment error:", error);
    return { error: "Failed to delete attachment. Please try again." };
  }

  revalidatePath("/ledger");
  return null;
}
