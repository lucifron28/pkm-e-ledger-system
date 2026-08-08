import { TransactionType } from "@prisma/client";

export const TRANSACTION_FIELD_LIMITS = {
  documentNumber: 100,
  counterpartyName: 200,
  description: 500,
  referenceDescription: 500,
  eventActivityName: 200,
} as const;

export const TRANSFER_FIELD_LIMITS = {
  documentNumber: 100,
  description: 500,
  referenceDescription: 500,
  eventActivityName: 200,
} as const;

export function forceTransactionType(formData: FormData, type: TransactionType): FormData {
  const forcedData = new FormData();
  for (const [key, value] of formData.entries()) {
    forcedData.append(key, value);
  }
  forcedData.set("type", type);
  return forcedData;
}
