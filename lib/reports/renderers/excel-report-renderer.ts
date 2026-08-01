import ExcelJS from "exceljs";
import { ReportPackageDto, Schedule2Bucket } from "@/lib/domain/reports";

/** Prevent formula injection when user-controlled text enters an Excel cell. */
export function sanitizeExcelCellString(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^[=+\-@]/.test(trimmed) ? `'${trimmed}` : trimmed;
}

function setFormula(cell: ExcelJS.Cell, formula: string, result: number): void {
  cell.value = { formula, result };
}

function styleHeader(row: ExcelJS.Row, color: string): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

const bucketHeaders: Record<Schedule2Bucket, string> = {
  Supplies: "Supplies",
  Equipment: "Equipment",
  Transportation: "Transportation",
  Meals: "Meals",
  Service: "Service",
  Misc: "Miscellaneous",
  Donation: "Donation",
  Others: "Others",
};

export async function buildReportExcelBuffer(report: ReportPackageDto): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PKM e-Ledger System";
  workbook.created = new Date();
  const pesoFmt = '"PHP" #,##0.00';

  const summarySheet = workbook.addWorksheet("SUMMARY");
  summarySheet.columns = [
    { header: "Description / Account", key: "description", width: 44 },
    { header: "Amount", key: "amount", width: 22 },
  ];
  summarySheet.addRow(["PAMBAYANG KOLEHIYO NG MAUBAN", ""]);
  summarySheet.addRow([sanitizeExcelCellString(report.organizationName), ""]);
  summarySheet.addRow(["FINANCIAL SUMMARY REPORT", ""]);
  summarySheet.addRow([`${sanitizeExcelCellString(report.academicYear)} - ${sanitizeExcelCellString(report.semesterLabel)}`, ""]);
  summarySheet.addRow([`As of ${report.asOfDate.toISOString().slice(0, 10)}`, ""]);
  summarySheet.addRow([]);
  summarySheet.getRow(1).font = { bold: true, size: 10, color: { argb: "FF64748B" } };
  summarySheet.getRow(2).font = { bold: true, size: 16, color: { argb: "FF004AAD" } };
  summarySheet.getRow(3).font = { bold: true, size: 12 };
  summarySheet.getRow(4).font = { italic: true, size: 10 };

  const balanceHeading = summarySheet.addRow(["I. BALANCE FORWARDED", ""]);
  balanceHeading.font = { bold: true };
  const openingCashOnHand = summarySheet.addRow(["Cash on Hand", report.openingCashOnHandCents / 100]);
  const openingCashInBank = summarySheet.addRow(["Cash in Bank", report.openingCashInBankCents / 100]);
  openingCashOnHand.getCell(2).numFmt = pesoFmt;
  openingCashInBank.getCell(2).numFmt = pesoFmt;
  const balanceForwarded = summarySheet.addRow(["Balance Forwarded", report.balanceForwardedCents / 100]);
  balanceForwarded.font = { bold: true };
  setFormula(balanceForwarded.getCell(2), `SUM(B${openingCashOnHand.number}:B${openingCashInBank.number})`, report.balanceForwardedCents / 100);
  balanceForwarded.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);

  const collectionsHeading = summarySheet.addRow(["II. COLLECTIONS BY INCOME REPORT BUCKET", ""]);
  collectionsHeading.font = { bold: true };
  const collectionStart = summarySheet.rowCount + 1;
  for (const group of report.collectionGroups) {
    const row = summarySheet.addRow([sanitizeExcelCellString(group.categoryName), group.totalCents / 100]);
    row.getCell(2).numFmt = pesoFmt;
  }
  const collectionEnd = summarySheet.rowCount;
  const collectionsTotal = summarySheet.addRow(["Total Collections", report.totalIncomeCents / 100]);
  collectionsTotal.font = { bold: true };
  setFormula(collectionsTotal.getCell(2), collectionEnd >= collectionStart ? `SUM(B${collectionStart}:B${collectionEnd})` : "0", report.totalIncomeCents / 100);
  collectionsTotal.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);

  const cashAvailable = summarySheet.addRow(["III. TOTAL CASH AVAILABLE", report.totalCashAvailableCents / 100]);
  cashAvailable.font = { bold: true, color: { argb: "FF004AAD" } };
  setFormula(cashAvailable.getCell(2), `B${balanceForwarded.number}+B${collectionsTotal.number}`, report.totalCashAvailableCents / 100);
  cashAvailable.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);

  const expenseHeading = summarySheet.addRow(["IV. LESS: EXPENSES", ""]);
  expenseHeading.font = { bold: true };
  const expensesTotal = summarySheet.addRow(["Total Expenses", report.totalExpenseCents / 100]);
  expensesTotal.font = { bold: true };
  expensesTotal.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);

  const endingHeading = summarySheet.addRow(["V. ENDING BALANCE", ""]);
  endingHeading.font = { bold: true };
  const endingCashOnHand = summarySheet.addRow(["Cash on Hand", report.endingCashOnHandCents / 100]);
  const endingCashInBank = summarySheet.addRow(["Cash in Bank", report.endingCashInBankCents / 100]);
  endingCashOnHand.getCell(2).numFmt = pesoFmt;
  endingCashInBank.getCell(2).numFmt = pesoFmt;
  const endingBalance = summarySheet.addRow(["Ending Balance", report.endingBalanceCents / 100]);
  endingBalance.font = { bold: true, size: 12 };
  setFormula(endingBalance.getCell(2), `B${cashAvailable.number}-B${expensesTotal.number}`, report.endingBalanceCents / 100);
  endingBalance.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);
  const signatureHeading = summarySheet.addRow(["SIGNATURE SECTION", ""]);
  signatureHeading.font = { bold: true };
  summarySheet.addRow(["Prepared by: _______________________", sanitizeExcelCellString(report.signatories.treasurerTitle)]);
  summarySheet.addRow(["Certified Correct: __________________", sanitizeExcelCellString(report.signatories.auditorTitle)]);
  summarySheet.addRow(["Approved by: ________________________", sanitizeExcelCellString(report.signatories.adviserTitle)]);
  summarySheet.addRow(["Noted / Approved: ____________________", sanitizeExcelCellString(report.signatories.presidentOsaTitle)]);

  const sched1 = workbook.addWorksheet("SCHEDULE 1 - COLLECTIONS", { views: [{ state: "frozen", ySplit: 1 }] });
  sched1.columns = [
    { header: "Sequence", key: "sequence", width: 10 },
    { header: "Payor / Source Name", key: "payor", width: 32 },
    { header: "Amount", key: "amount", width: 18 },
    { header: "Category", key: "category", width: 24 },
    { header: "Date", key: "date", width: 14 },
    { header: "Document No.", key: "document", width: 16 },
  ];
  styleHeader(sched1.getRow(1), "FF004AAD");
  for (const group of report.collectionGroups) {
    for (const item of group.items) {
      const row = sched1.addRow([
        item.sequenceNumber,
        sanitizeExcelCellString(item.payorName),
        item.amountCents / 100,
        sanitizeExcelCellString(group.categoryName),
        item.transactionDate.toISOString().slice(0, 10),
        sanitizeExcelCellString(item.documentNumber),
      ]);
      row.getCell(3).numFmt = pesoFmt;
    }
  }
  const sched1TotalRow = sched1.addRow(["", "TOTAL PER SCHEDULE", report.totalIncomeCents / 100, "", "", ""]);
  sched1TotalRow.font = { bold: true };
  const sched1DataEnd = sched1TotalRow.number - 1;
  setFormula(sched1TotalRow.getCell(3), sched1DataEnd >= 2 ? `SUM(C2:C${sched1DataEnd})` : "0", report.totalIncomeCents / 100);
  sched1TotalRow.getCell(3).numFmt = pesoFmt;

  const sched2 = workbook.addWorksheet("SCHEDULE 2 - EXPENSES", { views: [{ state: "frozen", ySplit: 1 }] });
  const expenseBuckets = report.expenseCategories.map((category) => category.bucketKey);
  sched2.columns = [
    { header: "Doc No.", key: "document", width: 14 },
    { header: "Date", key: "date", width: 14 },
    { header: "Payee", key: "payee", width: 28 },
    { header: "Particulars", key: "particulars", width: 36 },
    { header: "Amount", key: "amount", width: 18 },
    ...expenseBuckets.map((bucket) => ({ header: bucketHeaders[bucket], key: bucket, width: 18 })),
  ];
  styleHeader(sched2.getRow(1), "FF0F172A");
  for (const item of report.expenseRows) {
    const values: (string | number)[] = [
      sanitizeExcelCellString(item.documentNumber),
      item.transactionDate.toISOString().slice(0, 10),
      sanitizeExcelCellString(item.payeeName),
      sanitizeExcelCellString(item.description),
      item.amountCents / 100,
      ...expenseBuckets.map((bucket) => (item.categoryBucketCents[bucket] || 0) / 100),
    ];
    const row = sched2.addRow(values);
    for (let column = 5; column <= values.length; column++) row.getCell(column).numFmt = pesoFmt;
  }
  const sched2TotalRow = sched2.addRow(["", "", "TOTAL EXPENSES", "", report.totalExpenseCents / 100, ...report.expenseCategories.map((category) => category.totalCents / 100)]);
  sched2TotalRow.font = { bold: true };
  const sched2DataEnd = sched2TotalRow.number - 1;
  setFormula(sched2TotalRow.getCell(5), sched2DataEnd >= 2 ? `SUM(E2:E${sched2DataEnd})` : "0", report.totalExpenseCents / 100);
  for (let index = 0; index < expenseBuckets.length; index++) {
    const column = 6 + index;
    const result = report.expenseCategories[index]?.totalCents || 0;
    setFormula(sched2TotalRow.getCell(column), sched2DataEnd >= 2 ? `SUM(${sched2.getColumn(column).letter}2:${sched2.getColumn(column).letter}${sched2DataEnd})` : "0", result / 100);
  }
  for (let column = 5; column <= 5 + expenseBuckets.length; column++) sched2TotalRow.getCell(column).numFmt = pesoFmt;
  setFormula(
    expensesTotal.getCell(2),
    sched2DataEnd >= 2 ? `SUM('SCHEDULE 2 - EXPENSES'!E2:E${sched2DataEnd})` : "0",
    report.totalExpenseCents / 100
  );

  // Excel sheet names cannot contain slash characters; keep official label meaning with a valid name.
  const attachments = workbook.addWorksheet("RECEIPTS - ATTACHMENTS", { views: [{ state: "frozen", ySplit: 1 }] });
  attachments.columns = [
    { header: "Entry", key: "entry", width: 18 },
    { header: "Date", key: "date", width: 14 },
    { header: "Document No.", key: "document", width: 16 },
    { header: "Particulars", key: "particulars", width: 36 },
    { header: "Original File Name", key: "file", width: 30 },
    { header: "MIME Type", key: "mime", width: 22 },
    { header: "Size (KB)", key: "size", width: 14 },
  ];
  styleHeader(attachments.getRow(1), "FF334155");
  for (const attachment of report.attachments) {
    attachments.addRow([
      attachment.entryType === "CASH_TRANSFER" ? "Transfer" : "Transaction",
      attachment.transactionDate.toISOString().slice(0, 10),
      sanitizeExcelCellString(attachment.documentNumber),
      sanitizeExcelCellString(attachment.description),
      sanitizeExcelCellString(attachment.originalName),
      sanitizeExcelCellString(attachment.mimeType),
      Math.round(attachment.sizeBytes / 1024),
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
