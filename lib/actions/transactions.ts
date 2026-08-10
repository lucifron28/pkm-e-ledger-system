"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireManagementUser } from "../auth/require-auth";
import { parsePesoToCents } from "../domain/money";
import { parseStrictDate, parseStrictVersion, strictVersionSchema } from "../domain/query";
import { validateAndReadAttachmentFile } from "../domain/attachments";
import { TransactionType } from "@prisma/client";
import {
  createTransactionService,
  deleteTransactionService,
  editTransactionService,
} from "../application/transactions";
import { DomainError } from "../domain/errors";

import { forceTransactionType } from "../domain/transactions";
import { createTransactionSchema, editTransactionSchema } from "../domain/financial-schemas";

type TxActionState = { error?: string; fieldErrors?: Record<string, string[]> } | null;

function getAttachmentFile(formData: FormData): File {
  const file = formData.get("attachment");
  if (!(file instanceof File) || file.size <= 0) {
    throw new DomainError("Receipt attachment file is required.");
  }
  return file;
}

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

  const validation = createTransactionSchema.safeParse(transactionFields(formData));
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


export async function createIncomeTransactionAction(
  prevState: TxActionState,
  formData: FormData
): Promise<TxActionState> {
  return createTransactionAction(prevState, forceTransactionType(formData, TransactionType.INCOME));
}

export async function createExpenseTransactionAction(
  prevState: TxActionState,
  formData: FormData
): Promise<TxActionState> {
  return createTransactionAction(prevState, forceTransactionType(formData, TransactionType.EXPENSE));
}


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
    return { error: "Please fix the validation errors below.", fieldErrors: validation.error.flatten().fieldErrors as Record<string, string[]> };
  }

  try {
    const amountCents = parsePesoToCents(validation.data.amount);
    const transactionDate = parseStrictDate(validation.data.transactionDate);
    const expectedVersion = parseStrictVersion(validation.data.version);

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
  version: strictVersionSchema,
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
    return { error: "Please fix the validation errors below.", fieldErrors: validation.error.flatten().fieldErrors as Record<string, string[]> };
  }

  try {
    const expectedVersion = parseStrictVersion(validation.data.version);
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
