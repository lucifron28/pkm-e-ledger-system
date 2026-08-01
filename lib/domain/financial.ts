import { CashAccount, TransactionType } from "@prisma/client";
import { assertNoOverflow, validateMoneyAmount } from "./money";
import { InsufficientFundsError, ValidationError } from "./errors";

export type AccountMovement =
  | { kind: "INCOME"; amountCents: number; cashAccount: CashAccount }
  | { kind: "EXPENSE"; amountCents: number; cashAccount: CashAccount }
  | {
      kind: "TRANSFER";
      amountCents: number;
      fromAccount: CashAccount;
      toAccount: CashAccount;
    };

export interface FinancialRow {
  id?: string;
  type: TransactionType;
  amountCents: number;
  cashAccount: CashAccount;
}

export interface TransferRow {
  id?: string;
  amountCents: number;
  fromAccount: CashAccount;
  toAccount: CashAccount;
}

export interface AccountBalances {
  cashOnHandCents: number;
  cashInBankCents: number;
  totalIncomeCents: number;
  totalExpenseCents: number;
  totalTransferInCOHCents: number;
  totalTransferInCIBCents: number;
  remainingCents: number;
}

function isAccountMovement(item: FinancialRow | AccountMovement): item is AccountMovement {
  return "kind" in item;
}

export function calculateAccountBalances(
  openingCashOnHandCents: number,
  openingCashInBankCents: number,
  items: (FinancialRow | AccountMovement)[] = []
): AccountBalances {
  validateMoneyAmount(openingCashOnHandCents, true, "Opening Cash on Hand");
  validateMoneyAmount(openingCashInBankCents, true, "Opening Cash in Bank");

  let cashOnHandCents = openingCashOnHandCents;
  let cashInBankCents = openingCashInBankCents;
  let totalIncomeCents = 0;
  let totalExpenseCents = 0;
  let totalTransferInCOHCents = 0;
  let totalTransferInCIBCents = 0;

  for (const item of items) {
    if (isAccountMovement(item)) {
      validateMoneyAmount(item.amountCents, false, "Movement amount");
      if (item.kind === "INCOME") {
        totalIncomeCents += item.amountCents;
        assertNoOverflow(totalIncomeCents, "Total Income");
        if (item.cashAccount === CashAccount.CASH_ON_HAND) {
          cashOnHandCents += item.amountCents;
          assertNoOverflow(cashOnHandCents, "Cash on Hand");
        } else {
          cashInBankCents += item.amountCents;
          assertNoOverflow(cashInBankCents, "Cash in Bank");
        }
      } else if (item.kind === "EXPENSE") {
        totalExpenseCents += item.amountCents;
        assertNoOverflow(totalExpenseCents, "Total Expense");
        if (item.cashAccount === CashAccount.CASH_ON_HAND) {
          cashOnHandCents -= item.amountCents;
          assertNoOverflow(cashOnHandCents, "Cash on Hand");
        } else {
          cashInBankCents -= item.amountCents;
          assertNoOverflow(cashInBankCents, "Cash in Bank");
        }
      } else if (item.kind === "TRANSFER") {
        if (item.fromAccount === item.toAccount) {
          throw new ValidationError("Transfer source and destination accounts must be different.");
        }
        if (item.fromAccount === CashAccount.CASH_ON_HAND) {
          cashOnHandCents -= item.amountCents;
          assertNoOverflow(cashOnHandCents, "Cash on Hand");
          cashInBankCents += item.amountCents;
          assertNoOverflow(cashInBankCents, "Cash in Bank");
          totalTransferInCIBCents += item.amountCents;
          assertNoOverflow(totalTransferInCIBCents, "Total Transfer in Cash in Bank");
        } else {
          cashInBankCents -= item.amountCents;
          assertNoOverflow(cashInBankCents, "Cash in Bank");
          cashOnHandCents += item.amountCents;
          assertNoOverflow(cashOnHandCents, "Cash on Hand");
          totalTransferInCOHCents += item.amountCents;
          assertNoOverflow(totalTransferInCOHCents, "Total Transfer in Cash on Hand");
        }
      }
    } else {
      validateMoneyAmount(item.amountCents, false, "Transaction amount");
      if (item.type === TransactionType.INCOME) {
        totalIncomeCents += item.amountCents;
        assertNoOverflow(totalIncomeCents, "Total Income");
        if (item.cashAccount === CashAccount.CASH_ON_HAND) {
          cashOnHandCents += item.amountCents;
          assertNoOverflow(cashOnHandCents, "Cash on Hand");
        } else {
          cashInBankCents += item.amountCents;
          assertNoOverflow(cashInBankCents, "Cash in Bank");
        }
      } else {
        totalExpenseCents += item.amountCents;
        assertNoOverflow(totalExpenseCents, "Total Expense");
        if (item.cashAccount === CashAccount.CASH_ON_HAND) {
          cashOnHandCents -= item.amountCents;
          assertNoOverflow(cashOnHandCents, "Cash on Hand");
        } else {
          cashInBankCents -= item.amountCents;
          assertNoOverflow(cashInBankCents, "Cash in Bank");
        }
      }
    }
  }

  assertNoOverflow(cashOnHandCents, "Cash on Hand");
  assertNoOverflow(cashInBankCents, "Cash in Bank");
  assertNoOverflow(totalIncomeCents, "Total Income");
  assertNoOverflow(totalExpenseCents, "Total Expense");
  assertNoOverflow(totalTransferInCOHCents, "Total Transfer in Cash on Hand");
  assertNoOverflow(totalTransferInCIBCents, "Total Transfer in Cash in Bank");

  const balanceForwarded = openingCashOnHandCents + openingCashInBankCents;
  assertNoOverflow(balanceForwarded, "Balance Forwarded");
  const remainingCents = balanceForwarded + totalIncomeCents - totalExpenseCents;
  assertNoOverflow(remainingCents, "Remaining Balance");

  if (remainingCents !== cashOnHandCents + cashInBankCents) {
    throw new ValidationError(
      `Financial calculation invariant violated: remaining balance (${remainingCents}) does not match sum of cash accounts (${cashOnHandCents + cashInBankCents}).`
    );
  }

  return {
    cashOnHandCents,
    cashInBankCents,
    totalIncomeCents,
    totalExpenseCents,
    totalTransferInCOHCents,
    totalTransferInCIBCents,
    remainingCents,
  };
}

export function financialRowsToMovements(rows: FinancialRow[]): AccountMovement[] {
  return rows.map((r) => ({
    kind: r.type === TransactionType.INCOME ? "INCOME" : "EXPENSE",
    amountCents: r.amountCents,
    cashAccount: r.cashAccount,
  }));
}

export function transferRowsToMovements(transfers: TransferRow[]): AccountMovement[] {
  return transfers.map((t) => ({
    kind: "TRANSFER",
    amountCents: t.amountCents,
    fromAccount: t.fromAccount,
    toAccount: t.toAccount,
  }));
}

export function hasNegativeAccountBalance(balances: AccountBalances): boolean {
  return balances.cashOnHandCents < 0 || balances.cashInBankCents < 0;
}

export function assertSufficientFunds(balances: AccountBalances): void {
  if (hasNegativeAccountBalance(balances)) {
    throw new InsufficientFundsError();
  }
}

export type FinancialMutation =
  | { type: "CREATE" | "CREATE_TRANSACTION"; row: FinancialRow }
  | { type: "EDIT" | "EDIT_TRANSACTION"; existingId: string; newRow: FinancialRow }
  | { type: "DELETE" | "DELETE_TRANSACTION"; existingId: string }
  | { type: "CREATE_TRANSFER"; transfer: TransferRow }
  | { type: "EDIT_TRANSFER"; existingId: string; newTransfer: TransferRow }
  | { type: "DELETE_TRANSFER"; existingId: string }
  | { type: "SET_OPENING"; openingCashOnHandCents: number; openingCashInBankCents: number };

export function projectMutationBalances(
  currentOpeningCashOnHandCents: number,
  currentOpeningCashInBankCents: number,
  existingRows: FinancialRow[],
  mutation: FinancialMutation,
  existingTransfers: TransferRow[] = []
): AccountBalances {
  let openingOnHand = currentOpeningCashOnHandCents;
  let openingInBank = currentOpeningCashInBankCents;

  let rows = [...existingRows];
  let transfers = [...existingTransfers];

  switch (mutation.type) {
    case "CREATE":
    case "CREATE_TRANSACTION":
      rows.push(mutation.row);
      break;
    case "EDIT":
    case "EDIT_TRANSACTION":
      rows = rows.filter((r) => r.id !== mutation.existingId);
      rows.push(mutation.newRow);
      break;
    case "DELETE":
    case "DELETE_TRANSACTION":
      rows = rows.filter((r) => r.id !== mutation.existingId);
      break;
    case "CREATE_TRANSFER":
      transfers.push(mutation.transfer);
      break;
    case "EDIT_TRANSFER":
      transfers = transfers.filter((t) => t.id !== mutation.existingId);
      transfers.push(mutation.newTransfer);
      break;
    case "DELETE_TRANSFER":
      transfers = transfers.filter((t) => t.id !== mutation.existingId);
      break;
    case "SET_OPENING":
      openingOnHand = mutation.openingCashOnHandCents;
      openingInBank = mutation.openingCashInBankCents;
      break;
  }

  const movements = [
    ...financialRowsToMovements(rows),
    ...transferRowsToMovements(transfers),
  ];

  return calculateAccountBalances(openingOnHand, openingInBank, movements);
}
