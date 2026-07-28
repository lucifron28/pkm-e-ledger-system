"use server";

import { revalidatePath } from "next/cache";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "../db/prisma";
import { requireManagementUser } from "../auth/require-auth";
import { createAuditLog } from "../data/audit-log";
import { validateAttachmentFile } from "../domain/attachments";
import { AuditAction } from "@prisma/client";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export type AttachmentState = { error?: string } | null;

async function persistUploadedFile(file: File) {
  const extension = file.name.split(".").pop()!.toLowerCase();
  const storedName = `${crypto.randomUUID()}.${extension}`;
  const storagePath = path.join(UPLOADS_DIR, storedName);
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(storagePath, Buffer.from(await file.arrayBuffer()));
  return { storedName, storagePath };
}

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

  const fileError = validateAttachmentFile(file);
  if (fileError) return { error: fileError };

  let fileInfo: { storedName: string; storagePath: string } | null = null;
  try {
    fileInfo = await persistUploadedFile(file);
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { id: transactionId, organizationId: user.organizationId!, deletedAt: null },
        select: { id: true },
      });
      if (!transaction) throw new Error("Transaction not found.");

      const attachment = await tx.attachment.create({
        data: {
          transactionId,
          uploadedById: user.id,
          originalName: file.name,
          storedName: fileInfo!.storedName,
          storagePath: fileInfo!.storagePath,
          mimeType: file.type,
          sizeBytes: file.size,
        },
      });
      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.UPLOADED_ATTACHMENT,
        entityType: "Attachment",
        entityId: attachment.id,
        metadata: { transactionId, originalName: file.name, sizeBytes: file.size },
        tx,
      });
    });
  } catch (error) {
    if (fileInfo) {
      try { await unlink(fileInfo.storagePath); } catch { /* best effort cleanup */ }
    }
    if (error instanceof Error && error.message === "Transaction not found.") {
      return { error: error.message };
    }
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

  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      transaction: { organizationId: user.organizationId, deletedAt: null },
    },
    select: {
      id: true,
      originalName: true,
      storagePath: true,
      transactionId: true,
    },
  });
  if (!attachment) return { error: "Attachment not found." };

  let fileBuffer: Buffer;
  try {
    fileBuffer = await readFile(attachment.storagePath);
    await unlink(attachment.storagePath);
  } catch {
    return { error: "Attachment file is unavailable." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const scopedAttachment = await tx.attachment.findFirst({
        where: {
          id: attachmentId,
          transaction: { organizationId: user.organizationId!, deletedAt: null },
        },
        select: { id: true },
      });
      if (!scopedAttachment) throw new Error("Attachment not found.");

      await tx.attachment.delete({ where: { id: scopedAttachment.id } });
      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.DELETED_ATTACHMENT,
        entityType: "Attachment",
        entityId: attachmentId,
        metadata: { transactionId: attachment.transactionId, originalName: attachment.originalName },
        tx,
      });
    });
  } catch (error) {
    try {
      await mkdir(UPLOADS_DIR, { recursive: true });
      await writeFile(attachment.storagePath, fileBuffer);
    } catch (restoreError) {
      console.error("Failed to restore attachment after database failure:", restoreError);
    }
    if (error instanceof Error && error.message === "Attachment not found.") {
      return { error: error.message };
    }
    console.error("Delete attachment error:", error);
    return { error: "Failed to delete attachment. Please try again." };
  }

  revalidatePath("/ledger");
  return null;
}
