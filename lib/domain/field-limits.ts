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
