import ExcelJS from "exceljs";
import { ReportPackageDto, Schedule2Bucket } from "@/lib/domain/reports";
import {
  formatReportDate,
  getReportExpenseColumns,
  REPORT_CURRENCY_FORMAT,
  REPORT_DATE_FORMAT,
  toReportDateCell,
} from "@/lib/reports/report-layout";

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

const thinBorder = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
} as ExcelJS.Borders;

const totalBorder = {
  top: { style: "double", color: { argb: "FF334155" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "double", color: { argb: "FF334155" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
  diagonal: {},
} as ExcelJS.Borders;

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

function configureSheet(
  sheet: ExcelJS.Worksheet,
  orientation: "portrait" | "landscape"
): void {
  sheet.views = [{ showGridLines: false }];
  sheet.pageSetup = {
    paperSize: 9,
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.45,
      bottom: 0.45,
      header: 0.2,
      footer: 0.2,
    },
  };
  sheet.headerFooter.oddFooter = "Page &P of &N";
}

function setRowBorders(row: ExcelJS.Row, startColumn: number, endColumn: number): void {
  for (let column = startColumn; column <= endColumn; column += 1) {
    row.getCell(column).border = thinBorder;
  }
}

function addHeading(
  sheet: ExcelJS.Worksheet,
  report: ReportPackageDto,
  title: string,
  endColumn: number,
  includeAsOf = true
): void {
  const headingRows = [
    "PAMBAYANG KOLEHIYO NG MAUBAN",
    sanitizeExcelCellString(report.organizationName),
    title,
    `${sanitizeExcelCellString(report.academicYear)} | ${sanitizeExcelCellString(report.semesterLabel)}`,
    includeAsOf ? `As of ${formatReportDate(report.asOfDate)}` : "",
  ];

  headingRows.forEach((value, index) => {
    const row = sheet.addRow([value]);
    sheet.mergeCells(row.number, 1, row.number, endColumn);
    const cell = row.getCell(1);
    cell.value = value;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.font = {
      name: "Calibri",
      size: index === 1 ? 14 : index === 2 ? 12 : 10,
      bold: index < 3,
      color: { argb: index === 1 ? "FF004AAD" : "FF172033" },
    };
    row.height = index === 1 ? 22 : 18;
  });
  sheet.addRow([]).height = 8;
}

function addSectionHeading(sheet: ExcelJS.Worksheet, label: string, endColumn: number): ExcelJS.Row {
  const row = sheet.addRow([label]);
  sheet.mergeCells(row.number, 1, row.number, endColumn);
  const cell = row.getCell(1);
  cell.font = { name: "Calibri", bold: true, color: { argb: "FF172033" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  cell.alignment = { horizontal: "left", vertical: "middle" };
  setRowBorders(row, 1, endColumn);
  return row;
}

function styleTableHeader(row: ExcelJS.Row, endColumn: number, color = "FF004AAD"): void {
  for (let column = 1; column <= endColumn; column += 1) {
    const cell = row.getCell(column);
    cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.alignment = { horizontal: column >= 3 ? "right" : "left", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
  }
  row.height = 28;
}

function styleTotalRow(row: ExcelJS.Row, endColumn: number): void {
  row.font = { name: "Calibri", bold: true, color: { argb: "FF172033" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
  for (let column = 1; column <= endColumn; column += 1) {
    row.getCell(column).border = totalBorder;
  }
}

function setPeso(cell: ExcelJS.Cell, cents: number): void {
  cell.value = cents / 100;
  cell.numFmt = REPORT_CURRENCY_FORMAT;
  cell.alignment = { horizontal: "right" };
}

export async function buildReportExcelBuffer(report: ReportPackageDto): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PKM e-Ledger System";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("SUMMARY");
  summarySheet.columns = [
    { width: 4 },
    { width: 48 },
    { width: 20 },
  ];
  configureSheet(summarySheet, "portrait");
  addHeading(summarySheet, report, "FINANCIAL SUMMARY REPORT", 3);

  const addSummaryLine = (label: string, cents: number): ExcelJS.Row => {
    const row = summarySheet.addRow(["", sanitizeExcelCellString(label), cents / 100]);
    row.getCell(2).alignment = { horizontal: "left" };
    setPeso(row.getCell(3), cents);
    setRowBorders(row, 2, 3);
    return row;
  };

  addSectionHeading(summarySheet, "I. BALANCE FORWARDED", 3);
  const openingCashOnHand = addSummaryLine("Cash on Hand", report.openingCashOnHandCents);
  const openingCashInBank = addSummaryLine("Cash in Bank", report.openingCashInBankCents);
  const balanceForwarded = addSummaryLine("Balance Forwarded", report.balanceForwardedCents);
  balanceForwarded.font = { name: "Calibri", bold: true };
  setFormula(
    balanceForwarded.getCell(3),
    `SUM(C${openingCashOnHand.number}:C${openingCashInBank.number})`,
    report.balanceForwardedCents / 100
  );
  balanceForwarded.getCell(3).numFmt = REPORT_CURRENCY_FORMAT;

  summarySheet.addRow([]).height = 8;
  addSectionHeading(summarySheet, "II. ADD: COLLECTIONS", 3);
  const collectionStart = summarySheet.rowCount + 1;
  if (report.collectionGroups.length === 0) {
    summarySheet.addRow(["", "No collections recorded", null]);
  } else {
    for (const group of report.collectionGroups) {
      addSummaryLine(group.categoryName, group.totalCents);
    }
  }
  const collectionEnd = summarySheet.rowCount;
  const collectionsTotal = summarySheet.addRow(["", "Total Collections", report.totalIncomeCents / 100]);
  styleTotalRow(collectionsTotal, 3);
  setFormula(
    collectionsTotal.getCell(3),
    report.collectionGroups.length > 0 ? `SUM(C${collectionStart}:C${collectionEnd})` : "0",
    report.totalIncomeCents / 100
  );
  collectionsTotal.getCell(3).numFmt = REPORT_CURRENCY_FORMAT;

  summarySheet.addRow([]).height = 8;
  const cashAvailable = addSectionHeading(summarySheet, "III. TOTAL CASH AVAILABLE", 3);
  const cashAvailableLine = addSummaryLine("Total Cash Available", report.totalCashAvailableCents);
  cashAvailable.font = { name: "Calibri", bold: true, color: { argb: "FF004AAD" } };
  cashAvailableLine.font = { name: "Calibri", bold: true, color: { argb: "FF004AAD" } };
  setFormula(
    cashAvailableLine.getCell(3),
    `C${balanceForwarded.number}+C${collectionsTotal.number}`,
    report.totalCashAvailableCents / 100
  );
  cashAvailableLine.getCell(3).numFmt = REPORT_CURRENCY_FORMAT;

  summarySheet.addRow([]).height = 8;
  addSectionHeading(summarySheet, "IV. LESS: EXPENSES", 3);
  const expensesTotal = addSummaryLine("Total Expenses", report.totalExpenseCents);
  expensesTotal.font = { name: "Calibri", bold: true };

  summarySheet.addRow([]).height = 8;
  addSectionHeading(summarySheet, "V. ENDING BALANCE", 3);
  addSummaryLine("Cash on Hand", report.endingCashOnHandCents);
  addSummaryLine("Cash in Bank", report.endingCashInBankCents);
  const endingBalance = addSummaryLine("Ending Balance", report.endingBalanceCents);
  endingBalance.font = { name: "Calibri", bold: true, color: { argb: "FF004AAD" } };
  setFormula(
    endingBalance.getCell(3),
    `C${cashAvailableLine.number}-C${expensesTotal.number}`,
    report.endingBalanceCents / 100
  );
  endingBalance.getCell(3).numFmt = REPORT_CURRENCY_FORMAT;

  summarySheet.addRow([]).height = 10;
  addSectionHeading(summarySheet, "SIGNATURE SECTION", 3);
  const signatureRows = [
    ["Prepared by:", report.signatories.treasurerTitle],
    ["Certified Correct:", report.signatories.auditorTitle],
    ["Approved by:", report.signatories.adviserTitle],
    ["Noted / Approved:", report.signatories.presidentOsaTitle],
  ];
  for (const [label, title] of signatureRows) {
    const row = summarySheet.addRow(["", `${label} __________________________`, sanitizeExcelCellString(title)]);
    row.getCell(2).alignment = { horizontal: "left" };
    row.getCell(3).alignment = { horizontal: "left" };
    row.getCell(3).font = { name: "Calibri", italic: true, color: { argb: "FF475569" } };
    row.height = 22;
  }

  const sched1 = workbook.addWorksheet("SCHEDULE 1 - COLLECTIONS");
  sched1.columns = [
    { width: 14 },
    { width: 42 },
    { width: 18 },
  ];
  configureSheet(sched1, "portrait");
  addHeading(sched1, report, "SUMMARY OF COLLECTIONS", 3);
  addSectionHeading(sched1, "SCHEDULE 1", 3);
  const collectionSubtotalRows: number[] = [];

  for (const group of report.collectionGroups) {
    const groupHeading = addSectionHeading(sched1, sanitizeExcelCellString(group.categoryName), 3);
    groupHeading.getCell(1).font = { name: "Calibri", bold: true, color: { argb: "FF004AAD" } };
    const headerRow = sched1.addRow(["Sequence number", "Payor / Source Name", "Amount"]);
    styleTableHeader(headerRow, 3);
    const dataStart = headerRow.number + 1;
    for (const item of group.items) {
      const row = sched1.addRow([
        item.sequenceNumber,
        sanitizeExcelCellString(item.payorName),
        item.amountCents / 100,
      ]);
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(3).numFmt = REPORT_CURRENCY_FORMAT;
      row.getCell(3).alignment = { horizontal: "right" };
      setRowBorders(row, 1, 3);
    }
    const dataEnd = sched1.rowCount;
    const subtotal = sched1.addRow(["", "Total per schedule", group.totalCents / 100]);
    styleTotalRow(subtotal, 3);
    setFormula(
      subtotal.getCell(3),
      dataEnd >= dataStart ? `SUM(C${dataStart}:C${dataEnd})` : "0",
      group.totalCents / 100
    );
    subtotal.getCell(3).numFmt = REPORT_CURRENCY_FORMAT;
    collectionSubtotalRows.push(subtotal.number);
    sched1.addRow([]).height = 8;
  }

  if (report.collectionGroups.length === 0) {
    const headerRow = sched1.addRow(["Sequence number", "Payor / Source Name", "Amount"]);
    styleTableHeader(headerRow, 3);
    const emptyRow = sched1.addRow(["", "No collections recorded", null]);
    setRowBorders(emptyRow, 1, 3);
  }

  const schedule1Total = sched1.addRow(["", "TOTAL PER SCHEDULE", report.totalIncomeCents / 100]);
  styleTotalRow(schedule1Total, 3);
  const subtotalFormula = collectionSubtotalRows.length
    ? `SUM(${collectionSubtotalRows.map((row) => `C${row}`).join(",")})`
    : "0";
  setFormula(schedule1Total.getCell(3), subtotalFormula, report.totalIncomeCents / 100);
  schedule1Total.getCell(3).numFmt = REPORT_CURRENCY_FORMAT;

  const expenseColumns = getReportExpenseColumns(report.expenseCategories);
  const sched2 = workbook.addWorksheet("SCHEDULE 2 - EXPENSES");
  sched2.columns = [
    { width: 14 },
    { width: 12 },
    { width: 30 },
    { width: 34 },
    { width: 14 },
    ...expenseColumns.map((column) => ({ width: column.key === "Transportation" ? 17 : 14 })),
  ];
  configureSheet(sched2, "landscape");
  addHeading(sched2, report, "SUMMARY OF EXPENSES", 5 + expenseColumns.length);
  addSectionHeading(sched2, "SCHEDULE 2", 5 + expenseColumns.length);
  const expenseHeader = sched2.addRow([
    "Doc No.",
    "Date",
    "Payee",
    "Particulars",
    "Amount",
    ...expenseColumns.map((column) => bucketHeaders[column.key]),
  ]);
  styleTableHeader(expenseHeader, 5 + expenseColumns.length, "FF172033");
  const expenseDataStart = expenseHeader.number + 1;

  for (const item of report.expenseRows) {
    const row = sched2.addRow([
      sanitizeExcelCellString(item.documentNumber),
      toReportDateCell(item.transactionDate),
      sanitizeExcelCellString(item.payeeName),
      sanitizeExcelCellString(item.description),
      item.amountCents / 100,
      ...expenseColumns.map((column) => {
        const cents = item.categoryBucketCents[column.key] || 0;
        return cents > 0 ? cents / 100 : null;
      }),
    ]);
    row.getCell(2).numFmt = REPORT_DATE_FORMAT;
    row.getCell(5).numFmt = REPORT_CURRENCY_FORMAT;
    row.getCell(5).alignment = { horizontal: "right" };
    for (let column = 6; column <= 5 + expenseColumns.length; column += 1) {
      row.getCell(column).numFmt = REPORT_CURRENCY_FORMAT;
      row.getCell(column).alignment = { horizontal: "right" };
    }
    setRowBorders(row, 1, 5 + expenseColumns.length);
  }

  const expenseDataEnd = sched2.rowCount;
  const expenseTotalRow = sched2.addRow([
    "",
    "",
    "TOTAL EXPENSES",
    "",
    report.totalExpenseCents / 100,
    ...expenseColumns.map((column) => column.totalCents / 100),
  ]);
  styleTotalRow(expenseTotalRow, 5 + expenseColumns.length);
  setFormula(
    expenseTotalRow.getCell(5),
    expenseDataEnd >= expenseDataStart ? `SUM(E${expenseDataStart}:E${expenseDataEnd})` : "0",
    report.totalExpenseCents / 100
  );
  expenseTotalRow.getCell(5).numFmt = REPORT_CURRENCY_FORMAT;
  expenseColumns.forEach((column, index) => {
    const excelColumn = 6 + index;
    const letter = sched2.getColumn(excelColumn).letter;
    setFormula(
      expenseTotalRow.getCell(excelColumn),
      expenseDataEnd >= expenseDataStart ? `SUM(${letter}${expenseDataStart}:${letter}${expenseDataEnd})` : "0",
      column.totalCents / 100
    );
    expenseTotalRow.getCell(excelColumn).numFmt = REPORT_CURRENCY_FORMAT;
  });
  setFormula(
    expensesTotal.getCell(3),
    expenseDataEnd >= expenseDataStart
      ? `SUM('SCHEDULE 2 - EXPENSES'!E${expenseDataStart}:E${expenseDataEnd})`
      : "0",
    report.totalExpenseCents / 100
  );
  expensesTotal.getCell(3).numFmt = REPORT_CURRENCY_FORMAT;

  const attachments = workbook.addWorksheet("RECEIPTS - ATTACHMENTS");
  attachments.columns = [
    { width: 18 },
    { width: 14 },
    { width: 16 },
    { width: 36 },
    { width: 30 },
    { width: 22 },
    { width: 14 },
  ];
  configureSheet(attachments, "portrait");
  addHeading(attachments, report, "RECEIPTS / ATTACHMENTS", 7);
  const attachmentHeader = attachments.addRow([
    "Entry",
    "Date",
    "Document No.",
    "Particulars",
    "Original File Name",
    "MIME Type",
    "Size (KB)",
  ]);
  styleTableHeader(attachmentHeader, 7, "FF334155");
  for (const attachment of report.attachments) {
    const row = attachments.addRow([
      attachment.entryType === "CASH_TRANSFER" ? "Transfer" : "Transaction",
      toReportDateCell(attachment.transactionDate),
      sanitizeExcelCellString(attachment.documentNumber),
      sanitizeExcelCellString(attachment.description),
      sanitizeExcelCellString(attachment.originalName),
      sanitizeExcelCellString(attachment.mimeType),
      Math.ceil(attachment.sizeBytes / 1024),
    ]);
    row.getCell(2).numFmt = REPORT_DATE_FORMAT;
    row.getCell(7).alignment = { horizontal: "right" };
    setRowBorders(row, 1, 7);
  }
  if (report.attachments.length === 0) {
    const emptyRow = attachments.addRow(["", "", "", "No attachments associated with this report package."]);
    emptyRow.getCell(4).alignment = { horizontal: "left" };
    setRowBorders(emptyRow, 1, 7);
  }

  const sheetsWithPrintAreas: Array<[ExcelJS.Worksheet, string]> = [
    [summarySheet, `A1:C${summarySheet.rowCount}`],
    [sched1, `A1:C${sched1.rowCount}`],
    [sched2, `A1:${sched2.getColumn(5 + expenseColumns.length).letter}${sched2.rowCount}`],
    [attachments, `A1:G${attachments.rowCount}`],
  ];
  for (const [sheet, area] of sheetsWithPrintAreas) {
    sheet.pageSetup.printArea = area;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
