export const APP_TIME_ZONE = "Asia/Manila";

const PHILIPPINE_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const PHILIPPINE_DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
});

const FINANCIAL_DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
});

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatPhilippineDateTime(value: Date | string): string {
  return PHILIPPINE_DATE_TIME_FORMATTER.format(toDate(value));
}

export function formatPhilippineDate(value: Date | string): string {
  return PHILIPPINE_DATE_FORMATTER.format(toDate(value));
}

export function formatFinancialDate(value: Date | string): string {
  return FINANCIAL_DATE_FORMATTER.format(toDate(value));
}
