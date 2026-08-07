import { CashAccount, Semester, TransactionType } from "@prisma/client";
import { normalizeAcademicYear } from "./term-labels";
import { ValidationError } from "./errors";
import { z } from "zod";

export function parseStrictVersion(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ValidationError("Version must be a positive integer.");
  }
  const str = String(value).trim();
  if (!/^[1-9]\d*$/.test(str)) {
    throw new ValidationError("Version must be a positive integer.");
  }
  const num = Number(str);
  if (!Number.isSafeInteger(num) || num < 1 || num > 2_147_483_647) {
    throw new ValidationError("Version must be a positive integer.");
  }
  return num;
}

export const strictVersionSchema = z
  .string()
  .trim()
  .min(1, "Version is required.")
  .regex(/^[1-9]\d*$/, "Version must be a positive integer.")
  .refine((v) => Number.isSafeInteger(Number(v)) && Number(v) <= 2_147_483_647, "Version must be a positive integer.");

export interface ParsedLedgerQuery {
  academicYear?: string;
  semester?: Semester;
  type?: TransactionType;
  entryType?: LedgerEntryType;
  categoryId?: string;
  cashAccount?: CashAccount;
  month?: string;
  eventActivityName?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  org?: string;
  cursor?: string;
  pageSize: number;
  invalidTermSelection: boolean;
  invalidDateRange: boolean;
  invalidMonth: boolean;
  invalidCursor: boolean;
  invalidPageSize: boolean;
  invalidAcademicYear: boolean;
  invalidSemester: boolean;
  invalidType: boolean;
  invalidEntryType: boolean;
  invalidCashAccount: boolean;
  invalidCategoryId: boolean;
  invalidScalarFilter: boolean;
  invalidOrganization: boolean;
}

export type LedgerEntryType = "TRANSACTION" | "TRANSFER";

export interface ParsedTermSelection {
  academicYear?: string;
  semester?: Semester;
  invalidAcademicYear: boolean;
  invalidSemester: boolean;
  invalidTermSelection: boolean;
}

export interface ParsedOrganizationParam {
  org?: string;
  invalidOrganization: boolean;
}

export interface ParsedDateRangeParams {
  dateFrom?: string;
  dateTo?: string;
  invalidDateRange: boolean;
}

export function parseScalarString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

export function parseStrictDate(dateStr: string): Date {
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Date must be in strict YYYY-MM-DD format.");
  }
  const [yearStr, monthStr, dayStr] = trimmed.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Invalid calendar date.");
  }
  return date;
}

export function parseEnumScalar<T extends string>(
  value: unknown,
  allowedValues: readonly T[]
): T | undefined {
  const str = parseScalarString(value);
  if (!str) return undefined;
  return allowedValues.includes(str as T) ? (str as T) : undefined;
}

export function parsePageSize(value: unknown, defaultSize = 50, maxSize = 100): number {
  const str = parseScalarString(value);
  if (!str) return defaultSize;
  if (!/^\d+$/.test(str)) return defaultSize;
  const parsed = parseInt(str, 10);
  if (isNaN(parsed) || parsed <= 0) return defaultSize;
  return Math.min(parsed, maxSize);
}

import crypto from "crypto";

export interface LedgerCursorContext {
  organizationId?: string;
  termId?: string;
  type?: string;
  entryType?: string;
  categoryId?: string;
  cashAccount?: string;
  month?: string;
  eventActivityName?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  pageSize: number;
}

export function buildLedgerCursorFingerprint(ctx: LedgerCursorContext): string {
  const parts = [
    "v1",
    ctx.organizationId || "",
    ctx.termId || "",
    ctx.type || "",
    ctx.entryType || "",
    ctx.categoryId || "",
    ctx.cashAccount || "",
    ctx.month || "",
    ctx.eventActivityName || "",
    ctx.dateFrom || "",
    ctx.dateTo || "",
    ctx.search || "",
    String(ctx.pageSize || 50),
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

export interface LedgerCursor {
  financialDate: string;
  createdAt: string;
  kind: "TRANSACTION" | "TRANSFER";
  id: string;
  fingerprint?: string;
}

export function encodeLedgerCursor(cursor: LedgerCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeLedgerCursor(value: unknown, expectedFingerprint?: string): LedgerCursor | null {
  const scalar = parseScalarString(value);
  if (!scalar || !/^[A-Za-z0-9_-]+$/.test(scalar)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(scalar, "base64url").toString("utf8")) as Partial<LedgerCursor>;
    if (
      typeof decoded.financialDate !== "string" ||
      typeof decoded.createdAt !== "string" ||
      (decoded.kind !== "TRANSACTION" && decoded.kind !== "TRANSFER") ||
      typeof decoded.id !== "string" ||
      Number.isNaN(Date.parse(decoded.financialDate)) ||
      Number.isNaN(Date.parse(decoded.createdAt))
    ) return null;

    if (expectedFingerprint && decoded.fingerprint !== expectedFingerprint) {
      return null;
    }

    return decoded as LedgerCursor;
  } catch {
    return null;
  }
}

export function hasScalarValue(value: unknown): boolean {
  return value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "");
}

function firstPresent(params: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(params, key)) return params[key];
  }
  return undefined;
}

export function parseTermSelectionParams(params: Record<string, unknown>): ParsedTermSelection {
  const academicYearInput = firstPresent(params, "academicYear", "ay");
  const rawAy = parseScalarString(academicYearInput);
  let academicYear: string | undefined;
  let invalidAcademicYear = hasScalarValue(academicYearInput) && !rawAy;
  if (rawAy) {
    try {
      academicYear = normalizeAcademicYear(rawAy);
    } catch {
      invalidAcademicYear = true;
    }
  }

  const semesterInput = firstPresent(params, "semester");
  const rawSemester = parseScalarString(semesterInput);
  const semester = parseEnumScalar(semesterInput, [
    Semester.FIRST_SEMESTER,
    Semester.SECOND_SEMESTER,
    Semester.MIDYEAR_SUMMER,
  ] as const);
  const invalidSemester = hasScalarValue(semesterInput) && (!rawSemester || !semester);
  const invalidTermSelection =
    invalidAcademicYear ||
    invalidSemester ||
    Boolean(academicYear) !== Boolean(semester);

  return {
    academicYear: invalidTermSelection ? undefined : academicYear,
    semester: invalidTermSelection ? undefined : semester,
    invalidAcademicYear,
    invalidSemester,
    invalidTermSelection,
  };
}

export function parseOrganizationParam(params: Record<string, unknown>): ParsedOrganizationParam {
  const input = firstPresent(params, "org", "organization");
  const org = parseScalarString(input);
  return {
    org,
    invalidOrganization: hasScalarValue(input) && !org,
  };
}

export function parseDateRangeParams(params: Record<string, unknown>): ParsedDateRangeParams {
  const dateFromInput = firstPresent(params, "dateFrom");
  const dateToInput = firstPresent(params, "dateTo");
  const dateFrom = parseScalarString(dateFromInput);
  const dateTo = parseScalarString(dateToInput);
  const invalidScalar =
    (hasScalarValue(dateFromInput) && !dateFrom) ||
    (hasScalarValue(dateToInput) && !dateTo);
  const range = invalidScalar ? { invalid: true } : calculateEffectiveDateRange(undefined, dateFrom, dateTo);
  return { dateFrom, dateTo, invalidDateRange: range.invalid };
}

function validMonth(value: string | undefined): boolean {
  if (!value) return true;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function parseLedgerQueryParams(params: Record<string, unknown>): ParsedLedgerQuery {
  const term = parseTermSelectionParams(params);

  const typeInput = firstPresent(params, "type");
  const rawType = parseScalarString(typeInput);
  const type = parseEnumScalar(typeInput, [
    TransactionType.INCOME,
    TransactionType.EXPENSE,
  ] as const);
  const invalidType = hasScalarValue(typeInput) && (!rawType || !type);

  const entryTypeInput = firstPresent(params, "entryType", "kind");
  const rawEntryType = parseScalarString(entryTypeInput);
  const entryType = parseEnumScalar(entryTypeInput, ["TRANSACTION", "TRANSFER"] as const);
  const invalidEntryType = hasScalarValue(entryTypeInput) && (!rawEntryType || !entryType);

  const cashAccountInput = firstPresent(params, "cashAccount", "account");
  const rawCashAccount = parseScalarString(cashAccountInput);
  const cashAccount = parseEnumScalar(cashAccountInput, [
    CashAccount.CASH_ON_HAND,
    CashAccount.CASH_IN_BANK,
  ] as const);
  const invalidCashAccount = hasScalarValue(cashAccountInput) && (!rawCashAccount || !cashAccount);

  const categoryInput = firstPresent(params, "categoryId", "category");
  const categoryId = parseScalarString(categoryInput);
  const invalidCategoryId = hasScalarValue(categoryInput) && !categoryId;

  const monthInput = firstPresent(params, "month");
  const month = parseScalarString(monthInput);
  const invalidMonth =
    (hasScalarValue(monthInput) && !month) ||
    (hasScalarValue(monthInput) && !validMonth(month));

  const eventInput = firstPresent(params, "eventActivityName", "event");
  const eventActivityName = parseScalarString(eventInput);
  const searchInput = firstPresent(params, "search", "q");
  const search = parseScalarString(searchInput);
  const invalidScalarFilter =
    (hasScalarValue(eventInput) && !eventActivityName) ||
    (hasScalarValue(searchInput) && !search);

  const dateQuery = parseDateRangeParams(params);
  const dateFrom = dateQuery.dateFrom;
  const dateTo = dateQuery.dateTo;
  const organizationQuery = parseOrganizationParam(params);

  const rawCursor = firstPresent(params, "cursor");
  const cursor = parseScalarString(rawCursor);
  const invalidCursor = hasScalarValue(rawCursor) && !decodeLedgerCursor(rawCursor);
  const rawPageSize = firstPresent(params, "pageSize", "limit");
  const rawPageSizeString = parseScalarString(rawPageSize);
  const invalidPageSize =
    hasScalarValue(rawPageSize) &&
    (Array.isArray(rawPageSize) || !rawPageSizeString || !/^\d+$/.test(rawPageSizeString) || Number(rawPageSizeString) <= 0 || Number(rawPageSizeString) > 100);
  const pageSize = parsePageSize(rawPageSize);
  const dateRange = calculateEffectiveDateRange(month, dateFrom, dateTo);

  const effectiveType = entryType === "TRANSFER" ? undefined : type;
  const effectiveCategoryId = entryType === "TRANSFER" ? undefined : categoryId;
  const effectiveInvalidType = entryType === "TRANSFER" ? false : invalidType;
  const effectiveInvalidCategoryId = entryType === "TRANSFER" ? false : invalidCategoryId;

  return {
    academicYear: term.academicYear,
    semester: term.semester,
    type: effectiveType,
    entryType,
    categoryId: effectiveCategoryId,
    cashAccount,
    month,
    eventActivityName,
    dateFrom,
    dateTo,
    search,
    org: organizationQuery.org,
    cursor: invalidCursor ? undefined : cursor,
    pageSize,
    invalidTermSelection: term.invalidTermSelection,
    invalidDateRange: dateQuery.invalidDateRange || dateRange.invalid,
    invalidMonth,
    invalidCursor,
    invalidPageSize,
    invalidAcademicYear: term.invalidAcademicYear,
    invalidSemester: term.invalidSemester,
    invalidType: effectiveInvalidType,
    invalidEntryType,
    invalidCashAccount,
    invalidCategoryId: effectiveInvalidCategoryId,
    invalidScalarFilter,
    invalidOrganization: organizationQuery.invalidOrganization,
  };
}

export interface EffectiveDateRange {
  gte?: Date;
  lte?: Date;
  invalid: boolean;
  invalidMonth?: boolean;
}

export function calculateEffectiveDateRange(
  month?: string,
  dateFrom?: string,
  dateTo?: string
): EffectiveDateRange {
  let monthGte: Date | undefined = undefined;
  let monthLte: Date | undefined = undefined;

  if (month) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (match) {
      const year = Number(match[1]);
      const m = Number(match[2]);
      if (m >= 1 && m <= 12) {
        monthGte = new Date(Date.UTC(year, m - 1, 1));
        monthLte = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
      }
    }
  }

  let explicitGte: Date | undefined = undefined;
  if (dateFrom) {
    try {
      explicitGte = parseStrictDate(dateFrom);
    } catch {
      return { invalid: true };
    }
  }

  let explicitLte: Date | undefined = undefined;
  if (dateTo) {
    try {
      const parsedDate = parseStrictDate(dateTo);
      explicitLte = new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate(), 23, 59, 59, 999));
    } catch {
      return { invalid: true };
    }
  }

  let finalGte: Date | undefined = undefined;
  if (monthGte && explicitGte) {
    finalGte = monthGte > explicitGte ? monthGte : explicitGte;
  } else {
    finalGte = monthGte || explicitGte;
  }

  let finalLte: Date | undefined = undefined;
  if (monthLte && explicitLte) {
    finalLte = monthLte < explicitLte ? monthLte : explicitLte;
  } else {
    finalLte = monthLte || explicitLte;
  }

  if (finalGte && finalLte && finalGte > finalLte) {
    return { invalid: true };
  }

  return {
    gte: finalGte,
    lte: finalLte,
    invalid: false,
  };
}

const LEDGER_URL_PARAM_KEYS = [
  "academicYear",
  "semester",
  "type",
  "entryType",
  "categoryId",
  "cashAccount",
  "month",
  "event",
  "dateFrom",
  "dateTo",
  "search",
  "pageSize",
  "org",
  "cursor",
  "prevCursor",
] as const;

/**
 * Builds a /ledger URL from the current query plus filter overrides.
 *
 * Changing any filter, page size, or selected term invalidates the cursor so
 * the result set restarts from the first matching entry.
 */
export function buildLedgerFilterUrl(
  filters: Pick<
    ParsedLedgerQuery,
    | "academicYear"
    | "semester"
    | "type"
    | "entryType"
    | "categoryId"
    | "cashAccount"
    | "month"
    | "eventActivityName"
    | "dateFrom"
    | "dateTo"
    | "search"
    | "org"
    | "cursor"
    | "pageSize"
  > & { prevCursor?: string },
  overrides: Record<string, string | undefined>
): string {
  const merged: Record<string, string | undefined> = {
    academicYear: filters.academicYear,
    semester: filters.semester,
    type: filters.type,
    entryType: filters.entryType,
    categoryId: filters.categoryId,
    cashAccount: filters.cashAccount,
    month: filters.month,
    event: filters.eventActivityName,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    search: filters.search,
    pageSize: filters.pageSize && filters.pageSize !== 50 ? String(filters.pageSize) : undefined,
    org: filters.org,
    cursor: filters.cursor,
    prevCursor: filters.prevCursor,
    ...overrides,
  };

  const hasFilterOrPageSizeOverride = Object.keys(overrides).some(
    (key) => key !== "cursor" && key !== "prevCursor"
  );
  if (hasFilterOrPageSizeOverride) {
    if (!("cursor" in overrides)) merged.cursor = undefined;
    if (!("prevCursor" in overrides)) merged.prevCursor = undefined;
  }

  const params = new URLSearchParams();
  for (const key of LEDGER_URL_PARAM_KEYS) {
    const value = merged[key];
    if (typeof value === "string" && value.trim().length > 0) {
      params.set(key, value.trim());
    }
  }
  const query = params.toString();
  return `/ledger${query ? `?${query}` : ""}`;
}
