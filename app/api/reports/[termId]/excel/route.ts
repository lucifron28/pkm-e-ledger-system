import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isManagementRole } from "@/lib/auth/rbac";
import { getReportPackageForTerm, type ReportPackageDto } from "@/lib/data/reports";
import { createAuditLog } from "@/lib/data/audit-log";
import { AuditAction } from "@prisma/client";
import ExcelJS from "exceljs";

async function buildReportExcelBuffer(report: ReportPackageDto): Promise<Buffer> {
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
  summarySheet.addRow([report.organizationName, ""]);
  summarySheet.addRow(["FINANCIAL SUMMARY REPORT", ""]);
  summarySheet.addRow([`${report.academicYear} - ${report.semesterLabel}`, ""]);
  summarySheet.addRow([]);

  // Title formatting
  summarySheet.getRow(1).font = { bold: true, size: 10, color: { argb: "FF64748B" } };
  summarySheet.getRow(2).font = { bold: true, size: 16, color: { argb: "FF004AAD" } };
  summarySheet.getRow(3).font = { bold: true, size: 12 };
  summarySheet.getRow(4).font = { italic: true, size: 10 };

  // Section I
  const rowI = summarySheet.addRow(["I. BALANCE FORWARDED (OPENING BALANCE)", ""]);
  rowI.font = { bold: true, color: { argb: "FF0F172A" } };
  summarySheet.addRow(["   Opening Cash on Hand", report.openingCashOnHandCents / 100]).getCell(2).numFmt = pesoFmt;
  summarySheet.addRow(["   Opening Cash in Bank", report.openingCashInBankCents / 100]).getCell(2).numFmt = pesoFmt;
  const totFwd = summarySheet.addRow(["Total Balance Forwarded", report.balanceForwardedCents / 100]);
  totFwd.font = { bold: true };
  totFwd.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);

  // Section II
  const rowII = summarySheet.addRow(["II. COLLECTIONS (INCOME BY CATEGORY)", ""]);
  rowII.font = { bold: true, color: { argb: "FF0F172A" } };
  for (const g of report.collectionGroups) {
    summarySheet.addRow([`   ${g.categoryName}`, g.totalCents / 100]).getCell(2).numFmt = pesoFmt;
  }
  const totColl = summarySheet.addRow(["Total Collections", report.totalIncomeCents / 100]);
  totColl.font = { bold: true };
  totColl.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);

  // Section III
  const rowIII = summarySheet.addRow(["III. TOTAL CASH AVAILABLE", report.totalCashAvailableCents / 100]);
  rowIII.font = { bold: true, size: 11, color: { argb: "FF004AAD" } };
  rowIII.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);

  // Section IV
  const rowIV = summarySheet.addRow(["IV. LESS: OPERATING EXPENSES (SCHEDULE 2)", ""]);
  rowIV.font = { bold: true };
  const totExp = summarySheet.addRow(["Total Operating Expenses", report.totalExpenseCents / 100]);
  totExp.font = { bold: true };
  totExp.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);

  // Section V
  const rowV = summarySheet.addRow(["V. ENDING BALANCE SUMMARY", ""]);
  rowV.font = { bold: true };
  summarySheet.addRow(["   Ending Cash on Hand", report.endingCashOnHandCents / 100]).getCell(2).numFmt = pesoFmt;
  summarySheet.addRow(["   Ending Cash in Bank", report.endingCashInBankCents / 100]).getCell(2).numFmt = pesoFmt;
  const netBal = summarySheet.addRow(["Net Remaining Balance", report.endingBalanceCents / 100]);
  netBal.font = { bold: true, size: 12 };
  netBal.getCell(2).numFmt = pesoFmt;
  summarySheet.addRow([]);
  summarySheet.addRow([]);

  // Signatures block (4 Signatures)
  summarySheet.addRow(["SIGNATURES & VERIFICATION", ""]);
  summarySheet.addRow(["Prepared by: _______________________", report.signatories.treasurerTitle]);
  summarySheet.addRow(["Certified Correct: _______________________", report.signatories.auditorTitle]);
  summarySheet.addRow(["Approved by: _______________________", report.signatories.adviserTitle]);
  summarySheet.addRow(["Noted by / Approved by: _______________________", report.signatories.presidentOsaTitle]);

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
        group.categoryName,
        item.payorName,
        item.transactionDate.toISOString().split("T")[0],
        item.documentNumber || "",
        item.description,
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

  // 3. SCHEDULE 2 EXPENSES SHEET (Fixed 8 buckets)
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
    header: c.bucketName,
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
      rowItem.documentNumber || "",
      rowItem.transactionDate.toISOString().split("T")[0],
      rowItem.payeeName,
      rowItem.description,
      rowItem.amountCents / 100,
    ];

    for (const cat of report.expenseCategories) {
      const valCents = rowItem.categoryBucketCents[cat.bucketKey] || 0;
      rowValues.push(valCents > 0 ? valCents / 100 : 0);
    }

    const addedRow = sched2Sheet.addRow(rowValues);
    // Format numeric columns
    for (let c = 5; c <= rowValues.length; c++) {
      addedRow.getCell(c).numFmt = pesoFmt;
    }
  }

  // Totals Row
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
      att.documentNumber || "",
      att.description,
      att.originalName,
      att.mimeType,
      Math.round(att.sizeBytes / 1024),
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ termId: string }> }
) {
  const sessionUser = await getSession();
  if (!sessionUser) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!isManagementRole(sessionUser.role) || !sessionUser.organizationId) {
    return new NextResponse("Access denied. Report generation is restricted to authorized officers.", { status: 403 });
  }

  const { termId } = await params;
  const report = await getReportPackageForTerm(termId);
  if (!report || report.organizationId !== sessionUser.organizationId) {
    return new NextResponse("Report term not found or access denied.", { status: 404 });
  }

  try {
    // 1. Generate file buffer first
    const excelBuffer = await buildReportExcelBuffer(report);

    // 2. Write mandatory audit log
    await createAuditLog({
      userId: sessionUser.id,
      organizationId: sessionUser.organizationId,
      role: sessionUser.role,
      action: AuditAction.GENERATED_REPORT,
      entityType: "ReportPackage",
      entityId: termId,
      metadata: { format: "XLSX", termId, academicYear: report.academicYear, semester: report.semester },
      throwOnError: true,
    });

    // 3. Return file response only after both succeed
    const safeSlug = report.organizationSlug.replace(/[^a-z0-9_-]/gi, "_");
    const safeAY = report.academicYear.replace(/[^a-z0-9_-]/gi, "_");
    const fileName = `Financial_Report_${safeSlug}_${safeAY}_${report.semester}.xlsx`;

    return new NextResponse(new Uint8Array(excelBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": excelBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Excel export error:", error);
    return new NextResponse("Failed to export report.", { status: 500 });
  }
}
