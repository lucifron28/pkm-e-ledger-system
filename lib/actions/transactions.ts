"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireManagementUser } from "../auth/require-auth";
import { createAuditLog } from "../data/audit-log";
import { parsePesoToCents, PesoParseError } from "../data/money";
import { calculateAccountBalances, hasNegativeAccountBalance } from "../domain/financial";
import { validateAttachmentFile } from "../domain/attachments";
import { AuditAction, CashAccount, Prisma, TransactionType } from "@prisma/client";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

type TxActionState = { error?: string; fieldErrors?: Record<string, string[]> } | null;

class TransactionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionValidationError";
  }
}

function parseAmount(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) throw new TransactionValidationError("Amount is required.");
  try {
    const cents = parsePesoToCents(trimmed);
    if (cents <= 0) throw new TransactionValidationError("Amount must be positive.");
    return cents;
  } catch (error) {
    if (error instanceof PesoParseError || error instanceof TransactionValidationError) {
      throw new TransactionValidationError(error.message);
    }
    throw error;
  }
}

function parseTransactionDate(value: string): Date {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new TransactionValidationError("Transaction date is invalid.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new TransactionValidationError("Transaction date is invalid.");
  }
  return date;
}

function getAttachmentFile(formData: FormData): File {
  const file = formData.get("attachment");
  if (!(file instanceof File) || file.size === 0) {
    throw new TransactionValidationError("One receipt attachment is required.");
  }
  const error = validateAttachmentFile(file);
  if (error) throw new TransactionValidationError(error);
  return file;
}

async function writeAttachmentFile(file: File) {
  const extension = file.name.split(".").pop()!.toLowerCase();
  const storedName = `${crypto.randomUUID()}.${extension}`;
  const storagePath = path.join(UPLOADS_DIR, storedName);
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(storagePath, Buffer.from(await file.arrayBuffer()));
  return { storedName, storagePath, extension };
}

function actionError(error: unknown, fallback: string): TxActionState {
  if (error instanceof TransactionValidationError) return { error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(fallback, error);
    return { error: fallback };
  }
  console.error(fallback, error);
  return { error: fallback };
}

const transactionSchema = z.object({
  type: z.nativeEnum(TransactionType, { message: "Transaction type is required." }),
  transactionDate: z.string().trim().min(1, "Transaction date is required."),
  amount: z.string().trim().min(1, "Amount is required."),
  cashAccount: z.nativeEnum(CashAccount, { message: "Cash account is required." }),
  categoryId: z.string().trim().min(1, "Category is required."),
  documentNumber: z.string().trim().optional(),
  counterpartyName: z.string().trim().min(1, "Payor / Payee is required."),
  description: z.string().trim().min(1, "Description is required."),
  referenceDescription: z.string().trim().min(1, "Reference description is required."),
  eventActivityName: z.string().trim().min(1, "Event / Activity is required."),
});

function transactionFields(formData: FormData) {
  return {
    type: formData.get("type")?.toString() || "",
    transactionDate: formData.get("transactionDate")?.toString() || "",
    amount: formData.get("amount")?.toString() || "",
    cashAccount: formData.get("cashAccount")?.toString() || "",
    categoryId: formData.get("categoryId")?.toString() || "",
    documentNumber: formData.get("documentNumber")?.toString() || "",
    counterpartyName: formData.get("counterpartyName")?.toString() || "",
    description: formData.get("description")?.toString() || "",
    referenceDescription: formData.get("referenceDescription")?.toString() || "",
    eventActivityName: formData.get("eventActivityName")?.toString() || "",
  };
}

type FinancialRow = { type: TransactionType; amountCents: number; cashAccount: CashAccount };

async function getProjectedBalances(
  tx: Prisma.TransactionClient,
  organizationId: string,
  termId: string,
  openingCashOnHandCents: number,
  openingCashInBankCents: number,
  replacement?: FinancialRow & { id?: string }
) {
  const rows = await tx.transaction.findMany({
    where: { organizationId, termId, deletedAt: null },
    select: { id: true, type: true, amountCents: true, cashAccount: true },
  });
  const projectedRows = replacement
    ? rows.filter((row) => row.id !== replacement.id).map(({ type, amountCents, cashAccount }) => ({ type, amountCents, cashAccount }))
    : rows.map(({ type, amountCents, cashAccount }) => ({ type, amountCents, cashAccount }));
  if (replacement) projectedRows.push(replacement);
  return calculateAccountBalances(openingCashOnHandCents, openingCashInBankCents, projectedRows);
}

function insufficientFundsError(): TransactionValidationError {
  return new TransactionValidationError(
    "Transaction failed: Insufficient funds in Cash on Hand/Bank balance."
  );
}

export async function createTransactionAction(
  _prevState: TxActionState,
  formData: FormData
): Promise<TxActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) return { error: "You are not assigned to an organization." };

  const validation = transactionSchema.safeParse(transactionFields(formData));
  if (!validation.success) {
    return { error: "Please fix the validation errors below.", fieldErrors: validation.error.flatten().fieldErrors };
  }

  let amountCents: number;
  let transactionDate: Date;
  let file: File;
  try {
    amountCents = parseAmount(validation.data.amount);
    transactionDate = parseTransactionDate(validation.data.transactionDate);
    file = getAttachmentFile(formData);
  } catch (error) {
    return actionError(error, "Please fix the transaction details and attachment.");
  }

  let fileInfo: { storedName: string; storagePath: string; extension: string } | null = null;
  try {
    fileInfo = await writeAttachmentFile(file);
    await prisma.$transaction(async (tx) => {
      const term = await tx.academicTerm.findFirst({
        where: { organizationId: user.organizationId!, active: true },
      });
      if (!term) throw new TransactionValidationError("No active academic term configured.");

      const category = await tx.transactionCategory.findFirst({
        where: { id: validation.data.categoryId, type: validation.data.type, active: true },
      });
      if (!category) throw new TransactionValidationError("Invalid or inactive category for this transaction type.");

      const projected = await getProjectedBalances(
        tx,
        user.organizationId!,
        term.id,
        term.openingCashOnHandCents,
        term.openingCashInBankCents,
        { type: validation.data.type, amountCents, cashAccount: validation.data.cashAccount }
      );
      if (hasNegativeAccountBalance(projected)) throw insufficientFundsError();

      const transaction = await tx.transaction.create({
        data: {
          organizationId: user.organizationId!,
          termId: term.id,
          type: validation.data.type,
          transactionDate,
          amountCents,
          cashAccount: validation.data.cashAccount,
          categoryId: category.id,
          documentNumber: validation.data.documentNumber?.trim() || null,
          counterpartyName: validation.data.counterpartyName.trim(),
          description: validation.data.description.trim(),
          referenceDescription: validation.data.referenceDescription.trim(),
          eventActivityName: validation.data.eventActivityName.trim(),
          recordedByUserId: user.id,
        },
      });

      const attachment = await tx.attachment.create({
        data: {
          transactionId: transaction.id,
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
        action: validation.data.type === TransactionType.INCOME ? AuditAction.ADDED_INCOME : AuditAction.ADDED_EXPENSE,
        entityType: "Transaction",
        entityId: transaction.id,
        metadata: { type: transaction.type, cashAccount: transaction.cashAccount, amountCents },
        tx,
      });
      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.UPLOADED_ATTACHMENT,
        entityType: "Attachment",
        entityId: attachment.id,
        metadata: { transactionId: transaction.id, originalName: file.name, sizeBytes: file.size },
        tx,
      });
    });
  } catch (error) {
    if (fileInfo) {
      try { await unlink(fileInfo.storagePath); } catch { /* best effort cleanup */ }
    }
    return actionError(error, "Failed to record transaction. Please try again.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  redirect("/ledger");
}

const editTransactionSchema = transactionSchema.extend({ id: z.string().trim().min(1) });

export async function editTransactionAction(
  _prevState: TxActionState,
  formData: FormData
): Promise<TxActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) return { error: "You are not assigned to an organization." };
  const validation = editTransactionSchema.safeParse({ ...transactionFields(formData), id: formData.get("id")?.toString() || "" });
  if (!validation.success) {
    return { error: "Please fix the validation errors below.", fieldErrors: validation.error.flatten().fieldErrors };
  }

  let amountCents: number;
  let transactionDate: Date;
  try {
    amountCents = parseAmount(validation.data.amount);
    transactionDate = parseTransactionDate(validation.data.transactionDate);
  } catch (error) {
    return actionError(error, "Please fix the transaction details.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findFirst({
        where: { id: validation.data.id, organizationId: user.organizationId! },
      });
      if (!existing) throw new TransactionValidationError("Transaction not found.");
      if (existing.deletedAt) throw new TransactionValidationError("Cannot edit a deleted transaction.");

      const term = await tx.academicTerm.findFirst({
        where: { id: existing.termId, organizationId: user.organizationId! },
      });
      if (!term) throw new TransactionValidationError("Transaction term not found.");

      const category = await tx.transactionCategory.findFirst({
        where: { id: validation.data.categoryId, type: validation.data.type, active: true },
      });
      if (!category) throw new TransactionValidationError("Invalid or inactive category for this transaction type.");

      const projected = await getProjectedBalances(
        tx,
        user.organizationId!,
        term.id,
        term.openingCashOnHandCents,
        term.openingCashInBankCents,
        { id: existing.id, type: validation.data.type, amountCents, cashAccount: validation.data.cashAccount }
      );
      if (hasNegativeAccountBalance(projected)) throw insufficientFundsError();

      await tx.transaction.update({
        where: { id: existing.id },
        data: {
          type: validation.data.type,
          transactionDate,
          amountCents,
          cashAccount: validation.data.cashAccount,
          categoryId: category.id,
          documentNumber: validation.data.documentNumber?.trim() || null,
          counterpartyName: validation.data.counterpartyName.trim(),
          description: validation.data.description.trim(),
          referenceDescription: validation.data.referenceDescription.trim(),
          eventActivityName: validation.data.eventActivityName.trim(),
          updatedByUserId: user.id,
        },
      });

      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.EDITED_TRANSACTION,
        entityType: "Transaction",
        entityId: existing.id,
        metadata: {
          before: { type: existing.type, amountCents: existing.amountCents, cashAccount: existing.cashAccount, categoryId: existing.categoryId },
          after: { type: validation.data.type, amountCents, cashAccount: validation.data.cashAccount, categoryId: category.id },
        },
        tx,
      });
    });
  } catch (error) {
    return actionError(error, "Failed to edit transaction. Please try again.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  redirect("/ledger");
}

const deleteTransactionSchema = z.object({
  id: z.string().trim().min(1),
  deleteReason: z.string().trim().min(1, "Deletion reason is required."),
});

export async function softDeleteTransactionAction(
  _prevState: TxActionState,
  formData: FormData
): Promise<TxActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) return { error: "You are not assigned to an organization." };
  const validation = deleteTransactionSchema.safeParse({
    id: formData.get("id")?.toString() || "",
    deleteReason: formData.get("deleteReason")?.toString() || "",
  });
  if (!validation.success) {
    return { error: "Please fix the validation errors below.", fieldErrors: validation.error.flatten().fieldErrors };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findFirst({
        where: { id: validation.data.id, organizationId: user.organizationId! },
      });
      if (!existing) throw new TransactionValidationError("Transaction not found.");
      if (existing.deletedAt) throw new TransactionValidationError("Transaction is already deleted.");

      const term = await tx.academicTerm.findFirst({
        where: { id: existing.termId, organizationId: user.organizationId! },
      });
      if (!term) throw new TransactionValidationError("Transaction term not found.");

      const projected = await getProjectedBalances(
        tx,
        user.organizationId!,
        term.id,
        term.openingCashOnHandCents,
        term.openingCashInBankCents,
        { id: existing.id, type: existing.type, amountCents: 0, cashAccount: existing.cashAccount }
      );
      if (hasNegativeAccountBalance(projected)) throw insufficientFundsError();

      await tx.transaction.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), deletedByUserId: user.id, deleteReason: validation.data.deleteReason.trim() },
      });
      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.DELETED_TRANSACTION,
        entityType: "Transaction",
        entityId: existing.id,
        metadata: { deleteReason: validation.data.deleteReason.trim(), type: existing.type, amountCents: existing.amountCents, cashAccount: existing.cashAccount },
        tx,
      });
    });
  } catch (error) {
    return actionError(error, "Failed to delete transaction. Please try again.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  redirect("/ledger");
}
