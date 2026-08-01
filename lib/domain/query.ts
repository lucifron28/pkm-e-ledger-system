import { CashAccount, Semester, TransactionType } from "@prisma/client";
import { normalizeAcademicYear } from "./term-labels";

export interface ParsedLedgerQuery {
  academicYear?: string;
  semester?: Semester;
  type?: TransactionType;
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
  const parsed = parseInt(str, 10);
  if (isNaN(parsed) || parsed <= 0) return defaultSize;
  return Math.min(parsed, maxSize);
}

export function parseLedgerQueryParams(params: Record<string, unknown>): ParsedLedgerQuery {
  const rawAy = parseScalarString(params.academicYear || params.ay);
  let academicYear: string | undefined = undefined;
  if (rawAy) {
    try {
      academicYear = normalizeAcademicYear(rawAy);
    } catch {
      /* ignore invalid academic year format */
    }
  }

  const semester = parseEnumScalar(params.semester, [
    Semester.FIRST_SEMESTER,
    Semester.SECOND_SEMESTER,
    Semester.MIDYEAR_SUMMER,
  ] as const);

  const type = parseEnumScalar(params.type, [
    TransactionType.INCOME,
    TransactionType.EXPENSE,
  ] as const);

  const cashAccount = parseEnumScalar(params.cashAccount || params.account, [
    CashAccount.CASH_ON_HAND,
    CashAccount.CASH_IN_BANK,
  ] as const);

  const categoryId = parseScalarString(params.categoryId || params.category);
  const month = parseScalarString(params.month);
  const eventActivityName = parseScalarString(params.eventActivityName || params.event);
  const dateFrom = parseScalarString(params.dateFrom);
  const dateTo = parseScalarString(params.dateTo);
  const search = parseScalarString(params.search || params.q);
  const org = parseScalarString(params.org || params.organization);
  const cursor = parseScalarString(params.cursor);
  const pageSize = parsePageSize(params.pageSize || params.limit);

  return {
    academicYear,
    semester,
    type,
    categoryId,
    cashAccount,
    month,
    eventActivityName,
    dateFrom,
    dateTo,
    search,
    org,
    cursor,
    pageSize,
  };
}

export interface EffectiveDateRange {
  gte?: Date;
  lte?: Date;
  invalid: boolean;
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

  // Intersect month range and explicit date range (latest of starts, earliest of ends)
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
