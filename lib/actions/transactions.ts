"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireManagementUser } from "../auth/require-auth";
import { parsePesoToCents } from "../domain/money";
import { parseStrictDate } from "../domain/query";
import { validateAndReadAttachmentFile } from "../domain/attachments";
import { CashAccount, TransactionType } from "@prisma/client";
import {
  createTransactionService,
  deleteTransactionService,
  editTransactionService,
} from "../application/transactions";
import { DomainError } from "../domain/errors";

type TxActionState = { error?: string; fieldErrors?: Record<string, string[]> } | null;

function getAttachmentFile(formData: FormData): File {
  const file = formData.get("attachment");
  if (!(file instanceof File) || file.size <= 0) {
    throw new DomainError("Receipt attachment file is required.");
  }
  return file;
}

const transactionSchema = z.object({
  termId: z.string().trim().min(1, "Term ID is required."),
  type: z.nativeEnum(TransactionType, { message: "Transaction type is required." }),
  transactionDate: z.string().trim().min(1, "Transaction date is required."),
  amount: z.string().trim().min(1, "Amount is required."),
  cashAccount: z.nativeEnum(CashAccount, { message: "Cash account is required." }),
  categoryId: z.string().trim().min(1, "Category is required."),
  documentNumber: z.string().trim().max(100, "Document number must be under 100 characters.").optional(),
  counterpartyName: z.string().trim().min(1, "Payor / Payee is required.").max(200, "Payor / Payee must be under 200 characters."),
  description: z.string().trim().min(1, "Description is required.").max(500, "Description must be under 500 characters."),
  referenceDescription: z.string().trim().min(1, "Reference description is required.").max(500, "Reference description must be under 500 characters."),
  eventActivityName: z.string().trim().min(1, "Event / Activity name is required.").max(200, "Event / Activity name must be under 200 characters."),
  idempotencyKey: z.string().trim().min(1, "Idempotency key is required."),
});

function transactionFields(formData: FormData) {
  return {
    termId: formData.get("termId")?.toString() || "",
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
    idempotencyKey: formData.get("idempotencyKey")?.toString() || "",
  };
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
    amountCents = parsePesoToCents(validation.data.amount);
    transactionDate = parseStrictDate(validation.data.transactionDate);
    file = getAttachmentFile(formData);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    return { error: "Please fix the transaction details and attachment." };
  }

  const fileValidation = await validateAndReadAttachmentFile(file);
  if (!fileValidation.success) {
    return { error: fileValidation.error };
  }
  const validatedFile = fileValidation.data;

  try {
    await createTransactionService(user, {
      termId: validation.data.termId,
      type: validation.data.type,
      transactionDate,
      amountCents,
      cashAccount: validation.data.cashAccount,
      categoryId: validation.data.categoryId,
      documentNumber: validation.data.documentNumber,
      counterpartyName: validation.data.counterpartyName,
      description: validation.data.description,
      referenceDescription: validation.data.referenceDescription,
      eventActivityName: validation.data.eventActivityName,
      idempotencyKey: validation.data.idempotencyKey,
      attachment: {
        originalName: validatedFile.originalName,
        mimeType: validatedFile.mimeType,
        sizeBytes: validatedFile.sizeBytes,
        buffer: Buffer.from(validatedFile.buffer),
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    console.error("Create transaction error:", error);
    return { error: "Failed to record transaction. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  redirect("/ledger");
}

const editTransactionSchema = transactionSchema.extend({
  id: z.string().trim().min(1, "Transaction ID is required."),
  version: z.string().trim().min(1, "Version is required.").refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1, "Version must be a positive integer."),
});

export async function editTransactionAction(
  _prevState: TxActionState,
  formData: FormData
): Promise<TxActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) return { error: "You are not assigned to an organization." };

  const rawVersion = formData.get("version")?.toString();
  if (!rawVersion || !rawVersion.trim()) {
    return { error: "Missing or malformed transaction version." };
  }

  const rawFields = {
    ...transactionFields(formData),
    id: formData.get("id")?.toString() || "",
    version: rawVersion.trim(),
  };

  const validation = editTransactionSchema.safeParse(rawFields);
  if (!validation.success) {
    return { error: "Please fix the validation errors below.", fieldErrors: validation.error.flatten().fieldErrors };
  }

  try {
    const amountCents = parsePesoToCents(validation.data.amount);
    const transactionDate = parseStrictDate(validation.data.transactionDate);
    const expectedVersion = parseInt(validation.data.version, 10);

    await editTransactionService(user, {
      id: validation.data.id,
      expectedVersion,
      type: validation.data.type,
      transactionDate,
      amountCents,
      cashAccount: validation.data.cashAccount,
      categoryId: validation.data.categoryId,
      documentNumber: validation.data.documentNumber,
      counterpartyName: validation.data.counterpartyName,
      description: validation.data.description,
      referenceDescription: validation.data.referenceDescription,
      eventActivityName: validation.data.eventActivityName,
      idempotencyKey: validation.data.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    console.error("Edit transaction error:", error);
    return { error: "Failed to edit transaction. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  redirect("/ledger");
}

const deleteTransactionSchema = z.object({
  id: z.string().trim().min(1, "Transaction ID is required."),
  deleteReason: z.string().trim().min(1, "Deletion reason is required.").max(500, "Deletion reason must be under 500 characters."),
  version: z.string().trim().min(1, "Version is required.").regex(/^\d+$/, "Version must be a positive integer."),
  idempotencyKey: z.string().trim().min(1, "Idempotency key is required."),
});

export async function softDeleteTransactionAction(
  _prevState: TxActionState,
  formData: FormData
): Promise<TxActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) return { error: "You are not assigned to an organization." };

  const rawVersion = formData.get("version")?.toString();
  if (!rawVersion || !rawVersion.trim()) {
    return { error: "Missing or malformed transaction version." };
  }

  const validation = deleteTransactionSchema.safeParse({
    id: formData.get("id")?.toString() || "",
    deleteReason: formData.get("deleteReason")?.toString() || "",
    version: rawVersion.trim(),
    idempotencyKey: formData.get("idempotencyKey")?.toString() || "",
  });
  if (!validation.success) {
    return { error: "Please fix the validation errors below.", fieldErrors: validation.error.flatten().fieldErrors };
  }

  try {
    const expectedVersion = parseInt(validation.data.version, 10);
    await deleteTransactionService(user, {
      id: validation.data.id,
      expectedVersion,
      deleteReason: validation.data.deleteReason,
      idempotencyKey: validation.data.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    console.error("Delete transaction error:", error);
    return { error: "Failed to delete transaction. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  redirect("/ledger");
}
