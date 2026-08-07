"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireManagementUser } from "../auth/require-auth";
import { createCashTransferService, editCashTransferService, deleteCashTransferService } from "../application/transfers";
import { CashAccount } from "@prisma/client";
import { parsePesoToCents } from "../domain/money";
import { parseStrictDate, parseStrictVersion, strictVersionSchema } from "../domain/query";
import { validateAndReadAttachmentFile } from "../domain/attachments";
import { DomainError } from "../domain/errors";

function getAttachmentFile(formData: FormData): File {
  const file = formData.get("attachment");
  if (!(file instanceof File) || file.size <= 0) {
    throw new DomainError("Supporting document attachment file is required for cash transfers.");
  }
  return file;
}

type TransferActionState = { error?: string; fieldErrors?: Record<string, string[]> } | null;
const transferBaseSchema = z.object({
  fromAccount: z.nativeEnum(CashAccount, { message: "Source cash account is required." }),
  toAccount: z.nativeEnum(CashAccount, { message: "Destination cash account is required." }),
  transferDate: z.string().trim().min(1, "Transfer date is required."),
  amount: z.string().trim().min(1, "Amount is required."),
  documentNumber: z.string().trim().max(100, "Document number must be under 100 characters.").optional(),
  description: z.string().trim().min(1, "Description is required.").max(500, "Description must be under 500 characters."),
  referenceDescription: z.string().trim().min(1, "Reference description is required.").max(500, "Reference description must be under 500 characters."),
  eventActivityName: z.string().trim().max(200, "Event / Activity name must be under 200 characters.").optional(),
});

const createTransferSchema = transferBaseSchema.extend({
  termId: z.string().trim().min(1, "Term ID is required."),
  idempotencyKey: z.string().trim().min(1, "Idempotency key is required."),
});

export const editTransferSchema = transferBaseSchema.extend({
  id: z.string().trim().min(1, "Transfer ID is required."),
  version: strictVersionSchema,
  idempotencyKey: z.string().trim().min(1, "Idempotency key is required."),
});

function transferFields(formData: FormData) {
  return {
    termId: formData.get("termId")?.toString() || "",
    fromAccount: formData.get("fromAccount")?.toString() || "",
    toAccount: formData.get("toAccount")?.toString() || "",
    transferDate: formData.get("transferDate")?.toString() || "",
    amount: formData.get("amount")?.toString() || "",
    documentNumber: formData.get("documentNumber")?.toString() || "",
    description: formData.get("description")?.toString() || "",
    referenceDescription: formData.get("referenceDescription")?.toString() || "",
    eventActivityName: formData.get("eventActivityName")?.toString() || "",
    idempotencyKey: formData.get("idempotencyKey")?.toString() || "",
  };
}

export async function createCashTransferAction(
  _prevState: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) return { error: "You are not assigned to an organization." };

  const validation = createTransferSchema.safeParse(transferFields(formData));
  if (!validation.success) {
    return { error: "Please fix the validation errors below.", fieldErrors: validation.error.flatten().fieldErrors };
  }

  let amountCents: number;
  let transferDate: Date;
  let file: File;
  try {
    amountCents = parsePesoToCents(validation.data.amount);
    transferDate = parseStrictDate(validation.data.transferDate);
    file = getAttachmentFile(formData);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    return { error: "Please fix the cash transfer details and attachment." };
  }

  const fileValidation = await validateAndReadAttachmentFile(file);
  if (!fileValidation.success) {
    return { error: fileValidation.error };
  }
  const validatedFile = fileValidation.data;

  try {
    await createCashTransferService(user, {
      termId: validation.data.termId,
      fromAccount: validation.data.fromAccount,
      toAccount: validation.data.toAccount,
      amountCents,
      transferDate,
      documentNumber: validation.data.documentNumber,
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
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    console.error("Cash transfer creation error:", error);
    return { error: "Failed to record cash transfer. Please try again." };
  }
  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  redirect("/ledger");
}

export async function editCashTransferAction(
  _prevState: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) return { error: "You are not assigned to an organization." };

  const rawVersion = formData.get("version")?.toString();
  if (!rawVersion || !rawVersion.trim()) {
    return { error: "Missing or malformed transfer version." };
  }

  const rawFields = {
    ...transferFields(formData),
    id: formData.get("id")?.toString() || "",
    version: rawVersion.trim(),
  };

  const validation = editTransferSchema.safeParse(rawFields);
  if (!validation.success) {
    return { error: "Please fix the validation errors below.", fieldErrors: validation.error.flatten().fieldErrors as Record<string, string[]> };
  }

  try {
    const amountCents = parsePesoToCents(validation.data.amount);
    const transferDate = parseStrictDate(validation.data.transferDate);
    const expectedVersion = parseStrictVersion(validation.data.version);

    await editCashTransferService(user, {
      id: validation.data.id,
      expectedVersion,
      fromAccount: validation.data.fromAccount,
      toAccount: validation.data.toAccount,
      amountCents,
      transferDate,
      documentNumber: validation.data.documentNumber,
      description: validation.data.description,
      referenceDescription: validation.data.referenceDescription,
      eventActivityName: validation.data.eventActivityName,
      idempotencyKey: validation.data.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    console.error("Edit cash transfer error:", error);
    return { error: "Failed to edit cash transfer. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  redirect("/ledger");
}

const deleteTransferSchema = z.object({
  id: z.string().trim().min(1, "Transfer ID is required."),
  deleteReason: z.string().trim().min(1, "Deletion reason is required.").max(500, "Deletion reason must be under 500 characters."),
  version: strictVersionSchema,
  idempotencyKey: z.string().trim().min(1, "Idempotency key is required."),
});

export async function softDeleteCashTransferAction(
  _prevState: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) return { error: "You are not assigned to an organization." };

  const rawVersion = formData.get("version")?.toString();
  if (!rawVersion || !rawVersion.trim()) {
    return { error: "Missing or malformed transfer version." };
  }

  const validation = deleteTransferSchema.safeParse({
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
    await deleteCashTransferService(user, {
      id: validation.data.id,
      expectedVersion,
      deleteReason: validation.data.deleteReason,
      idempotencyKey: validation.data.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    console.error("Delete cash transfer error:", error);
    return { error: "Failed to delete cash transfer. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  redirect("/ledger");
}
