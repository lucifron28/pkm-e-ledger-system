import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePesoToCents,
  formatPesoFromCents,
  formatPesoInputFromCents,
  calculateBalanceForwarded,
  PesoParseError,
} from "../../lib/data/money";

test("Money Domain: Valid values and cent conversion", () => {
  assert.equal(parsePesoToCents("100"), 10000);
  assert.equal(parsePesoToCents("0"), 0);
  assert.equal(parsePesoToCents("500.50"), 50050);
  assert.equal(parsePesoToCents("12.3"), 1230);
});

test("Money Domain: Comma grouping support", () => {
  assert.equal(parsePesoToCents("1,234.56"), 123456);
  assert.equal(parsePesoToCents("1,000,000.00"), 100000000);
});

test("Money Domain: One and two decimal places", () => {
  assert.equal(parsePesoToCents("0.5"), 50);
  assert.equal(parsePesoToCents("0.05"), 5);
});

test("Money Domain: Whitespace handling", () => {
  assert.equal(parsePesoToCents("   250.75   "), 25075);
});

test("Money Domain: Zero handling", () => {
  assert.equal(parsePesoToCents("0.00"), 0);
  assert.equal(formatPesoFromCents(0), "₱0.00");
  assert.equal(formatPesoInputFromCents(0), "0.00");
});

test("Money Domain: Negative values rejection", () => {
  assert.throws(() => parsePesoToCents("-100"), PesoParseError);
  assert.throws(() => parsePesoToCents("-0.50"), PesoParseError);
});

test("Money Domain: Malformed commas rejection", () => {
  assert.throws(() => parsePesoToCents("1,23.45"), PesoParseError);
  assert.throws(() => parsePesoToCents("123,4.56"), PesoParseError);
});

test("Money Domain: Excessive decimals rejection", () => {
  assert.throws(() => parsePesoToCents("100.123"), PesoParseError);
});

test("Money Domain: Non-numeric values rejection", () => {
  assert.throws(() => parsePesoToCents("abc"), PesoParseError);
  assert.throws(() => parsePesoToCents("₱100"), PesoParseError);
});

test("Money Domain: Safe integer overflow protection", () => {
  assert.throws(() => parsePesoToCents("9007199254740991.00"), PesoParseError);
});

test("Money Domain: Formatting helpers", () => {
  assert.equal(formatPesoFromCents(123456), "₱1,234.56");
  assert.equal(formatPesoInputFromCents(123456), "1234.56");
  assert.equal(calculateBalanceForwarded(1000, 2000), 3000);
});
