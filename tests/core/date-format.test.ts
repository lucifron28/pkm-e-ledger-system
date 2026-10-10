import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_TIME_ZONE,
  formatFinancialDate,
  formatPhilippineDate,
  formatPhilippineDateTime,
} from "../../lib/date-format";

test("formats real timestamps in Philippine time", () => {
  const timestamp = "2026-09-16T03:21:00.000Z";

  assert.equal(APP_TIME_ZONE, "Asia/Manila");
  assert.equal(formatPhilippineDateTime(timestamp), "Sep 16, 2026, 11:21 AM");
  assert.equal(formatPhilippineDate(timestamp), "Sep 16, 2026");
});

test("keeps an early-morning Philippine timestamp on its local calendar day", () => {
  const timestamp = "2026-09-15T17:00:00.000Z";

  assert.equal(formatPhilippineDate(timestamp), "Sep 16, 2026");
  assert.notEqual(formatPhilippineDate(timestamp), "Sep 15, 2026");
});

test("preserves date-only financial values", () => {
  const financialDate = new Date(Date.UTC(2026, 8, 16));

  assert.equal(formatFinancialDate(financialDate), "Sep 16, 2026");
});

test("produces the same output for server and client input forms", () => {
  const timestamp = "2026-09-16T03:21:00.000Z";
  const date = new Date(timestamp);

  assert.equal(formatPhilippineDateTime(timestamp), formatPhilippineDateTime(date));
  assert.equal(formatPhilippineDate(timestamp), formatPhilippineDate(date));
  assert.equal(formatFinancialDate(timestamp), formatFinancialDate(date));
});
