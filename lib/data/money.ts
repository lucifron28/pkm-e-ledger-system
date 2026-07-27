const PESO_PATTERN =
  /^(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{1,2})?$/;

/**
 * Parses a Philippine Peso input string into integer cents.
 * Accepts: "0", "100", "100.5", "100.50", "1,000", "1,000.50"
 * Rejects: comma misplacements, negatives, more than two decimal places.
 */
export function parsePesoToCents(input: string): number {
  const trimmed = input.trim();

  if (trimmed.startsWith("-")) {
    throw new PesoParseError("Opening balances cannot be negative.");
  }

  if (!PESO_PATTERN.test(trimmed)) {
    throw new PesoParseError("Amounts may have at most two decimal places.");
  }

  const sanitized = trimmed.replace(/,/g, "");
  const parts = sanitized.split(".");
  const pesos = parseInt(parts[0], 10);
  const centavos =
    parts.length === 2 ? parseInt(parts[1].padEnd(2, "0"), 10) : 0;
  const cents = pesos * 100 + centavos;

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

export function formatPesoFromCents(cents: number): string {
  const absoluteCents = Math.abs(cents);
  const pesos = Math.floor(absoluteCents / 100);
  const centavos = absoluteCents % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}₱${pesos.toLocaleString("en-PH")}.${centavos
    .toString()
    .padStart(2, "0")}`;
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
  return openingCashOnHandCents + openingCashInBankCents;
}
