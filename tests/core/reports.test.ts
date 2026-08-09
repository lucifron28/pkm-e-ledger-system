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
import {
  ATTACHMENT_TABLE_ALIGNMENTS,
  PDF_ATTACHMENT_TABLE_WIDTHS,
  SCHEDULE1_TABLE_ALIGNMENTS,
  buildReportPdfBuffer,
  fitsPdfTableRow,
  getSchedule2TableAlignments,
} from "../../lib/reports/renderers/pdf-report-renderer";

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

  // 6. Six role-only signature labels
  assert.equal(report.signatories.treasurerTitle, "Organization Treasurer");
  assert.equal(report.signatories.auditorTitle, "Organization Auditor");
  assert.equal(report.signatories.osaCoordinatorTitle, "OSS / OSA Coordinator");
  assert.equal(report.signatories.organizationPresidentTitle, "Organization President");
  assert.equal(report.signatories.adviserTitle, "Faculty Adviser");
  assert.equal(report.signatories.accountantTitle, "PKM Accountant");
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

test("Reports Export: aligned package sheets, formulas, and PDF output are present", async () => {
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
  const summarySheet = workbook.getWorksheet("SUMMARY")!;
  const schedule1Sheet = workbook.getWorksheet("SCHEDULE 1 - COLLECTIONS")!;
  const schedule2Sheet = workbook.getWorksheet("SCHEDULE 2 - EXPENSES")!;
  const attachmentSheet = workbook.getWorksheet("RECEIPTS - ATTACHMENTS")!;
  const findRow = (sheet: ExcelJS.Worksheet, column: number, label: string): ExcelJS.Row | undefined => {
    for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (row.getCell(column).text === label) return row;
    }
    return undefined;
  };
  const balanceForwardedRow = findRow(summarySheet, 2, "Balance Forwarded");
  const summaryExpenseRow = findRow(summarySheet, 2, "Total Expenses");
  const expenseTotalRow = findRow(schedule2Sheet, 3, "TOTAL EXPENSES");
  const balanceForwardedFormula = balanceForwardedRow?.getCell(3).value;
  const expenseTotalFormula = expenseTotalRow?.getCell(5).value;
  assert.ok(balanceForwardedFormula && typeof balanceForwardedFormula === "object" && "formula" in balanceForwardedFormula);
  assert.ok(expenseTotalFormula && typeof expenseTotalFormula === "object" && "formula" in expenseTotalFormula);
  assert.ok(summaryExpenseRow);
  assert.equal(summarySheet.pageSetup.orientation, "portrait");
  assert.equal(schedule1Sheet.pageSetup.orientation, "portrait");
  assert.equal(schedule2Sheet.pageSetup.orientation, "landscape");
  assert.equal(schedule1Sheet.columnCount, 3);
  assert.equal(schedule2Sheet.getRow(8).getCell(5).text, "Amount");
  assert.equal(schedule2Sheet.getRow(8).getCell(12).text, "Donation");
  assert.equal(schedule2Sheet.getCell("M8").value, null, "Others is omitted when unused");
  assert.equal(attachmentSheet.getCell("A3").text, "RECEIPTS / ATTACHMENTS");
  assert.ok(summarySheet.model.merges.includes("A1:C1"));
  const summaryValues = summarySheet.getSheetValues().flat().map((value) => String(value ?? ""));
  for (const title of [
    "Organization Treasurer",
    "Organization Auditor",
    "OSS / OSA Coordinator",
    "Organization President",
    "Faculty Adviser",
    "PKM Accountant",
  ]) {
    assert.ok(summaryValues.includes(title), `Summary XLSX must include role-only signature slot: ${title}`);
  }

  const pdf = await buildReportPdfBuffer(report);
  assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
});

test("Reports Export: grouped collections and mapped expense cells survive XLSX round-trip", async () => {
  const report = buildReportPackage(
    {
      id: "term-rich-export",
      academicYear: "2025-2026",
      semester: Semester.FIRST_SEMESTER,
      openingCashOnHandCents: 100000,
      openingCashInBankCents: 200000,
      organization: {
        id: "org-rich-export",
        name: "Fictional Campus Organization",
        slug: "fictional-campus-organization",
      },
    },
    [
      {
        id: "income-rich-1",
        type: TransactionType.INCOME,
        transactionDate: new Date("2025-08-01T00:00:00.000Z"),
        amountCents: 25000,
        cashAccount: CashAccount.CASH_ON_HAND,
        documentNumber: "SYN-IN-01",
        counterpartyName: "Synthetic Payor One",
        description: "Membership collection",
        referenceDescription: "Synthetic test reference",
        categoryId: "income-category-one",
        category: { id: "income-category-one", name: "Membership Dues", type: TransactionType.INCOME },
        attachments: [],
      },
      {
        id: "income-rich-2",
        type: TransactionType.INCOME,
        transactionDate: new Date("2025-08-02T00:00:00.000Z"),
        amountCents: 35000,
        cashAccount: CashAccount.CASH_IN_BANK,
        documentNumber: "SYN-IN-02",
        counterpartyName: "Synthetic Payor Two",
        description: "Donation collection",
        referenceDescription: "Synthetic test reference",
        categoryId: "income-category-two",
        category: { id: "income-category-two", name: "Donation", type: TransactionType.INCOME },
        attachments: [],
      },
      {
        id: "expense-rich-1",
        type: TransactionType.EXPENSE,
        transactionDate: new Date("2025-08-05T00:00:00.000Z"),
        amountCents: 15000,
        cashAccount: CashAccount.CASH_ON_HAND,
        documentNumber: "SYN-EX-01",
        counterpartyName: "Synthetic Vendor",
        description: "Synthetic uncategorized expense",
        referenceDescription: "Synthetic test reference",
        categoryId: "expense-category-one",
        category: {
          id: "expense-category-one",
          name: "Custom Expense",
          type: TransactionType.EXPENSE,
          reportBucket: ExpenseReportBucket.OTHERS,
        },
        attachments: [],
      },
    ],
    [],
    new Date("2026-08-31T00:00:00.000Z")
  );

  assert.equal(report.collectionGroups[0].items[0].sequenceNumber, 1);
  assert.equal(report.collectionGroups[1].items[0].sequenceNumber, 1);

  const workbook = new ExcelJS.Workbook();
  const excelBuffer = await buildReportExcelBuffer(report);
  await workbook.xlsx.load(excelBuffer.buffer as unknown as ArrayBuffer);
  const schedule1 = workbook.getWorksheet("SCHEDULE 1 - COLLECTIONS")!;
  const schedule2 = workbook.getWorksheet("SCHEDULE 2 - EXPENSES")!;
  const schedule1Values = schedule1.getSheetValues().flat().map((value) => String(value ?? ""));
  assert.ok(schedule1Values.includes("Membership Dues"));
  assert.ok(schedule1Values.includes("Donation"));
  assert.equal(schedule2.getRow(8).getCell(13).text, "Others");
  assert.ok(schedule2.getCell("B9").value instanceof Date);
  assert.equal(schedule2.getCell("E9").value, 150);
  assert.equal(schedule2.getCell("M9").value, 150);
  assert.equal(schedule2.getCell("F9").value, null);
});

test("Reports PDF: Schedule 1 continuation pages preflight rows and retain totals", async () => {
  const collectionCount = 60;
  const transactions: RawReportInputTransaction[] = Array.from({ length: collectionCount }, (_, index) => ({
    id: `stress-income-${index + 1}`,
    type: TransactionType.INCOME,
    transactionDate: new Date("2025-08-01T00:00:00.000Z"),
    amountCents: 1000,
    cashAccount: CashAccount.CASH_ON_HAND,
    documentNumber: `STRESS-${String(index + 1).padStart(3, "0")}`,
    counterpartyName:
      index === collectionCount - 1
        ? "Synthetic Payor with a deliberately long source name that must wrap inside the Schedule 1 table cell"
        : `Synthetic Payor ${index + 1}`,
    description: "Synthetic collection",
    referenceDescription: "Synthetic stress reference",
    categoryId: "stress-income-category",
    category: { id: "stress-income-category", name: "Synthetic Collections", type: TransactionType.INCOME },
    attachments: [],
  }));
  const report = buildReportPackage(
    {
      id: "term-schedule1-stress",
      academicYear: "2025-2026",
      semester: Semester.FIRST_SEMESTER,
      openingCashOnHandCents: 100000,
      openingCashInBankCents: 0,
      organization: {
        id: "org-schedule1-stress",
        name: "Fictional Schedule Stress Organization",
        slug: "fictional-schedule-stress-organization",
      },
    },
    transactions,
    [],
    new Date("2026-08-31T00:00:00.000Z")
  );

  const pdf = await buildReportPdfBuffer(report);
  const pdfPageCount = pdf.toString("latin1").split("/Type /Page\n").length - 1;

  assert.ok(pdfPageCount >= 5, `Expected continuation pages, received ${pdfPageCount} PDF pages`);
  assert.equal(report.collectionGroups[0].totalCents, collectionCount * 1000);
  assert.equal(report.totalIncomeCents, collectionCount * 1000);
  assert.equal(fitsPdfTableRow(680, 20, 700), true);
  assert.equal(fitsPdfTableRow(681, 20, 700), false);
  assert.deepEqual(SCHEDULE1_TABLE_ALIGNMENTS, ["center", "left", "right"]);
  assert.deepEqual(getSchedule2TableAlignments(2), ["left", "left", "left", "left", "right", "right", "right"]);
  assert.deepEqual(ATTACHMENT_TABLE_ALIGNMENTS, ["left", "left", "left", "left", "left", "left", "right"]);
  assert.ok(PDF_ATTACHMENT_TABLE_WIDTHS.reduce((total, width) => total + width, 0) <= 540);
});
