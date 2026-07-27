const PESO_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Parses a Philippine Peso input string into integer cents.
 * Accepts: "0", "100", "100.5", "100.50", "1,000.00"
 * Rejects negative values and more than two decimal places.
 */
export function parsePesoToCents(input: string): number {
  const sanitized = input.replace(/,/g, "").trim();
  if (!PESO_PATTERN.test(sanitized)) {
    throw new PesoParseError("Amounts may have at most two decimal places.");
  }

  const parts = sanitized.split(".");
  const pesos = parseInt(parts[0], 10);
  const centavos =
    parts.length === 2 ? parseInt(parts[1].padEnd(2, "0"), 10) : 0;
  const cents = pesos * 100 + centavos;

  if (cents < 0) {
    throw new PesoParseError("Opening balances cannot be negative.");
  }

  if (!Number.isSafeInteger(cents)) {
    throw new PesoParseError("Amount exceeds safe integer range.");
  }

  return cents;
}

export class PesoParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PesoParseError";
  }
}

/**
 * Formats integer cents as a Philippine Peso display string.
 * Example: 100050 → "₱1,000.50"
 */
export function formatPesoFromCents(cents: number): string {
  const absoluteCents = Math.abs(cents);
  const pesos = Math.floor(absoluteCents / 100);
  const centavos = absoluteCents % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}₱${pesos.toLocaleString("en-PH")}.${centavos
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Formats integer cents as a plain decimal string for form input defaults.
 * Example: 100050 → "1000.50"
 */
export function formatPesoInputFromCents(cents: number): string {
  const pesos = Math.floor(Math.abs(cents) / 100);
  const centavos = Math.abs(cents) % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}${pesos}.${centavos.toString().padStart(2, "0")}`;
}

/**
 * Calculates the combined opening balance forwarded.
 */
export function calculateBalanceForwarded(
  openingCashOnHandCents: number,
  openingCashInBankCents: number
): number {
  return openingCashOnHandCents + openingCashInBankCents;
}
