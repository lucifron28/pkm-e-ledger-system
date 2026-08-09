import type { Schedule2Bucket } from "@/lib/domain/reports";

export interface ReportExpenseColumn {
  key: Schedule2Bucket;
  label: string;
  totalCents: number;
}

export interface ReportExpenseColumnInput {
  key?: Schedule2Bucket;
  bucketKey?: Schedule2Bucket;
  totalCents: number;
  label?: string;
  bucketName?: string;
}

export function getReportExpenseColumns(
  categories: readonly ReportExpenseColumnInput[]
): ReportExpenseColumn[] {
  return categories
    .map((category) => ({
      key: category.key || category.bucketKey,
      totalCents: category.totalCents,
      label: category.label || category.bucketName || category.key || category.bucketKey || "Others",
    }))
    .filter((category): category is ReportExpenseColumn =>
      Boolean(category.key) && (category.key !== "Others" || category.totalCents > 0)
    )
    .map((category) => ({
      key: category.key as Schedule2Bucket,
      totalCents: category.totalCents,
      label: category.label,
    }));
}

/** Keep report dates stable across server, browser, PDF, and Excel output. */
export function formatReportDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1);
  const day = String(date.getUTCDate());
  return `${month}/${day}/${date.getUTCFullYear()}`;
}

/** Excel date cells should contain dates, not user-visible date strings. */
export function toReportDateCell(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export const REPORT_CURRENCY_FORMAT = '"PHP" #,##0.00';
export const REPORT_DATE_FORMAT = "m/d/yyyy";
export const REPORT_SCHOOL_HEADER = "PAMBAYANG KOLEHIYO NG MAUBAN";
