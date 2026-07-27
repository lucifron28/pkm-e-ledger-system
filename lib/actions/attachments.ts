"use server";

import { revalidatePath } from "next/cache";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "../db/prisma";
import { requireManagementUser } from "../auth/require-auth";
import { createAuditLog } from "../data/audit-log";
import { getTransactionForEdit } from "../data/transactions";
import { AuditAction } from "@prisma/client";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"];

export type AttachmentState = { error?: string } | null;

export async function uploadAttachmentAction(
  prevState: AttachmentState,
  formData: FormData
): Promise<AttachmentState> {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return { error: "You are not assigned to an organization." };
  }

  const transactionId = formData.get("transactionId")?.toString();
  if (!transactionId) return { error: "Transaction ID is required." };

  const tx = await getTransactionForEdit(transactionId);
  if (!tx) return { error: "Transaction not found." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "File is required." };
  if (file.size > MAX_FILE_SIZE) return { error: "File must be under 10 MB." };
  if (!ALLOWED_MIME.includes(file.type)) {
    return { error: "Only JPEG, PNG, and PDF files are allowed." };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const storedName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = path.join(UPLOADS_DIR, storedName);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storagePath, buffer);

    await prisma.$transaction(async (txDb) => {
      const created = await txDb.attachment.create({
        data: {
          transactionId,
          uploadedById: user.id,
          originalName: file.name,
          storedName,
          storagePath,
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
        entityId: created.id,
        metadata: { transactionId, originalName: file.name, sizeBytes: file.size },
        tx: txDb,
      });
    });
  } catch (error) {
    try { await unlink(storagePath); } catch {
      /* best effort */
    }
    if (error instanceof Error && error.message.includes("P2002")) {
      return { error: "Failed to upload attachment. Please try again." };
    }
    console.error("Upload attachment error:", error);
    return { error: "Failed to upload attachment. Please try again." };
  }

  revalidatePath("/ledger");
  revalidatePath("/dashboard");
  return null;
}

export async function deleteAttachmentAction(
  prevState: AttachmentState,
  formData: FormData
): Promise<AttachmentState> {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return { error: "You are not assigned to an organization." };
  }

  const attachmentId = formData.get("attachmentId")?.toString();
  if (!attachmentId) return { error: "Attachment ID is required." };

  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      transaction: { select: { organizationId: true, id: true } },
    },
  });
  if (!attachment || attachment.transaction.organizationId !== user.organizationId) {
    return { error: "Attachment not found." };
  }

  try {
    await unlink(attachment.storagePath);
  } catch {
    /* file already missing — continue */
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.attachment.delete({ where: { id: attachmentId } });

      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.DELETED_ATTACHMENT,
        entityType: "Attachment",
        entityId: attachmentId,
        metadata: { transactionId: attachment.transaction.id, originalName: attachment.originalName },
        tx,
      });
    });
  } catch (error) {
    console.error("Delete attachment error:", error);
    return { error: "Failed to delete attachment. Please try again." };
  }

  revalidatePath("/ledger");
  return null;
}
