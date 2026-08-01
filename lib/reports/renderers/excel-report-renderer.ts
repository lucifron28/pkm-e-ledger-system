import ExcelJS from "exceljs";
import { ReportPackageDto } from "@/lib/domain/reports";

/**
 * Escapes user-supplied strings beginning with =, +, -, or @
 * by prefixing with a single quote (') to prevent Excel formula injection.
 */
export function sanitizeExcelCellString(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

export async function buildReportExcelBuffer(report: ReportPackageDto): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PKM e-Ledger System";
  workbook.created = new Date();

  const pesoFmt = '"₱"#,##0.00';

  // 1. SUMMARY SHEET
  const summarySheet = workbook.addWorksheet("SUMMARY");
  summarySheet.columns = [
    { header: "Description / Account", key: "desc", width: 42 },
    { header: "Amount", key: "amount", width: 22 },
  ];

  summarySheet.addRow(["PAMBAYANG KOLEHIYO NG MAUBAN", ""]);
  summarySheet.addRow([sanitizeExcelCellString(report.organizationName), ""]);
  summarySheet.addRow(["FINANCIAL SUMMARY REPORT", ""]);
  summarySheet.addRow([`${sanitizeExcelCellString(report.academicYear)} - ${sanitizeExcelCellString(report.semesterLabel)}`, ""]);
  summarySheet.addRow([]);

  summarySheet.getRow(1).font = { bold: true, size: 10, color: { argb: "FF64748B" } };
  summarySheet.getRow(2).font = { bold: true, size: 16, color: { argb: "FF004AAD" } };
  summarySheet.getRow(3).font = { bold: true, size: 12 };
  summarySheet.getRow(4).font = { italic: true, size: 10 };

  const rowI = summarySheet.addRow(["I. BALANCE FORWARDED (OPENING BALANCE)", ""]);
  rowI.font = { bold: true, color: { argb: "FF0F172A" } };
  summarySheet.addRow(["   Opening Cash on Hand", report.openingCashOnHandCents / 100]).getCell(2).numFmt = pesoFmt;
  summarySheet.addRow(["   Opening Cash in Bank", report.openingCashInBankCents / 100]).getCell(2).numFmt = pesoFmt;
  const totFwd = summarySheet.addRow(["Total Balance Forwarded", report.balanceForwardedCents / 100]);
  totFwd.font = { bold: true };
  totFwd.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);

  const rowII = summarySheet.addRow(["II. COLLECTIONS (INCOME BY CATEGORY)", ""]);
  rowII.font = { bold: true, color: { argb: "FF0F172A" } };
  for (const g of report.collectionGroups) {
    summarySheet.addRow([`   ${sanitizeExcelCellString(g.categoryName)}`, g.totalCents / 100]).getCell(2).numFmt = pesoFmt;
  }
  const totColl = summarySheet.addRow(["Total Collections", report.totalIncomeCents / 100]);
  totColl.font = { bold: true };
  totColl.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);

  const rowIII = summarySheet.addRow(["III. TOTAL CASH AVAILABLE", report.totalCashAvailableCents / 100]);
  rowIII.font = { bold: true, size: 11, color: { argb: "FF004AAD" } };
  rowIII.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);

  const rowIV = summarySheet.addRow(["IV. LESS: OPERATING EXPENSES (SCHEDULE 2)", ""]);
  rowIV.font = { bold: true };
  const totExp = summarySheet.addRow(["Total Operating Expenses", report.totalExpenseCents / 100]);
  totExp.font = { bold: true };
  totExp.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);

  const rowV = summarySheet.addRow(["V. ENDING BALANCE SUMMARY", ""]);
  rowV.font = { bold: true };
  summarySheet.addRow(["   Ending Cash on Hand", report.endingCashOnHandCents / 100]).getCell(2).numFmt = pesoFmt;
  summarySheet.addRow(["   Ending Cash in Bank", report.endingCashInBankCents / 100]).getCell(2).numFmt = pesoFmt;
  const netBal = summarySheet.addRow(["Net Remaining Balance", report.endingBalanceCents / 100]);
  netBal.font = { bold: true, size: 12 };
  netBal.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);
  summarySheet.addRow([]);

  summarySheet.addRow(["SIGNATURES & VERIFICATION", ""]);
  summarySheet.addRow(["Prepared by: _______________________", sanitizeExcelCellString(report.signatories.treasurerTitle)]);
  summarySheet.addRow(["Certified Correct: _______________________", sanitizeExcelCellString(report.signatories.auditorTitle)]);
  summarySheet.addRow(["Approved by: _______________________", sanitizeExcelCellString(report.signatories.adviserTitle)]);
  summarySheet.addRow(["Noted by / Approved by: _______________________", sanitizeExcelCellString(report.signatories.presidentOsaTitle)]);

  // 2. SCHEDULE 1 COLLECTIONS SHEET
  const sched1Sheet = workbook.addWorksheet("SCHEDULE 1 - COLLECTIONS", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sched1Sheet.columns = [
    { header: "Seq #", key: "seq", width: 10 },
    { header: "Category", key: "category", width: 25 },
    { header: "Payor / Source Name", key: "payor", width: 30 },
    { header: "Date", key: "date", width: 14 },
    { header: "Document #", key: "doc", width: 15 },
    { header: "Particulars / Description", key: "desc", width: 35 },
    { header: "Amount", key: "amount", width: 18 },
  ];

  sched1Sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sched1Sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF004AAD" },
  };

  for (const group of report.collectionGroups) {
    for (const item of group.items) {
      const row = sched1Sheet.addRow([
        item.sequenceNumber,
        sanitizeExcelCellString(group.categoryName),
        sanitizeExcelCellString(item.payorName),
        item.transactionDate.toISOString().split("T")[0],
        sanitizeExcelCellString(item.documentNumber),
        sanitizeExcelCellString(item.description),
        item.amountCents / 100,
      ]);
      row.getCell(7).numFmt = pesoFmt;
    }
  }
  const sched1TotalRow = sched1Sheet.addRow([
    "",
    "TOTAL COLLECTIONS",
    "",
    "",
    "",
    "",
    report.totalIncomeCents / 100,
  ]);
  sched1TotalRow.font = { bold: true };
  sched1TotalRow.getCell(7).numFmt = pesoFmt;

  // 3. SCHEDULE 2 EXPENSES SHEET
  const sched2Sheet = workbook.addWorksheet("SCHEDULE 2 - EXPENSES", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const baseCols = [
    { header: "Doc #", key: "doc", width: 14 },
    { header: "Date", key: "date", width: 14 },
    { header: "Payee Name", key: "payee", width: 28 },
    { header: "Particulars", key: "desc", width: 35 },
    { header: "Total Amount", key: "total", width: 18 },
  ];
  const catCols = report.expenseCategories.map((c) => ({
    header: sanitizeExcelCellString(c.bucketName),
    key: `cat_${c.bucketKey}`,
    width: 18,
  }));
  sched2Sheet.columns = [...baseCols, ...catCols];

  sched2Sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sched2Sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };

  for (const rowItem of report.expenseRows) {
    const rowValues: (string | number)[] = [
      sanitizeExcelCellString(rowItem.documentNumber),
      rowItem.transactionDate.toISOString().split("T")[0],
      sanitizeExcelCellString(rowItem.payeeName),
      sanitizeExcelCellString(rowItem.description),
      rowItem.amountCents / 100,
    ];

    for (const cat of report.expenseCategories) {
      const valCents = rowItem.categoryBucketCents[cat.bucketKey] || 0;
      rowValues.push(valCents > 0 ? valCents / 100 : 0);
    }

    const addedRow = sched2Sheet.addRow(rowValues);
    for (let c = 5; c <= rowValues.length; c++) {
      addedRow.getCell(c).numFmt = pesoFmt;
    }
  }

  const sched2TotalsValues: (string | number)[] = [
    "",
    "",
    "TOTAL EXPENSES",
    "",
    report.totalExpenseCents / 100,
  ];
  for (const cat of report.expenseCategories) {
    sched2TotalsValues.push(cat.totalCents / 100);
  }
  const sched2TotalsRow = sched2Sheet.addRow(sched2TotalsValues);
  sched2TotalsRow.font = { bold: true };
  for (let c = 5; c <= sched2TotalsValues.length; c++) {
    sched2TotalsRow.getCell(c).numFmt = pesoFmt;
  }

  // 4. ATTACHMENTS SHEET
  const attSheet = workbook.addWorksheet("RECEIPTS - ATTACHMENTS", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  attSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Document #", key: "doc", width: 14 },
    { header: "Transaction Description", key: "desc", width: 35 },
    { header: "Original File Name", key: "file", width: 30 },
    { header: "MIME Type", key: "mime", width: 20 },
    { header: "Size (KB)", key: "size", width: 14 },
  ];

  attSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  attSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF334155" },
  };

  for (const att of report.attachments) {
    attSheet.addRow([
      att.transactionDate.toISOString().split("T")[0],
      sanitizeExcelCellString(att.documentNumber),
      sanitizeExcelCellString(att.description),
      sanitizeExcelCellString(att.originalName),
      sanitizeExcelCellString(att.mimeType),
      Math.round(att.sizeBytes / 1024),
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
