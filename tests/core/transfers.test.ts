import test from "node:test";
import assert from "node:assert/strict";
import { CashAccount, Semester, TransactionType } from "@prisma/client";
import {
  calculateAccountBalances,
  transferRowsToMovements,
  TransferRow,
} from "../../lib/domain/financial";
import { buildReportPackage, RawReportInputTerm, RawReportInputTransaction, RawReportInputTransfer } from "../../lib/domain/reports";
import { ValidationError } from "../../lib/domain/errors";

test("CashTransfer Domain: COH to CIB transfer updates account balances while keeping remaining balance, income, expense unchanged", () => {
  const openingCOH = 100000; // ₱1,000.00
  const openingCIB = 200000; // ₱2,000.00

  const transfers: TransferRow[] = [
    {
      id: "transfer-1",
      amountCents: 50000, // ₱500.00
      fromAccount: CashAccount.CASH_ON_HAND,
      toAccount: CashAccount.CASH_IN_BANK,
    },
  ];

  const movements = transferRowsToMovements(transfers);
  const balances = calculateAccountBalances(openingCOH, openingCIB, movements);

  assert.equal(balances.cashOnHandCents, 50000); // 100000 - 50000 = 50000
  assert.equal(balances.cashInBankCents, 250000); // 200000 + 50000 = 250000
  assert.equal(balances.totalIncomeCents, 0);
  assert.equal(balances.totalExpenseCents, 0);
  assert.equal(balances.totalTransferInCIBCents, 50000);
  assert.equal(balances.totalTransferInCOHCents, 0);
  assert.equal(balances.remainingCents, 300000); // 100000 + 200000 = 300000 (invariant preserved)
});

test("CashTransfer Domain: CIB to COH transfer updates account balances correctly", () => {
  const openingCOH = 50000;
  const openingCIB = 300000;

  const transfers: TransferRow[] = [
    {
      id: "transfer-2",
      amountCents: 100000,
      fromAccount: CashAccount.CASH_IN_BANK,
      toAccount: CashAccount.CASH_ON_HAND,
    },
  ];

  const movements = transferRowsToMovements(transfers);
  const balances = calculateAccountBalances(openingCOH, openingCIB, movements);

  assert.equal(balances.cashOnHandCents, 150000); // 50000 + 100000 = 150000
  assert.equal(balances.cashInBankCents, 200000); // 300000 - 100000 = 200000
  assert.equal(balances.totalIncomeCents, 0);
  assert.equal(balances.totalExpenseCents, 0);
  assert.equal(balances.totalTransferInCOHCents, 100000);
  assert.equal(balances.remainingCents, 350000);
});

test("CashTransfer Domain: Same source and destination account rejection", () => {
  const openingCOH = 100000;
  const openingCIB = 200000;

  const invalidTransfer: TransferRow[] = [
    {
      id: "transfer-3",
      amountCents: 10000,
      fromAccount: CashAccount.CASH_ON_HAND,
      toAccount: CashAccount.CASH_ON_HAND,
    },
  ];

  assert.throws(
    () => {
      calculateAccountBalances(openingCOH, openingCIB, transferRowsToMovements(invalidTransfer));
    },
    (err: unknown) => err instanceof ValidationError && err.message.includes("must be different")
  );
});

test("CashTransfer Domain: Report package excludes transfers from Schedule 1 & 2 while updating ending balances", () => {
  const rawTerm: RawReportInputTerm = {
    id: "term-201",
    academicYear: "2025-2026",
    semester: Semester.FIRST_SEMESTER,
    openingCashOnHandCents: 100000,
    openingCashInBankCents: 200000,
    organization: { id: "org-1", name: "Fictional Student Organization", slug: "fictional-student-organization" },
  };

  const rawTransactions: RawReportInputTransaction[] = [
    {
      id: "tx-inc-1",
      type: TransactionType.INCOME,
      transactionDate: new Date("2025-08-01"),
      amountCents: 50000,
      cashAccount: CashAccount.CASH_ON_HAND,
      documentNumber: "OR-100",
      counterpartyName: "Member Fees",
      description: "Collection",
      referenceDescription: "Ref",
      categoryId: "cat-1",
      category: { id: "cat-1", name: "Membership Dues", type: TransactionType.INCOME },
      attachments: [],
    },
  ];

  const rawTransfers: RawReportInputTransfer[] = [
    {
      id: "tr-1",
      amountCents: 30000,
      fromAccount: CashAccount.CASH_ON_HAND,
      toAccount: CashAccount.CASH_IN_BANK,
    },
  ];

  const report = buildReportPackage(rawTerm, rawTransactions, rawTransfers);

  // Schedules check
  assert.equal(report.collectionGroups.length, 1);
  assert.equal(report.totalIncomeCents, 50000);
  assert.equal(report.expenseRows.length, 0);

  // Transfers affect ending account balances
  assert.equal(report.endingCashOnHandCents, 120000); // 100000 opening + 50000 income - 30000 transfer = 120000
  assert.equal(report.endingCashInBankCents, 230000); // 200000 opening + 30000 transfer = 230000
  assert.equal(report.endingBalanceCents, 350000); // 120000 + 230000 = 350000
});
