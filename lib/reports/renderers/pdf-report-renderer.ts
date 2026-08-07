import PDFDocument from "pdfkit";
import { ReportPackageDto } from "@/lib/domain/reports";
import { formatPesoFromCents } from "@/lib/domain/money";

function writePageHeader(doc: PDFKit.PDFDocument, report: ReportPackageDto, title: string): void {
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a").text(title, { align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor("#475569").text(
    `${report.organizationName} | ${report.academicYear} | ${report.semesterLabel}`,
    { align: "center" }
  );
  doc.fontSize(8).text(
    `As of ${report.asOfDate.toISOString().slice(0, 10)}`,
    { align: "center" }
  );
  doc.moveDown(1);
}

function writeSignatureSection(doc: PDFKit.PDFDocument, report: ReportPackageDto): void {
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text("SIGNATURE SECTION", { align: "center" });
  doc.moveDown(1);
  const columns = [
    ["Prepared by:", report.signatories.treasurerTitle],
    ["Certified Correct:", report.signatories.auditorTitle],
    ["Approved by:", report.signatories.adviserTitle],
    ["Noted / Approved:", report.signatories.presidentOsaTitle],
  ];
  const startY = doc.y;
  columns.forEach(([label, title], index) => {
    const x = 36 + index * 135;
    doc.font("Helvetica").fontSize(8).fillColor("#475569").text(label, x, startY, { width: 120 });
    doc.text("_________________", x, startY + 28, { width: 120 });
    doc.text(title, x, startY + 42, { width: 120 });
  });
}

export function buildReportPdfBuffer(report: ReportPackageDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      // Summary report: portrait.
      doc.font("Helvetica").fontSize(9).fillColor("#64748b").text("PAMBAYANG KOLEHIYO NG MAUBAN", { align: "center" });
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#004aad").text(report.organizationName, { align: "center" });
      doc.fontSize(12).fillColor("#0f172a").text("FINANCIAL SUMMARY REPORT", { align: "center" });
      doc.font("Helvetica").fontSize(9).fillColor("#475569").text(`${report.academicYear} | ${report.semesterLabel}`, { align: "center" });
      doc.text(`As of ${report.asOfDate.toISOString().slice(0, 10)}`, { align: "center" });
      doc.moveDown(1.2);

      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text("I. BALANCE FORWARDED");
      doc.font("Helvetica").fontSize(9).fillColor("#334155");
      doc.text(`Cash on Hand: ${formatPesoFromCents(report.openingCashOnHandCents)}`);
      doc.text(`Cash in Bank: ${formatPesoFromCents(report.openingCashInBankCents)}`);
      doc.font("Helvetica-Bold").fillColor("#004aad").text(`Balance Forwarded: ${formatPesoFromCents(report.balanceForwardedCents)}`);
      doc.moveDown(0.7);

      doc.font("Helvetica-Bold").fillColor("#0f172a").text("II. COLLECTIONS BY INCOME REPORT BUCKET");
      doc.font("Helvetica").fillColor("#334155");
      for (const group of report.collectionGroups) {
        doc.text(`${group.categoryName}: ${formatPesoFromCents(group.totalCents)}`);
      }
      doc.font("Helvetica-Bold").fillColor("#15803d").text(`Total Collections: ${formatPesoFromCents(report.totalIncomeCents)}`);
      doc.moveDown(0.7);

      doc.font("Helvetica-Bold").fontSize(10).fillColor("#004aad").text(`III. TOTAL CASH AVAILABLE: ${formatPesoFromCents(report.totalCashAvailableCents)}`);
      doc.moveDown(0.7);
      doc.font("Helvetica-Bold").fillColor("#0f172a").text("IV. LESS: EXPENSES");
      doc.font("Helvetica-Bold").fillColor("#b91c1c").text(`Total Expenses: ${formatPesoFromCents(report.totalExpenseCents)}`);
      doc.moveDown(0.7);
      doc.font("Helvetica-Bold").fillColor("#0f172a").text("V. ENDING BALANCE");
      doc.font("Helvetica").fillColor("#334155");
      doc.text(`Cash on Hand: ${formatPesoFromCents(report.endingCashOnHandCents)}`);
      doc.text(`Cash in Bank: ${formatPesoFromCents(report.endingCashInBankCents)}`);
      doc.font("Helvetica-Bold").fillColor("#004aad").text(`Ending Balance: ${formatPesoFromCents(report.endingBalanceCents)}`);
      doc.moveDown(1.2);
      writeSignatureSection(doc, report);

      // Schedule 1: portrait collection pages.
      doc.addPage({ size: "LETTER", layout: "portrait", margin: 36 });
      writePageHeader(doc, report, "SCHEDULE 1 - COLLECTIONS");
      if (report.collectionGroups.length === 0) {
        doc.font("Helvetica").fontSize(9).text("No collections recorded for this term.");
      }
      for (const group of report.collectionGroups) {
        if (doc.y > 690) {
          doc.addPage({ size: "LETTER", layout: "portrait", margin: 36 });
          writePageHeader(doc, report, "SCHEDULE 1 - COLLECTIONS (CONTINUED)");
        }
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#004aad").text(`Collection Group: ${group.categoryName}`);
        doc.font("Helvetica-Bold").fillColor("#0f172a").text("Seq | Payor / Source Name | Amount");
        for (const item of group.items) {
          doc.font("Helvetica").fillColor("#334155").text(
            `${item.sequenceNumber} | ${item.payorName} | ${formatPesoFromCents(item.amountCents)}`
          );
        }
        doc.font("Helvetica-Bold").fillColor("#15803d").text(`Total per schedule: ${formatPesoFromCents(group.totalCents)}`);
        doc.moveDown(0.7);
      }
      doc.font("Helvetica-Bold").fillColor("#15803d").text(`TOTAL COLLECTIONS: ${formatPesoFromCents(report.totalIncomeCents)}`);

      // Schedule 2: landscape expense matrix.
      doc.addPage({ size: "LETTER", layout: "landscape", margin: 28 });
      writePageHeader(doc, report, "SCHEDULE 2 - EXPENSES");
      const headers = ["Doc No.", "Date", "Payee", "Particulars", "Amount", "Supplies", "Equipment", "Transportation", "Meals", "Service", "Miscellaneous", "Donation", "Others"];
      const colWidths = [45, 52, 82, 96, 58, 52, 52, 60, 48, 48, 60, 52, 48];
      const startX = 28;
      const drawHeaders = () => {
        const y = doc.y;
        let x = startX;
        doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#0f172a");
        headers.forEach((header, index) => {
          doc.text(header, x, y, { width: colWidths[index], align: index >= 4 ? "right" : "left" });
          x += colWidths[index];
        });
        doc.y = y + 18;
      };
      drawHeaders();
      for (const row of report.expenseRows) {
        if (doc.y > 520) {
          doc.addPage({ size: "LETTER", layout: "landscape", margin: 28 });
          writePageHeader(doc, report, "SCHEDULE 2 - EXPENSES (CONTINUED)");
          drawHeaders();
        }
        const values = [
          row.documentNumber || "-",
          row.transactionDate.toISOString().slice(0, 10),
          row.payeeName,
          row.description,
          formatPesoFromCents(row.amountCents),
          ...headers.slice(5).map((header) => {
            const key = header as keyof typeof row.categoryBucketCents;
            const cents = row.categoryBucketCents[key];
            return cents > 0 ? formatPesoFromCents(cents) : "-";
          }),
        ];
        const y = doc.y;
        let x = startX;
        doc.font("Helvetica").fontSize(6.3).fillColor("#334155");
        values.forEach((value, index) => {
          doc.text(value, x, y, { width: colWidths[index], align: index >= 4 ? "right" : "left" });
          x += colWidths[index];
        });
        doc.y = y + 18;
      }
      const totalY = doc.y + 4;
      let totalX = startX;
      const totalValues = ["", "", "TOTALS", "", formatPesoFromCents(report.totalExpenseCents), ...report.expenseCategories.map((category) => formatPesoFromCents(category.totalCents))];
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#b91c1c");
      totalValues.forEach((value, index) => {
        doc.text(value, totalX, totalY, { width: colWidths[index], align: index >= 4 ? "right" : "left" });
        totalX += colWidths[index];
      });

      // Optional receipts / attachments reference.
      doc.addPage({ size: "LETTER", layout: "portrait", margin: 36 });
      writePageHeader(doc, report, "RECEIPTS / ATTACHMENTS REFERENCE");
      if (report.attachments.length === 0) {
        doc.font("Helvetica").fontSize(9).text("No receipt attachments associated with this report package.");
      }
      for (const attachment of report.attachments) {
        doc.font("Helvetica").fontSize(8).fillColor("#334155").text(
          `${attachment.entryType} | ${attachment.transactionDate.toISOString().slice(0, 10)} | ${attachment.description} | ${attachment.originalName} | ${(attachment.sizeBytes / 1024).toFixed(1)} KB`
        );
      }

      doc.end();
    } catch (error) {
      reject(error as Error);
    }
  });
}
