import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAccountBalances,
  hasNegativeAccountBalance,
  projectMutationBalances,
} from "../../lib/domain/financial";
import { CashAccount, TransactionType } from "@prisma/client";

test("Financial Domain: Both opening accounts and basic arithmetic", () => {
  const result = calculateAccountBalances(100000, 200000, [
    { type: TransactionType.INCOME, cashAccount: CashAccount.CASH_ON_HAND, amountCents: 50000 },
    { type: TransactionType.EXPENSE, cashAccount: CashAccount.CASH_IN_BANK, amountCents: 30000 },
  ]);

  assert.equal(result.cashOnHandCents, 150000);
  assert.equal(result.cashInBankCents, 170000);
  assert.equal(result.totalIncomeCents, 50000);
  assert.equal(result.totalExpenseCents, 30000);
  assert.equal(result.remainingCents, 320000);
});

test("Financial Domain: Negative Cash on Hand detection", () => {
  const result = calculateAccountBalances(1000, 50000, [
    { type: TransactionType.EXPENSE, cashAccount: CashAccount.CASH_ON_HAND, amountCents: 5000 },
  ]);

  assert.equal(result.cashOnHandCents, -4000);
  assert.ok(hasNegativeAccountBalance(result), "Should flag negative Cash on Hand");
});

test("Financial Domain: Negative Cash in Bank detection", () => {
  const result = calculateAccountBalances(50000, 2000, [
    { type: TransactionType.EXPENSE, cashAccount: CashAccount.CASH_IN_BANK, amountCents: 10000 },
  ]);

  assert.equal(result.cashInBankCents, -8000);
  assert.ok(hasNegativeAccountBalance(result), "Should flag negative Cash in Bank");
});

test("Financial Domain: Projected mutation - Create transaction", () => {
  const existing = [
    { id: "tx1", type: TransactionType.INCOME, amountCents: 10000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(5000, 5000, existing, {
    type: "CREATE",
    row: { type: TransactionType.EXPENSE, amountCents: 3000, cashAccount: CashAccount.CASH_ON_HAND },
  });

  assert.equal(projected.cashOnHandCents, 12000); // 5000 + 10000 - 3000
  assert.equal(hasNegativeAccountBalance(projected), false);
});

test("Financial Domain: Projected mutation - Expense overspending rejection", () => {
  const existing = [
    { id: "tx1", type: TransactionType.INCOME, amountCents: 1000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(2000, 5000, existing, {
    type: "CREATE",
    row: { type: TransactionType.EXPENSE, amountCents: 5000, cashAccount: CashAccount.CASH_ON_HAND },
  });

  assert.equal(projected.cashOnHandCents, -2000);
  assert.ok(hasNegativeAccountBalance(projected), "Must reject overspending Cash on Hand");
});

test("Financial Domain: Projected mutation - Increasing an expense", () => {
  const existing = [
    { id: "tx1", type: TransactionType.EXPENSE, amountCents: 1000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(5000, 0, existing, {
    type: "EDIT",
    existingId: "tx1",
    newRow: { type: TransactionType.EXPENSE, amountCents: 4000, cashAccount: CashAccount.CASH_ON_HAND },
  });

  assert.equal(projected.cashOnHandCents, 1000); // 5000 - 4000
  assert.equal(hasNegativeAccountBalance(projected), false);
});

test("Financial Domain: Projected mutation - Reducing income", () => {
  const existing = [
    { id: "tx1", type: TransactionType.INCOME, amountCents: 10000, cashAccount: CashAccount.CASH_ON_HAND },
    { id: "tx2", type: TransactionType.EXPENSE, amountCents: 8000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(0, 0, existing, {
    type: "EDIT",
    existingId: "tx1",
    newRow: { type: TransactionType.INCOME, amountCents: 5000, cashAccount: CashAccount.CASH_ON_HAND },
  });

  assert.equal(projected.cashOnHandCents, -3000); // 5000 - 8000
  assert.ok(hasNegativeAccountBalance(projected), "Reducing income below expenses creates negative balance");
});

test("Financial Domain: Projected mutation - Moving income between accounts", () => {
  const existing = [
    { id: "tx1", type: TransactionType.INCOME, amountCents: 5000, cashAccount: CashAccount.CASH_ON_HAND },
    { id: "tx2", type: TransactionType.EXPENSE, amountCents: 4000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(0, 0, existing, {
    type: "EDIT",
    existingId: "tx1",
    newRow: { type: TransactionType.INCOME, amountCents: 5000, cashAccount: CashAccount.CASH_IN_BANK },
  });

  assert.equal(projected.cashOnHandCents, -4000); // no income left on hand to cover expense
  assert.equal(projected.cashInBankCents, 5000);
  assert.ok(hasNegativeAccountBalance(projected));
});

test("Financial Domain: Projected mutation - Changing income to expense", () => {
  const existing = [
    { id: "tx1", type: TransactionType.INCOME, amountCents: 5000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(10000, 0, existing, {
    type: "EDIT",
    existingId: "tx1",
    newRow: { type: TransactionType.EXPENSE, amountCents: 5000, cashAccount: CashAccount.CASH_ON_HAND },
  });

  assert.equal(projected.cashOnHandCents, 5000); // 10000 opening - 5000 expense
});

test("Financial Domain: Projected mutation - Deleting funding income", () => {
  const existing = [
    { id: "tx1", type: TransactionType.INCOME, amountCents: 10000, cashAccount: CashAccount.CASH_ON_HAND },
    { id: "tx2", type: TransactionType.EXPENSE, amountCents: 6000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(0, 0, existing, {
    type: "DELETE",
    existingId: "tx1",
  });

  assert.equal(projected.cashOnHandCents, -6000);
  assert.ok(hasNegativeAccountBalance(projected));
});

test("Financial Domain: Projected mutation - Reducing opening balances", () => {
  const existing = [
    { id: "tx1", type: TransactionType.EXPENSE, amountCents: 8000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(10000, 0, existing, {
    type: "SET_OPENING",
    openingCashOnHandCents: 5000,
    openingCashInBankCents: 0,
  });

  assert.equal(projected.cashOnHandCents, -3000); // 5000 opening - 8000 expense
  assert.ok(hasNegativeAccountBalance(projected));
});

test("Financial Domain: Integer-cent precision", () => {
  const result = calculateAccountBalances(1, 2, [
    { type: TransactionType.INCOME, cashAccount: CashAccount.CASH_ON_HAND, amountCents: 99 },
  ]);
  assert.equal(result.cashOnHandCents, 100);
  assert.equal(result.remainingCents, 102);
});
