import PDFDocument from "pdfkit";
import { ReportPackageDto } from "@/lib/domain/reports";
import { formatPesoFromCents } from "@/lib/domain/money";
import {
  formatReportDate,
  getReportExpenseColumns,
  REPORT_SCHOOL_HEADER,
} from "@/lib/reports/report-layout";

const INK = "#172033";
const MUTED = "#475569";
const BORDER = "#CBD5E1";
const SECTION_FILL = "#E2E8F0";
const BLUE = "#004AAD";
const CONTENT_WIDTH = 540;

function formatPdfAmount(cents: number): string {
  return formatPesoFromCents(cents).replace(/^-?\u20B1/, (prefix) => `${prefix.startsWith("-") ? "-" : ""}PHP `);
}

function writePageHeader(
  doc: PDFKit.PDFDocument,
  report: ReportPackageDto,
  title: string,
  orientation: "portrait" | "landscape"
): void {
  const contentWidth = orientation === "landscape" ? 736 : CONTENT_WIDTH;
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(REPORT_SCHOOL_HEADER, {
    width: contentWidth,
    align: "center",
  });
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(title, {
    width: contentWidth,
    align: "center",
  });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLUE).text(report.organizationName, {
    width: contentWidth,
    align: "center",
  });
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(
    `${report.academicYear} | ${report.semesterLabel} | As of ${formatReportDate(report.asOfDate)}`,
    { width: contentWidth, align: "center" }
  );
  doc.moveDown(1.5);
}

function writeSectionHeading(doc: PDFKit.PDFDocument, label: string, width = CONTENT_WIDTH): void {
  const y = doc.y;
  doc.save();
  doc.fillColor(SECTION_FILL).rect(doc.page.margins.left, y, width, 18).fill();
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(label, doc.page.margins.left + 6, y + 5, {
    width: width - 12,
  });
  doc.y = y + 25;
}

function writeSummaryAmountRow(
  doc: PDFKit.PDFDocument,
  label: string,
  cents: number,
  options: { bold?: boolean; color?: string } = {}
): void {
  const y = doc.y;
  const font = options.bold ? "Helvetica-Bold" : "Helvetica";
  doc.font(font).fontSize(9).fillColor(options.color || INK).text(label, 42, y, { width: 360 });
  doc.text(formatPdfAmount(cents), 430, y, { width: 140, align: "right" });
  doc.moveTo(42, y + 16).lineTo(576, y + 16).strokeColor(BORDER).lineWidth(0.5).stroke();
  doc.y = y + 21;
}

function writeSignatureSection(doc: PDFKit.PDFDocument, report: ReportPackageDto): void {
  writeSectionHeading(doc, "SIGNATURE SECTION");
  const columns = [
    ["Prepared by:", report.signatories.treasurerTitle],
    ["Certified Correct:", report.signatories.auditorTitle],
    ["Approved by:", report.signatories.adviserTitle],
    ["Noted / Approved:", report.signatories.presidentOsaTitle],
  ];
  const startX = 42;
  const columnWidth = 132;
  const startY = doc.y;
  columns.forEach(([label, title], index) => {
    const x = startX + index * columnWidth;
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(label, x, startY, { width: columnWidth - 8 });
    doc.moveTo(x, startY + 33).lineTo(x + columnWidth - 12, startY + 33).strokeColor(INK).lineWidth(0.7).stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor(INK).text(title, x, startY + 39, { width: columnWidth - 8, align: "center" });
  });
  doc.y = startY + 58;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  values: string[],
  widths: number[],
  y: number,
  options: { header?: boolean; total?: boolean } = {}
): number {
  const font = options.header || options.total ? "Helvetica-Bold" : "Helvetica";
  const size = options.header ? 7 : options.total ? 7.5 : 7;
  doc.font(font).fontSize(size);
  const heights = values.map((value, index) => doc.heightOfString(value || "", { width: Math.max(widths[index] - 8, 10) }));
  const height = Math.max(options.header ? 28 : 18, ...heights.map((item) => item + 8));
  let x = doc.page.margins.left;
  values.forEach((value, index) => {
    if (options.header) {
      doc.save();
      doc.fillColor("#F1F5F9").rect(x, y, widths[index], height).fill();
      doc.restore();
    } else if (options.total) {
      doc.save();
      doc.fillColor("#F8FAFC").rect(x, y, widths[index], height).fill();
      doc.restore();
    }
    doc.rect(x, y, widths[index], height).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.fillColor(options.total ? INK : options.header ? INK : "#334155").text(value || "", x + 4, y + 4, {
      width: Math.max(widths[index] - 8, 10),
      height: height - 6,
      align: index >= 2 ? "right" : "left",
    });
    x += widths[index];
  });
  return height;
}

function addPortraitPage(doc: PDFKit.PDFDocument, report: ReportPackageDto, title: string): void {
  doc.addPage({ size: "LETTER", layout: "portrait", margin: 36 });
  writePageHeader(doc, report, title, "portrait");
}

function addLandscapePage(doc: PDFKit.PDFDocument, report: ReportPackageDto, title: string): void {
  doc.addPage({ size: "LETTER", layout: "landscape", margin: 28 });
  writePageHeader(doc, report, title, "landscape");
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
      writePageHeader(doc, report, "FINANCIAL SUMMARY REPORT", "portrait");
      writeSectionHeading(doc, "I. BALANCE FORWARDED");
      writeSummaryAmountRow(doc, "Cash on Hand", report.openingCashOnHandCents);
      writeSummaryAmountRow(doc, "Cash in Bank", report.openingCashInBankCents);
      writeSummaryAmountRow(doc, "Balance Forwarded", report.balanceForwardedCents, { bold: true, color: BLUE });

      doc.moveDown(0.4);
      writeSectionHeading(doc, "II. ADD: COLLECTIONS");
      for (const group of report.collectionGroups) {
        writeSummaryAmountRow(doc, group.categoryName, group.totalCents);
      }
      if (report.collectionGroups.length === 0) {
        doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED).text("No collections recorded for this term.", 42);
        doc.moveDown(0.6);
      }
      writeSummaryAmountRow(doc, "Total Collections", report.totalIncomeCents, { bold: true, color: "#15803D" });

      doc.moveDown(0.4);
      writeSectionHeading(doc, "III. TOTAL CASH AVAILABLE");
      writeSummaryAmountRow(doc, "Total Cash Available", report.totalCashAvailableCents, { bold: true, color: BLUE });

      doc.moveDown(0.4);
      writeSectionHeading(doc, "IV. LESS: EXPENSES");
      writeSummaryAmountRow(doc, "Total Expenses", report.totalExpenseCents, { bold: true, color: "#B91C1C" });

      doc.moveDown(0.4);
      writeSectionHeading(doc, "V. ENDING BALANCE");
      writeSummaryAmountRow(doc, "Cash on Hand", report.endingCashOnHandCents);
      writeSummaryAmountRow(doc, "Cash in Bank", report.endingCashInBankCents);
      writeSummaryAmountRow(doc, "Ending Balance", report.endingBalanceCents, { bold: true, color: BLUE });
      doc.moveDown(0.6);
      writeSignatureSection(doc, report);

      // Schedule 1: portrait collection pages with one grouped three-column table.
      addPortraitPage(doc, report, "SUMMARY OF COLLECTIONS");
      doc.font("Helvetica-Bold").fontSize(10).fillColor(BLUE).text("SCHEDULE 1", { align: "center" });
      doc.moveDown(0.6);
      const collectionWidths = [54, 350, 136];
      if (report.collectionGroups.length === 0) {
        drawTableRow(doc, ["Sequence number", "Payor / Source Name", "Amount"], collectionWidths, doc.y, { header: true });
        doc.y += 28;
        drawTableRow(doc, ["", "No collections recorded", ""], collectionWidths, doc.y);
        doc.y += 20;
      }
      for (const group of report.collectionGroups) {
        if (doc.y > 700) addPortraitPage(doc, report, "SUMMARY OF COLLECTIONS (CONTINUED)");
        writeSectionHeading(doc, group.categoryName);
        let y = doc.y;
        const headerHeight = drawTableRow(doc, ["Sequence number", "Payor / Source Name", "Amount"], collectionWidths, y, { header: true });
        y += headerHeight;
        for (const item of group.items) {
          const rowHeight = drawTableRow(
            doc,
            [String(item.sequenceNumber), item.payorName, formatPdfAmount(item.amountCents)],
            collectionWidths,
            y
          );
          y += rowHeight;
          if (y > 700 && item !== group.items[group.items.length - 1]) {
            addPortraitPage(doc, report, "SUMMARY OF COLLECTIONS (CONTINUED)");
            writeSectionHeading(doc, `${group.categoryName} (CONTINUED)`);
            y = doc.y;
            y += drawTableRow(doc, ["Sequence number", "Payor / Source Name", "Amount"], collectionWidths, y, { header: true });
          }
        }
        const subtotalHeight = drawTableRow(doc, ["", "Total per schedule", formatPdfAmount(group.totalCents)], collectionWidths, y, { total: true });
        doc.y = y + subtotalHeight + 12;
      }
      drawTableRow(doc, ["", "TOTAL PER SCHEDULE", formatPdfAmount(report.totalIncomeCents)], collectionWidths, doc.y, { total: true });

      // Schedule 2: landscape expense matrix.
      const expenseColumns = getReportExpenseColumns(report.expenseCategories);
      addLandscapePage(doc, report, "SUMMARY OF EXPENSES");
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("SCHEDULE 2", { align: "center" });
      doc.moveDown(0.6);

      const desiredWidths = [42, 52, 72, 100, 52, ...expenseColumns.map((column) =>
        column.key === "Transportation" ? 72 : column.key === "Misc" ? 64 : column.key === "Others" ? 60 : 48
      )];
      const scale = Math.min(1, 736 / desiredWidths.reduce((total, width) => total + width, 0));
      const expenseWidths = desiredWidths.map((width) => width * scale);
      const expenseHeaders = [
        "Doc No.",
        "Date",
        "Payee",
        "Particulars",
        "Amount",
        ...expenseColumns.map((column) => column.label),
      ];
      const expenseBottom = 584;
      let expenseY = doc.y;
      expenseY += drawTableRow(doc, expenseHeaders, expenseWidths, expenseY, { header: true });
      for (const row of report.expenseRows) {
        const values = [
          row.documentNumber || "",
          formatReportDate(row.transactionDate),
          row.payeeName,
          row.description,
          formatPdfAmount(row.amountCents),
          ...expenseColumns.map((column) => {
            const cents = row.categoryBucketCents[column.key] || 0;
            return cents > 0 ? formatPdfAmount(cents) : "";
          }),
        ];
        const heightEstimate = Math.max(
          18,
          ...values.map((value, index) => doc.heightOfString(value, { width: Math.max(expenseWidths[index] - 8, 10) }) + 8)
        );
        if (expenseY + heightEstimate > expenseBottom) {
          addLandscapePage(doc, report, "SUMMARY OF EXPENSES (CONTINUED)");
          doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("SCHEDULE 2", { align: "center" });
          doc.moveDown(0.6);
          expenseY = doc.y;
          expenseY += drawTableRow(doc, expenseHeaders, expenseWidths, expenseY, { header: true });
        }
        expenseY += drawTableRow(doc, values, expenseWidths, expenseY);
      }
      const totals = [
        "",
        "",
        "TOTAL EXPENSES",
        "",
        formatPdfAmount(report.totalExpenseCents),
        ...expenseColumns.map((column) => {
          const total = report.expenseCategories.find((item) => item.bucketKey === column.key)?.totalCents || 0;
          return formatPdfAmount(total);
        }),
      ];
      if (expenseY + 24 > expenseBottom) {
        addLandscapePage(doc, report, "SUMMARY OF EXPENSES (CONTINUED)");
        doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("SCHEDULE 2", { align: "center" });
        doc.moveDown(0.6);
        expenseY = doc.y;
      }
      drawTableRow(doc, totals, expenseWidths, expenseY, { total: true });

      // Receipts / attachments reference: metadata only; files remain behind authorized routes.
      addPortraitPage(doc, report, "RECEIPTS / ATTACHMENTS");
      const attachmentWidths = [72, 58, 68, 150, 112, 54, 56];
      const attachmentHeaders = ["Entry", "Date", "Document No.", "Particulars", "Original File Name", "Type", "Size KB"];
      let attachmentY = doc.y;
      attachmentY += drawTableRow(doc, attachmentHeaders, attachmentWidths, attachmentY, { header: true });
      if (report.attachments.length === 0) {
        drawTableRow(doc, ["", "", "", "No attachments associated with this report package.", "", "", ""], attachmentWidths, attachmentY);
      } else {
        for (const attachment of report.attachments) {
          const values = [
            attachment.entryType === "CASH_TRANSFER" ? "Transfer" : "Transaction",
            formatReportDate(attachment.transactionDate),
            attachment.documentNumber || "",
            attachment.description,
            attachment.originalName,
            attachment.mimeType.split("/")[1] || attachment.mimeType,
            String(Math.ceil(attachment.sizeBytes / 1024)),
          ];
          const rowHeight = Math.max(
            18,
            ...values.map((value, index) => doc.heightOfString(value, { width: Math.max(attachmentWidths[index] - 8, 10) }) + 8)
          );
          if (attachmentY + rowHeight > 700) {
            addPortraitPage(doc, report, "RECEIPTS / ATTACHMENTS (CONTINUED)");
            attachmentY = doc.y;
            attachmentY += drawTableRow(doc, attachmentHeaders, attachmentWidths, attachmentY, { header: true });
          }
          attachmentY += drawTableRow(doc, values, attachmentWidths, attachmentY);
        }
      }

      doc.end();
    } catch (error) {
      reject(error as Error);
    }
  });
}
