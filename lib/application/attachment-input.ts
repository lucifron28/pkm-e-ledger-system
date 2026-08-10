import { ValidationError } from "../domain/errors";

export interface AttachmentOwnerIds {
  transactionId: string | null;
  cashTransferId: string | null;
}

export function getAttachmentOwnerIds(transactionId: unknown, cashTransferId: unknown): AttachmentOwnerIds {
  const normalizedTransactionId = typeof transactionId === "string" ? transactionId.trim() || null : null;
  const normalizedCashTransferId = typeof cashTransferId === "string" ? cashTransferId.trim() || null : null;
  if ((normalizedTransactionId ? 1 : 0) + (normalizedCashTransferId ? 1 : 0) !== 1) {
    throw new ValidationError("Attachment must belong to exactly one transaction or cash transfer.");
  }
  return { transactionId: normalizedTransactionId, cashTransferId: normalizedCashTransferId };
}
