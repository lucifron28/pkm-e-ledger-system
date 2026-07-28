import { CashAccount, TransactionType } from "@prisma/client";

export interface FinancialRow {
  type: TransactionType;
  amountCents: number;
  cashAccount: CashAccount;
}

export interface AccountBalances {
  cashOnHandCents: number;
  cashInBankCents: number;
  totalIncomeCents: number;
  totalExpenseCents: number;
  remainingCents: number;
}

export function calculateAccountBalances(
  openingCashOnHandCents: number,
  openingCashInBankCents: number,
  rows: FinancialRow[]
): AccountBalances {
  let cashOnHandCents = openingCashOnHandCents;
  let cashInBankCents = openingCashInBankCents;
  let totalIncomeCents = 0;
  let totalExpenseCents = 0;

  for (const row of rows) {
    const amount = row.type === TransactionType.INCOME ? row.amountCents : -row.amountCents;
    if (row.cashAccount === CashAccount.CASH_ON_HAND) {
      cashOnHandCents += amount;
    } else {
      cashInBankCents += amount;
    }

    if (row.type === TransactionType.INCOME) {
      totalIncomeCents += row.amountCents;
    } else {
      totalExpenseCents += row.amountCents;
    }
  }

  return {
    cashOnHandCents,
    cashInBankCents,
    totalIncomeCents,
    totalExpenseCents,
    remainingCents: cashOnHandCents + cashInBankCents,
  };
}

export function hasNegativeAccountBalance(balances: AccountBalances): boolean {
  return balances.cashOnHandCents < 0 || balances.cashInBankCents < 0;
}
