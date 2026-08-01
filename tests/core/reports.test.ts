import test from "node:test";
import assert from "node:assert/strict";
import { CashAccount, ExpenseReportBucket, Semester, TransactionType } from "@prisma/client";
import ExcelJS from "exceljs";
import {
  SCHEDULE_2_BUCKETS,
  reportBucketToSchedule2Bucket,
  buildReportPackage,
  RawReportInputTerm,
  RawReportInputTransaction,
  RawReportInputTransfer,
} from "../../lib/domain/reports";
import { buildReportExcelBuffer } from "../../lib/reports/renderers/excel-report-renderer";
import { buildReportPdfBuffer } from "../../lib/reports/renderers/pdf-report-renderer";

test("Reports Domain: Fixed Schedule 2 Bucket Order and Count", () => {
  assert.equal(SCHEDULE_2_BUCKETS.length, 8);
  assert.deepEqual(SCHEDULE_2_BUCKETS, [
    "Supplies",
    "Equipment",
    "Transportation",
    "Meals",
    "Service",
    "Misc",
    "Donation",
    "Others",
  ]);
});

test("Reports Domain: Category mapping to Schedule 2 Buckets", () => {
  assert.equal(reportBucketToSchedule2Bucket(ExpenseReportBucket.SUPPLIES), "Supplies");
  assert.equal(reportBucketToSchedule2Bucket(ExpenseReportBucket.EQUIPMENT), "Equipment");
  assert.equal(reportBucketToSchedule2Bucket(ExpenseReportBucket.TRANSPORTATION), "Transportation");
  assert.equal(reportBucketToSchedule2Bucket(ExpenseReportBucket.MEALS), "Meals");
  assert.equal(reportBucketToSchedule2Bucket(ExpenseReportBucket.SERVICE), "Service");
  assert.equal(reportBucketToSchedule2Bucket(ExpenseReportBucket.MISC), "Misc");
  assert.equal(reportBucketToSchedule2Bucket(ExpenseReportBucket.DONATION), "Donation");
  assert.equal(reportBucketToSchedule2Bucket(ExpenseReportBucket.OTHERS), "Others");
});

test("Reports Domain: Real report package builder calculations and DTO invariants", () => {
  const rawTerm: RawReportInputTerm = {
    id: "term-101",
    academicYear: "2025-2026",
    semester: Semester.FIRST_SEMESTER,
    openingCashOnHandCents: 500000, // 5,000.00
    openingCashInBankCents: 1000000, // 10,000.00
    organization: {
      id: "org-1",
      name: "Fictional Student Organization",
      slug: "fictional-student-organization",
    },
  };

  const rawTransactions: RawReportInputTransaction[] = [
    {
      id: "tx-1",
      type: TransactionType.INCOME,
      transactionDate: new Date("2025-08-01"),
      amountCents: 200000, // 2,000.00
      cashAccount: CashAccount.CASH_ON_HAND,
      documentNumber: "OR-001",
      counterpartyName: "Member Fees",
      description: "Membership Dues",
      referenceDescription: "Collection",
      categoryId: "cat-inc-1",
      category: { id: "cat-inc-1", name: "Membership Dues", type: TransactionType.INCOME },
      attachments: [
        {
          id: "att-db-id-1",
          originalName: "membership_deposit.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048576,
        },
      ],
    },
    {
      id: "tx-2",
      type: TransactionType.EXPENSE,
      transactionDate: new Date("2025-08-05"),
      amountCents: 300000, // 3,000.00
      cashAccount: CashAccount.CASH_ON_HAND,
      documentNumber: "VOUCHER-01",
      counterpartyName: "Paper Store",
      description: "Office Paper",
      referenceDescription: "Receipt #12",
      categoryId: "cat-exp-1",
      category: { id: "cat-exp-1", name: "Office Supplies", type: TransactionType.EXPENSE, reportBucket: ExpenseReportBucket.SUPPLIES },
      attachments: [],
    },
    {
      id: "tx-3",
      type: TransactionType.EXPENSE,
      transactionDate: new Date("2025-08-10"),
      amountCents: 150000, // 1,500.00
      cashAccount: CashAccount.CASH_IN_BANK,
      documentNumber: "VOUCHER-02",
      counterpartyName: "Unknown Vendor",
      description: "Special Project Fee",
      referenceDescription: "Receipt #13",
      categoryId: "cat-exp-2",
      category: { id: "cat-exp-2", name: "Custom Special Category", type: TransactionType.EXPENSE, reportBucket: ExpenseReportBucket.OTHERS },
      attachments: [],
    },
  ];

  const asOfDate = new Date("2026-08-31T12:00:00.000Z");
  const report = buildReportPackage(rawTerm, rawTransactions, [], asOfDate);

  // 1. Ledger totals match report totals
  assert.equal(report.balanceForwardedCents, 1500000);
  assert.equal(report.totalIncomeCents, 200000);
  assert.equal(report.totalExpenseCents, 450000);
  assert.equal(report.totalCashAvailableCents, 1700000);
  assert.equal(report.endingBalanceCents, 1250000); // 1500000 + 200000 - 450000
  assert.equal(report.endingCashOnHandCents, 400000); // 500000 + 200000 - 300000
  assert.equal(report.endingCashInBankCents, 850000); // 1000000 - 150000

  // 2. Schedule 1 grouping
  assert.equal(report.collectionGroups.length, 1);
  assert.equal(report.collectionGroups[0].categoryName, "Membership Dues");
  assert.equal(report.collectionGroups[0].totalCents, 200000);
  assert.equal(report.totalCollectionItemsCount, 1);

  // 3. Schedule 2 fixed 8 buckets in exact order
  assert.equal(report.expenseCategories.length, 8);
  assert.deepEqual(
    report.expenseCategories.map((c) => c.bucketKey),
    [...SCHEDULE_2_BUCKETS]
  );

  // 4. Unsupported category mapped to "Others"
  const expenseCustom = report.expenseRows.find((r) => r.transactionId === "tx-3");
  assert.ok(expenseCustom);
  assert.equal(expenseCustom.mappedBucket, "Others");
  assert.equal(expenseCustom.categoryBucketCents["Others"], 150000);

  // 5. Exactly one non-zero bucket per expense row
  for (const row of report.expenseRows) {
    const nonZeroBuckets = Object.entries(row.categoryBucketCents).filter(([, val]) => val > 0);
    assert.equal(nonZeroBuckets.length, 1, "Each expense row must have exactly one non-zero bucket");
    assert.equal(nonZeroBuckets[0][1], row.amountCents);
  }

  // 6. Four signature labels
  assert.equal(report.signatories.treasurerTitle, "Organization Treasurer");
  assert.equal(report.signatories.auditorTitle, "Organization Auditor");
  assert.equal(report.signatories.adviserTitle, "Faculty Adviser");
  assert.equal(report.signatories.presidentOsaTitle, "President / OSA Representative");
  assert.equal(report.asOfDate, asOfDate);

  // 7. Attachment DTO security: storage keys and database IDs omitted
  assert.equal(report.attachments.length, 1);
  const attRef = report.attachments[0];
  assert.equal(attRef.originalName, "membership_deposit.pdf");
  assert.equal(attRef.mimeType, "application/pdf");
  assert.equal(attRef.sizeBytes, 2048576);
  assert.equal(attRef.entryType, "TRANSACTION");
  assert.equal(attRef.cashTransferId, null);
  assert.equal("id" in attRef, false, "Report attachment DTO must not include attachment database ID");

  const transfer: RawReportInputTransfer = {
    id: "transfer-1",
    amountCents: 500,
    fromAccount: CashAccount.CASH_ON_HAND,
    toAccount: CashAccount.CASH_IN_BANK,
    transferDate: new Date("2025-08-12"),
    documentNumber: "TR-1",
    description: "Cash movement",
    attachments: [{ originalName: "transfer.pdf", mimeType: "application/pdf", sizeBytes: 512 }],
  };
  const transferReport = buildReportPackage(rawTerm, rawTransactions, [transfer], asOfDate);
  assert.equal(transferReport.attachments.length, 2);
  assert.equal(transferReport.attachments[1].entryType, "CASH_TRANSFER");
  assert.equal(transferReport.attachments[1].cashTransferId, "transfer-1");
});

test("Reports Export: official package sheets, formulas, and PDF output are present", async () => {
  const report = buildReportPackage(
    {
      id: "term-export-1",
      academicYear: "2025-2026",
      semester: Semester.FIRST_SEMESTER,
      openingCashOnHandCents: 10000,
      openingCashInBankCents: 20000,
      organization: {
        id: "org-export-1",
        name: "Fictional Student Organization",
        slug: "fictional-student-organization",
      },
    },
    [],
    [],
    new Date("2026-08-31T12:00:00.000Z")
  );

  const workbook = new ExcelJS.Workbook();
  const excelBuffer = await buildReportExcelBuffer(report);
  await workbook.xlsx.load(excelBuffer.buffer as unknown as ArrayBuffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
    "SUMMARY",
    "SCHEDULE 1 - COLLECTIONS",
    "SCHEDULE 2 - EXPENSES",
    "RECEIPTS - ATTACHMENTS",
  ]);
  const balanceForwardedFormula = workbook.getWorksheet("SUMMARY")?.getCell("B11").value;
  const expenseTotalFormula = workbook.getWorksheet("SCHEDULE 2 - EXPENSES")?.getCell("E2").value;
  assert.ok(balanceForwardedFormula && typeof balanceForwardedFormula === "object" && "formula" in balanceForwardedFormula);
  assert.ok(expenseTotalFormula && typeof expenseTotalFormula === "object" && "formula" in expenseTotalFormula);

  const pdf = await buildReportPdfBuffer(report);
  assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
});
