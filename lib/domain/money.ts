import { ValidationError } from "./errors";

export const MAX_MONEY_CENTS = 2_147_483_647; // 21,474,836.47 pesos (SQLite / Prisma 32-bit Int limit)

const PESO_PATTERN = /^(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{1,2})?$/;

export class PesoParseError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "PesoParseError";
  }
}

/**
 * Parses a Philippine Peso input string into integer cents.
 * Accepts: "0", "100", "100.5", "100.50", "1,000", "1,000.50"
 * Rejects: comma misplacements, negatives, decimal places > 2, values > MAX_MONEY_CENTS.
 */
export function parsePesoToCents(input: string): number {
  const trimmed = input.trim();

  if (trimmed.startsWith("-")) {
    throw new PesoParseError("Amounts cannot be negative.");
  }

  if (!PESO_PATTERN.test(trimmed)) {
    throw new PesoParseError("Amounts may have at most two decimal places.");
  }

  const sanitized = trimmed.replace(/,/g, "");
  const parts = sanitized.split(".");
  const pesos = parseInt(parts[0], 10);
  const centavos = parts.length === 2 ? parseInt(parts[1].padEnd(2, "0"), 10) : 0;
  const cents = pesos * 100 + centavos;

  if (!Number.isSafeInteger(cents) || cents > MAX_MONEY_CENTS) {
    throw new PesoParseError(`Amount exceeds maximum allowed limit (₱21,474,836.47).`);
  }

  return cents;
}

export function validateMoneyAmount(cents: number, allowZero = false, fieldName = "Amount"): void {
  if (!Number.isInteger(cents)) {
    throw new ValidationError(`${fieldName} must be an integer number of cents.`);
  }
  if (allowZero ? cents < 0 : cents <= 0) {
    throw new ValidationError(
      allowZero
        ? `${fieldName} cannot be negative.`
        : `${fieldName} must be greater than zero.`
    );
  }
  if (cents > MAX_MONEY_CENTS) {
    throw new ValidationError(`${fieldName} exceeds maximum allowed limit (₱21,474,836.47).`);
  }
}

export function assertNoOverflow(totalCents: number, label = "Aggregate amount"): void {
  if (!Number.isSafeInteger(totalCents) || totalCents > MAX_MONEY_CENTS || totalCents < -MAX_MONEY_CENTS) {
    throw new ValidationError(`${label} exceeds maximum allowed precision range.`);
  }
}

export function formatPesoFromCents(cents: number): string {
  const absoluteCents = Math.abs(cents);
  const pesos = Math.floor(absoluteCents / 100);
  const centavos = absoluteCents % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}₱${pesos.toLocaleString("en-PH")}.${centavos.toString().padStart(2, "0")}`;
}

export function formatPesoInputFromCents(cents: number): string {
  const pesos = Math.floor(Math.abs(cents) / 100);
  const centavos = Math.abs(cents) % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}${pesos}.${centavos.toString().padStart(2, "0")}`;
}

export function calculateBalanceForwarded(
  openingCashOnHandCents: number,
  openingCashInBankCents: number
): number {
  const total = openingCashOnHandCents + openingCashInBankCents;
  assertNoOverflow(total, "Balance forwarded");
  return total;
}
