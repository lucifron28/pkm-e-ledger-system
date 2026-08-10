import { CashAccount, TransactionType } from "@prisma/client";
import { z } from "zod";
import { TRANSACTION_FIELD_LIMITS, TRANSFER_FIELD_LIMITS } from "./field-limits";
import { strictVersionSchema } from "./query";

const transactionBaseSchema = z.object({
  type: z.nativeEnum(TransactionType, { message: "Transaction type is required." }),
  transactionDate: z.string().trim().min(1, "Transaction date is required."),
  amount: z.string().trim().min(1, "Amount is required."),
  cashAccount: z.nativeEnum(CashAccount, { message: "Cash account is required." }),
  categoryId: z.string().trim().min(1, "Category is required."),
  documentNumber: z.string().trim().max(TRANSACTION_FIELD_LIMITS.documentNumber, `Document number must be at most ${TRANSACTION_FIELD_LIMITS.documentNumber} characters.`).optional(),
  counterpartyName: z.string().trim().min(1, "Payor / Payee is required.").max(TRANSACTION_FIELD_LIMITS.counterpartyName, `Payor / Payee must be at most ${TRANSACTION_FIELD_LIMITS.counterpartyName} characters.`),
  description: z.string().trim().min(1, "Description is required.").max(TRANSACTION_FIELD_LIMITS.description, `Description must be at most ${TRANSACTION_FIELD_LIMITS.description} characters.`),
  referenceDescription: z.string().trim().min(1, "Reference description is required.").max(TRANSACTION_FIELD_LIMITS.referenceDescription, `Reference description must be at most ${TRANSACTION_FIELD_LIMITS.referenceDescription} characters.`),
  eventActivityName: z.string().trim().min(1, "Event / Activity name is required.").max(TRANSACTION_FIELD_LIMITS.eventActivityName, `Event / Activity name must be at most ${TRANSACTION_FIELD_LIMITS.eventActivityName} characters.`),
});

export const createTransactionSchema = transactionBaseSchema.extend({
  termId: z.string().trim().min(1, "Term ID is required."),
  idempotencyKey: z.string().trim().min(1, "Idempotency key is required."),
});

export const editTransactionSchema = transactionBaseSchema.extend({
  id: z.string().trim().min(1, "Transaction ID is required."),
  version: strictVersionSchema,
  idempotencyKey: z.string().trim().min(1, "Idempotency key is required."),
});

const transferBaseSchema = z.object({
  fromAccount: z.nativeEnum(CashAccount, { message: "Source cash account is required." }),
  toAccount: z.nativeEnum(CashAccount, { message: "Destination cash account is required." }),
  transferDate: z.string().trim().min(1, "Transfer date is required."),
  amount: z.string().trim().min(1, "Amount is required."),
  documentNumber: z.string().trim().max(TRANSFER_FIELD_LIMITS.documentNumber, `Document number must be at most ${TRANSFER_FIELD_LIMITS.documentNumber} characters.`).optional(),
  description: z.string().trim().min(1, "Description is required.").max(TRANSFER_FIELD_LIMITS.description, `Description must be at most ${TRANSFER_FIELD_LIMITS.description} characters.`),
  referenceDescription: z.string().trim().min(1, "Reference description is required.").max(TRANSFER_FIELD_LIMITS.referenceDescription, `Reference description must be at most ${TRANSFER_FIELD_LIMITS.referenceDescription} characters.`),
  eventActivityName: z.string().trim().max(TRANSFER_FIELD_LIMITS.eventActivityName, `Event / Activity name must be at most ${TRANSFER_FIELD_LIMITS.eventActivityName} characters.`).optional(),
});

export const createTransferSchema = transferBaseSchema.extend({
  termId: z.string().trim().min(1, "Term ID is required."),
  idempotencyKey: z.string().trim().min(1, "Idempotency key is required."),
});

export const editTransferSchema = transferBaseSchema.extend({
  id: z.string().trim().min(1, "Transfer ID is required."),
  version: strictVersionSchema,
  idempotencyKey: z.string().trim().min(1, "Idempotency key is required."),
});
