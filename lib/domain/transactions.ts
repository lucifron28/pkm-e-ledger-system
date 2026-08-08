import { TransactionType } from "@prisma/client";

export function forceTransactionType(formData: FormData, type: TransactionType): FormData {
  const forcedData = new FormData();
  for (const [key, value] of formData.entries()) {
    forcedData.append(key, value);
  }
  forcedData.set("type", type);
  return forcedData;
}
