import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isManagementRole } from "@/lib/auth/rbac";
import { getReportPackageForTerm, type ReportPackageDto } from "@/lib/data/reports";
import { createAuditLog } from "@/lib/data/audit-log";
import { formatPesoFromCents } from "@/lib/data/money";
import { AuditAction } from "@prisma/client";
import PDFDocument from "pdfkit";

function buildReportPdfBuffer(report: ReportPackageDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "LETTER", margin: 36 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      // PAGE 1: Summary Report (Portrait)
      doc.fontSize(10).fillColor("#64748b").text("PAMBAYANG KOLEHIYO NG MAUBAN", { align: "center" });
      doc.moveDown(0.2);
      doc.fontSize(16).fillColor("#004aad").font("Helvetica-Bold").text(report.organizationName, { align: "center" });
      doc.moveDown(0.2);
      doc.fontSize(12).fillColor("#0f172a").font("Helvetica-Bold").text("FINANCIAL SUMMARY REPORT", { align: "center" });
      doc.fontSize(10).fillColor("#475569").font("Helvetica").text(`${report.academicYear} • ${report.semesterLabel}`, { align: "center" });
      doc.moveDown(1.5);

      // Section 1: Balance Forwarded
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("I. BALANCE FORWARDED (OPENING BALANCES)");
      doc.moveDown(0.4);
      doc.fontSize(10).font("Helvetica").fillColor("#334155");
      doc.text(`   Opening Cash on Hand: ${formatPesoFromCents(report.openingCashOnHandCents)}`);
      doc.text(`   Opening Cash in Bank: ${formatPesoFromCents(report.openingCashInBankCents)}`);
      doc.font("Helvetica-Bold").fillColor("#004aad");
      doc.text(`   Total Balance Forwarded: ${formatPesoFromCents(report.balanceForwardedCents)}`);
      doc.moveDown(0.8);

      // Section 2: Collections
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("II. COLLECTIONS (INCOME BY CATEGORY)");
      doc.moveDown(0.4);
      doc.fontSize(10).font("Helvetica").fillColor("#334155");
      if (report.collectionGroups.length === 0) {
        doc.text("   No collections recorded for this academic term.");
      } else {
        for (const g of report.collectionGroups) {
          doc.text(`   • ${g.categoryName}: ${formatPesoFromCents(g.totalCents)}`);
        }
      }
      doc.font("Helvetica-Bold").fillColor("#15803d");
      doc.text(`   Total Collections: ${formatPesoFromCents(report.totalIncomeCents)}`);
      doc.moveDown(0.8);

      // Section 3: Cash Available
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#004aad");
      doc.text(`III. TOTAL CASH AVAILABLE: ${formatPesoFromCents(report.totalCashAvailableCents)}`);
      doc.moveDown(0.8);

      // Section 4: Operating Expenses
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("IV. LESS: OPERATING EXPENSES (SCHEDULE 2)");
      doc.moveDown(0.4);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#b91c1c");
      doc.text(`   Total Expenses: ${formatPesoFromCents(report.totalExpenseCents)}`);
      doc.moveDown(0.8);

      // Section 5: Ending Balances
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("V. ENDING BALANCE SUMMARY");
      doc.moveDown(0.4);
      doc.fontSize(10).font("Helvetica").fillColor("#334155");
      doc.text(`   Ending Cash on Hand: ${formatPesoFromCents(report.endingCashOnHandCents)}`);
      doc.text(`   Ending Cash in Bank: ${formatPesoFromCents(report.endingCashInBankCents)}`);
      doc.font("Helvetica-Bold").fillColor("#004aad").fontSize(11);
      doc.text(`   Net Remaining Balance: ${formatPesoFromCents(report.endingBalanceCents)}`);
      doc.moveDown(1.5);

      // Signatures (4 columns)
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#0f172a").text("SIGNATURES & VERIFICATION", { align: "center" });
      doc.moveDown(1.2);
      const sigY = doc.y;
      doc.font("Helvetica").fontSize(8).fillColor("#475569");

      // Col 1: Treasurer
      doc.text("Prepared by:", 36, sigY);
      doc.text("_________________", 36, sigY + 25);
      doc.text(report.signatories.treasurerTitle, 36, sigY + 38);

      // Col 2: Auditor
      doc.text("Certified Correct:", 170, sigY);
      doc.text("_________________", 170, sigY + 25);
      doc.text(report.signatories.auditorTitle, 170, sigY + 38);

      // Col 3: Adviser
      doc.text("Approved by:", 310, sigY);
      doc.text("_________________", 310, sigY + 25);
      doc.text(report.signatories.adviserTitle, 310, sigY + 38);

      // Col 4: President / OSA
      doc.text("Noted / Approved:", 450, sigY);
      doc.text("_________________", 450, sigY + 25);
      doc.text(report.signatories.presidentOsaTitle, 450, sigY + 38);

      // PAGE 2: Schedule 1 — Collections
      doc.addPage({ size: "LETTER", margin: 36 });
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#0f172a").text("SCHEDULE 1 — COLLECTIONS SCHEDULE", { align: "center" });
      doc.fontSize(10).font("Helvetica").fillColor("#475569").text(`${report.organizationName} • ${report.academicYear} ${report.semesterLabel}`, { align: "center" });
      doc.moveDown(1.5);

      if (report.collectionGroups.length === 0) {
        doc.fontSize(10).text("No collections recorded for this academic term.");
      } else {
        for (const group of report.collectionGroups) {
          doc.fontSize(11).font("Helvetica-Bold").fillColor("#004aad").text(`Category: ${group.categoryName}`);
          doc.moveDown(0.3);

          for (const item of group.items) {
            const dateStr = item.transactionDate.toISOString().split("T")[0];
            const refStr = item.documentNumber ? ` (${item.documentNumber})` : "";
            doc.fontSize(9).font("Helvetica").fillColor("#334155");
            doc.text(`  Seq #${item.sequenceNumber} | ${dateStr}${refStr} | Payor: ${item.payorName} | Amount: ${formatPesoFromCents(item.amountCents)}`);
          }
          doc.fontSize(9).font("Helvetica-Bold").fillColor("#15803d");
          doc.text(`  Category Subtotal: ${formatPesoFromCents(group.totalCents)}`);
          doc.moveDown(0.8);
        }
        doc.fontSize(11).font("Helvetica-Bold").fillColor("#15803d");
        doc.text(`OVERALL TOTAL COLLECTIONS: ${formatPesoFromCents(report.totalIncomeCents)}`);
      }

      // PAGE 3: Schedule 2 — Expenses (Landscape with exact 8 bucket columns)
      doc.addPage({ size: "LETTER", layout: "landscape", margin: 36 });
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#0f172a").text("SCHEDULE 2 — OPERATING EXPENSE SCHEDULE", { align: "center" });
      doc.fontSize(10).font("Helvetica").fillColor("#475569").text(`${report.organizationName} • ${report.academicYear} ${report.semesterLabel}`, { align: "center" });
      doc.moveDown(1.2);

      if (report.expenseRows.length === 0) {
        doc.fontSize(10).text("No operating expenses recorded for this academic term.");
      } else {
        // Table Header
        doc.fontSize(8).font("Helvetica-Bold").fillColor("#0f172a");
        const headers = ["Doc #", "Date", "Payee", "Particulars", "Total", "Supplies", "Equip", "Trans", "Meals", "Service", "Misc", "Donation", "Others"];
        const colWidths = [45, 55, 80, 95, 60, 48, 48, 48, 48, 48, 48, 48, 48];
        const startX = 36;
        let curX = startX;

        headers.forEach((h, i) => {
          doc.text(h, curX, doc.y, { width: colWidths[i], align: i >= 4 ? "right" : "left" });
          curX += colWidths[i];
        });
        doc.moveDown(0.5);

        // Table Rows
        doc.fontSize(7.5).font("Helvetica").fillColor("#334155");
        for (const row of report.expenseRows) {
          const y = doc.y;
          if (y > 540) {
            doc.addPage({ size: "LETTER", layout: "landscape", margin: 36 });
          }
          const rowY = doc.y;
          const dateStr = row.transactionDate.toISOString().split("T")[0];
          const values = [
            row.documentNumber || "N/A",
            dateStr,
            row.payeeName,
            row.description,
            formatPesoFromCents(row.amountCents),
            row.categoryBucketCents.Supplies > 0 ? formatPesoFromCents(row.categoryBucketCents.Supplies) : "—",
            row.categoryBucketCents.Equipment > 0 ? formatPesoFromCents(row.categoryBucketCents.Equipment) : "—",
            row.categoryBucketCents.Transportation > 0 ? formatPesoFromCents(row.categoryBucketCents.Transportation) : "—",
            row.categoryBucketCents.Meals > 0 ? formatPesoFromCents(row.categoryBucketCents.Meals) : "—",
            row.categoryBucketCents.Service > 0 ? formatPesoFromCents(row.categoryBucketCents.Service) : "—",
            row.categoryBucketCents.Misc > 0 ? formatPesoFromCents(row.categoryBucketCents.Misc) : "—",
            row.categoryBucketCents.Donation > 0 ? formatPesoFromCents(row.categoryBucketCents.Donation) : "—",
            row.categoryBucketCents.Others > 0 ? formatPesoFromCents(row.categoryBucketCents.Others) : "—",
          ];

          let cX = startX;
          values.forEach((v, i) => {
            doc.text(v, cX, rowY, { width: colWidths[i], align: i >= 4 ? "right" : "left" });
            cX += colWidths[i];
          });
          doc.moveDown(0.4);
        }

        // Totals Row
        doc.moveDown(0.5);
        const totY = doc.y;
        doc.fontSize(8).font("Helvetica-Bold").fillColor("#b91c1c");
        const totValues = [
          "",
          "",
          "TOTALS",
          "",
          formatPesoFromCents(report.totalExpenseCents),
          ...report.expenseCategories.map((c) => formatPesoFromCents(c.totalCents)),
        ];
        let tX = startX;
        totValues.forEach((v, i) => {
          doc.text(v, tX, totY, { width: colWidths[i], align: i >= 4 ? "right" : "left" });
          tX += colWidths[i];
        });
      }

      // PAGE 4: Supporting Attachments Reference (Portrait)
      doc.addPage({ size: "LETTER", layout: "portrait", margin: 36 });
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#0f172a").text("SUPPORTING RECEIPTS & ATTACHMENTS REFERENCE", { align: "center" });
      doc.fontSize(10).font("Helvetica").fillColor("#475569").text(`${report.organizationName} • ${report.academicYear} ${report.semesterLabel}`, { align: "center" });
      doc.moveDown(1.5);

      if (report.attachments.length === 0) {
        doc.fontSize(10).text("No receipt attachments associated with transactions in this report package.");
      } else {
        for (const att of report.attachments) {
          const dateStr = att.transactionDate.toISOString().split("T")[0];
          const docStr = att.documentNumber ? ` (Doc: ${att.documentNumber})` : "";
          doc.fontSize(9).font("Helvetica").fillColor("#334155");
          doc.text(`• ${dateStr}${docStr} - ${att.description} | File: ${att.originalName} (${(att.sizeBytes / 1024).toFixed(1)} KB)`);
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
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
    const pdfBuffer = await buildReportPdfBuffer(report);

    // 2. Write mandatory audit log
    await createAuditLog({
      userId: sessionUser.id,
      organizationId: sessionUser.organizationId,
      role: sessionUser.role,
      action: AuditAction.GENERATED_REPORT,
      entityType: "ReportPackage",
      entityId: termId,
      metadata: { format: "PDF", termId, academicYear: report.academicYear, semester: report.semester },
      throwOnError: true,
    });

    // 3. Return file response only after both succeed
    const safeSlug = report.organizationSlug.replace(/[^a-z0-9_-]/gi, "_");
    const safeAY = report.academicYear.replace(/[^a-z0-9_-]/gi, "_");
    const fileName = `Financial_Report_${safeSlug}_${safeAY}_${report.semester}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("PDF export error:", error);
    return new NextResponse("Failed to export report.", { status: 500 });
  }
}
