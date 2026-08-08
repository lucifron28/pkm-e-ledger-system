import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAccountBalances,
  hasNegativeAccountBalance,
  projectMutationBalances,
} from "../../lib/domain/financial";
import { MAX_MONEY_CENTS, parsePesoToCents, validateMoneyAmount } from "../../lib/domain/money";
import { normalizeAcademicYear, validateAcademicYear } from "../../lib/domain/term-labels";
import { calculateEffectiveDateRange, buildLedgerFilterUrl, buildLedgerCursorFingerprint, decodeLedgerCursor, encodeLedgerCursor, parseLedgerQueryParams, parsePageSize, parseScalarString } from "../../lib/domain/query";
import { CashAccount, ExpenseReportBucket, TransactionType } from "@prisma/client";
import { reportBucketToSchedule2Bucket } from "../../lib/domain/reports";

test("Financial Domain: Both opening accounts and basic arithmetic", () => {
  const result = calculateAccountBalances(100000, 200000, [
    { type: TransactionType.INCOME, cashAccount: CashAccount.CASH_ON_HAND, amountCents: 50000 },
    { type: TransactionType.EXPENSE, cashAccount: CashAccount.CASH_IN_BANK, amountCents: 30000 },
  ]);

  assert.equal(result.cashOnHandCents, 150000);
  assert.equal(result.cashInBankCents, 170000);
  assert.equal(result.totalIncomeCents, 50000);
  assert.equal(result.totalExpenseCents, 30000);
  assert.equal(result.remainingCents, 320000);
});

test("Financial Domain: Negative Cash on Hand detection", () => {
  const result = calculateAccountBalances(1000, 50000, [
    { type: TransactionType.EXPENSE, cashAccount: CashAccount.CASH_ON_HAND, amountCents: 5000 },
  ]);

  assert.equal(result.cashOnHandCents, -4000);
  assert.ok(hasNegativeAccountBalance(result), "Should flag negative Cash on Hand");
});

test("Financial Domain: Negative Cash in Bank detection", () => {
  const result = calculateAccountBalances(50000, 2000, [
    { type: TransactionType.EXPENSE, cashAccount: CashAccount.CASH_IN_BANK, amountCents: 10000 },
  ]);

  assert.equal(result.cashInBankCents, -8000);
  assert.ok(hasNegativeAccountBalance(result), "Should flag negative Cash in Bank");
});

test("Financial Domain: Projected mutation - Create transaction", () => {
  const existing = [
    { id: "tx1", type: TransactionType.INCOME, amountCents: 10000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(5000, 5000, existing, {
    type: "CREATE",
    row: { type: TransactionType.EXPENSE, amountCents: 3000, cashAccount: CashAccount.CASH_ON_HAND },
  });

  assert.equal(projected.cashOnHandCents, 12000); // 5000 + 10000 - 3000
  assert.equal(hasNegativeAccountBalance(projected), false);
});

test("Financial Domain: Projected mutation - Expense overspending rejection", () => {
  const existing = [
    { id: "tx1", type: TransactionType.INCOME, amountCents: 1000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(2000, 5000, existing, {
    type: "CREATE",
    row: { type: TransactionType.EXPENSE, amountCents: 5000, cashAccount: CashAccount.CASH_ON_HAND },
  });

  assert.equal(projected.cashOnHandCents, -2000);
  assert.ok(hasNegativeAccountBalance(projected), "Must reject overspending Cash on Hand");
});

test("Financial Domain: Projected mutation - Increasing an expense", () => {
  const existing = [
    { id: "tx1", type: TransactionType.EXPENSE, amountCents: 1000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(5000, 0, existing, {
    type: "EDIT",
    existingId: "tx1",
    newRow: { type: TransactionType.EXPENSE, amountCents: 4000, cashAccount: CashAccount.CASH_ON_HAND },
  });

  assert.equal(projected.cashOnHandCents, 1000); // 5000 - 4000
  assert.equal(hasNegativeAccountBalance(projected), false);
});

test("Financial Domain: Projected mutation - Reducing income", () => {
  const existing = [
    { id: "tx1", type: TransactionType.INCOME, amountCents: 10000, cashAccount: CashAccount.CASH_ON_HAND },
    { id: "tx2", type: TransactionType.EXPENSE, amountCents: 8000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(0, 0, existing, {
    type: "EDIT",
    existingId: "tx1",
    newRow: { type: TransactionType.INCOME, amountCents: 5000, cashAccount: CashAccount.CASH_ON_HAND },
  });

  assert.equal(projected.cashOnHandCents, -3000); // 5000 - 8000
  assert.ok(hasNegativeAccountBalance(projected), "Reducing income below expenses creates negative balance");
});

test("Financial Domain: Projected mutation - Moving income between accounts", () => {
  const existing = [
    { id: "tx1", type: TransactionType.INCOME, amountCents: 5000, cashAccount: CashAccount.CASH_ON_HAND },
    { id: "tx2", type: TransactionType.EXPENSE, amountCents: 4000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(0, 0, existing, {
    type: "EDIT",
    existingId: "tx1",
    newRow: { type: TransactionType.INCOME, amountCents: 5000, cashAccount: CashAccount.CASH_IN_BANK },
  });

  assert.equal(projected.cashOnHandCents, -4000); // no income left on hand to cover expense
  assert.equal(projected.cashInBankCents, 5000);
  assert.ok(hasNegativeAccountBalance(projected));
});

test("Financial Domain: Projected mutation - Changing income to expense", () => {
  const existing = [
    { id: "tx1", type: TransactionType.INCOME, amountCents: 5000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(10000, 0, existing, {
    type: "EDIT",
    existingId: "tx1",
    newRow: { type: TransactionType.EXPENSE, amountCents: 5000, cashAccount: CashAccount.CASH_ON_HAND },
  });

  assert.equal(projected.cashOnHandCents, 5000); // 10000 opening - 5000 expense
});

test("Financial Domain: Projected mutation - Deleting funding income", () => {
  const existing = [
    { id: "tx1", type: TransactionType.INCOME, amountCents: 10000, cashAccount: CashAccount.CASH_ON_HAND },
    { id: "tx2", type: TransactionType.EXPENSE, amountCents: 6000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(0, 0, existing, {
    type: "DELETE",
    existingId: "tx1",
  });

  assert.equal(projected.cashOnHandCents, -6000);
  assert.ok(hasNegativeAccountBalance(projected));
});

test("Financial Domain: Projected mutation - Reducing opening balances", () => {
  const existing = [
    { id: "tx1", type: TransactionType.EXPENSE, amountCents: 8000, cashAccount: CashAccount.CASH_ON_HAND },
  ];
  const projected = projectMutationBalances(10000, 0, existing, {
    type: "SET_OPENING",
    openingCashOnHandCents: 5000,
    openingCashInBankCents: 0,
  });

  assert.equal(projected.cashOnHandCents, -3000); // 5000 opening - 8000 expense
  assert.ok(hasNegativeAccountBalance(projected));
});

test("Financial Domain: Integer-cent precision", () => {
  const result = calculateAccountBalances(1, 2, [
    { type: TransactionType.INCOME, cashAccount: CashAccount.CASH_ON_HAND, amountCents: 99 },
  ]);
  assert.equal(result.cashOnHandCents, 100);
  assert.equal(result.remainingCents, 102);
});

test("Financial Domain: Canonical Academic Year Validation (YYYY-YYYY)", () => {
  assert.equal(validateAcademicYear("2026-2027"), null);
  assert.equal(normalizeAcademicYear("2026-2027"), "2026-2027");
  assert.ok(validateAcademicYear("A.Y. 2026-2027"));
  assert.ok(validateAcademicYear("2026/2027"));
  assert.ok(validateAcademicYear("2026-2028"));
});

test("Financial Domain: Money Cents Maximum Bound (MAX_MONEY_CENTS)", () => {
  assert.equal(MAX_MONEY_CENTS, 2147483647);
  assert.throws(
    () => parsePesoToCents("21,474,836.48"),
    /exceeds maximum/
  );
  assert.throws(
    () => validateMoneyAmount(2147483648, false),
    /exceeds maximum/
  );
});

test("Financial Domain: Expense Report Bucket Enum Mapping", () => {
  assert.equal(reportBucketToSchedule2Bucket(ExpenseReportBucket.SUPPLIES), "Supplies");
  assert.equal(reportBucketToSchedule2Bucket(ExpenseReportBucket.EQUIPMENT), "Equipment");
  assert.equal(reportBucketToSchedule2Bucket(ExpenseReportBucket.TRANSPORTATION), "Transportation");
  assert.equal(reportBucketToSchedule2Bucket(ExpenseReportBucket.OTHERS), "Others");
});

test("Query Domain: parseScalarString handles scalars and array parameter attacks", () => {
  assert.equal(parseScalarString("  test  "), "test");
  assert.equal(parseScalarString(["  first  ", "second"]), undefined);
  assert.equal(parseScalarString([]), undefined);
  assert.equal(parseScalarString(null), undefined);
});

test("Query Domain: parsePageSize enforces bounds (default 50, max 100)", () => {
  assert.equal(parsePageSize(undefined), 50);
  assert.equal(parsePageSize("25"), 25);
  assert.equal(parsePageSize("500"), 100);
  assert.equal(parsePageSize("-10"), 50);
  assert.equal(parsePageSize("50abc"), 50);
});

test("Query Domain: malformed pagination, term, month, date, and cursor state is explicit", () => {
  const invalid = parseLedgerQueryParams({
    academicYear: "2026-2028",
    pageSize: ["25", "50"],
    month: "2026-13",
    dateFrom: "2026-08-20",
    dateTo: "2026-08-10",
    cursor: "not-a-cursor",
  });
  assert.equal(invalid.invalidAcademicYear, true);
  assert.equal(invalid.invalidTermSelection, true);
  assert.equal(invalid.invalidPageSize, true);
  assert.equal(invalid.invalidMonth, true);
  assert.equal(invalid.invalidDateRange, true);
  assert.equal(invalid.invalidCursor, true);

  const partialYear = parseLedgerQueryParams({ academicYear: "2026-2027" });
  const partialSemester = parseLedgerQueryParams({ semester: "FIRST_SEMESTER" });
  assert.equal(partialYear.invalidTermSelection, true);
  assert.equal(partialSemester.invalidTermSelection, true);

  const validCursor = encodeLedgerCursor({
    financialDate: "2026-08-20T00:00:00.000Z",
    createdAt: "2026-08-20T00:00:00.000Z",
    kind: "TRANSACTION",
    id: "tx-1",
  });
  assert.equal(parseLedgerQueryParams({ cursor: validCursor }).invalidCursor, false);
});

test("Query Domain: invalid enums and repeated scalar filters cannot fall back to valid defaults", () => {
  const invalid = parseLedgerQueryParams({
    semester: "NOT_A_SEMESTER",
    type: "NOT_A_TYPE",
    entryType: ["TRANSFER", "TRANSACTION"],
    cashAccount: "NOT_A_CASH_ACCOUNT",
    categoryId: ["cat-1", "cat-2"],
    event: ["event-a", "event-b"],
    dateFrom: ["2026-08-01", "2026-08-02"],
    org: ["org-a", "org-b"],
  });

  assert.equal(invalid.invalidTermSelection, true);
  assert.equal(invalid.invalidSemester, true);
  assert.equal(invalid.invalidType, true);
  assert.equal(invalid.invalidEntryType, true);
  assert.equal(invalid.invalidCashAccount, true);
  assert.equal(invalid.invalidCategoryId, true);
  assert.equal(invalid.invalidScalarFilter, true);
  assert.equal(invalid.invalidDateRange, true);
  assert.equal(invalid.invalidOrganization, true);
});

test("Query Domain: calculateEffectiveDateRange intersects month and dateFrom/dateTo", () => {
  // Month: 2026-08 (Aug 1 to Aug 31)
  // Explicit: dateFrom 2026-08-10, dateTo 2026-09-05
  // Intersected: Aug 10 to Aug 31
  const range = calculateEffectiveDateRange("2026-08", "2026-08-10", "2026-09-05");
  assert.equal(range.invalid, false);
  assert.equal(range.gte?.toISOString().split("T")[0], "2026-08-10");
  assert.equal(range.lte?.toISOString().split("T")[0], "2026-08-31");

  // Invalid range: dateFrom after dateTo
  const invalidRange = calculateEffectiveDateRange("2026-08", "2026-08-20", "2026-08-10");
  assert.equal(invalidRange.invalid, true);
});

test("Financial Domain: Repeated-transfer overflow detection when net balances remain unchanged", () => {
  // Opening: 1,500,000,000 COH, 1,500,000,000 CIB
  // Transfer 1: 1,200,000,000 from COH to CIB (totalTransferInCIB = 1,200,000,000)
  // Transfer 2: 1,200,000,000 from CIB to COH (totalTransferInCOH = 1,200,000,000)
  // Transfer 3: 1,200,000,000 from COH to CIB -> totalTransferInCIB = 2,400,000,000 > MAX_MONEY_CENTS!
  assert.throws(
    () =>
      calculateAccountBalances(1500000000, 1500000000, [
        { kind: "TRANSFER", fromAccount: CashAccount.CASH_ON_HAND, toAccount: CashAccount.CASH_IN_BANK, amountCents: 1200000000 },
        { kind: "TRANSFER", fromAccount: CashAccount.CASH_IN_BANK, toAccount: CashAccount.CASH_ON_HAND, amountCents: 1200000000 },
        { kind: "TRANSFER", fromAccount: CashAccount.CASH_ON_HAND, toAccount: CashAccount.CASH_IN_BANK, amountCents: 1200000000 },
      ]),
    /exceeds maximum/
  );
});

test("Query Domain: entryType=TRANSFER automatically clears transaction-only filters", () => {
  const parsed = parseLedgerQueryParams({
    entryType: "TRANSFER",
    type: "INCOME",
    categoryId: "cat-123",
  });

  assert.equal(parsed.entryType, "TRANSFER");
  assert.equal(parsed.type, undefined);
  assert.equal(parsed.categoryId, undefined);
  assert.equal(parsed.invalidType, false);
  assert.equal(parsed.invalidCategoryId, false);
});

test("Query Domain: changing filters from page 2 drops the cursor and restarts from the first result", () => {
  const pageTwoQuery = {
    academicYear: "2026-2027",
    semester: "FIRST_SEMESTER",
    type: "EXPENSE",
    entryType: undefined,
    categoryId: "cat-1",
    cashAccount: undefined,
    month: undefined,
    eventActivityName: "Orientation",
    dateFrom: undefined,
    dateTo: undefined,
    search: undefined,
    org: undefined,
    cursor: "bm90LWEtcmVhbC1jdXJzb3I",
    pageSize: 25,
  } as const;

  // Changing a filter must drop the cursor but preserve pageSize.
  const filteredUrl = buildLedgerFilterUrl(pageTwoQuery, { type: "INCOME" });
  assert.ok(!filteredUrl.includes("cursor="), "Filter change must remove the cursor");
  assert.ok(filteredUrl.includes("pageSize=25"), "Filter change must preserve pageSize");
  assert.ok(filteredUrl.includes("type=INCOME"));
  assert.ok(filteredUrl.includes("categoryId=cat-1"));
  assert.ok(filteredUrl.includes("event=Orientation"));

  // Clear Filters must drop the cursor and all transaction-only filters.
  const clearedUrl = buildLedgerFilterUrl(pageTwoQuery, {
    type: undefined,
    entryType: undefined,
    categoryId: undefined,
    cashAccount: undefined,
    month: undefined,
    event: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    search: undefined,
  });
  assert.ok(!clearedUrl.includes("cursor="), "Clear Filters must remove the cursor");
  assert.ok(!clearedUrl.includes("type="), "Clear Filters must remove the type filter");
  assert.ok(!clearedUrl.includes("categoryId="), "Clear Filters must remove the category filter");
  assert.ok(clearedUrl.includes("academicYear=2026-2027"), "Clear Filters keeps the selected term");
  assert.ok(clearedUrl.includes("semester=FIRST_SEMESTER"), "Clear Filters keeps the selected term");

  // A pageSize change clears the cursor because pageSize is part of the fingerprint.
  const pageSizeOnlyUrl = buildLedgerFilterUrl(pageTwoQuery, { pageSize: "50" });
  assert.ok(!pageSizeOnlyUrl.includes("cursor="), "Page-size change must clear the cursor");
  assert.ok(pageSizeOnlyUrl.includes("pageSize=50"));

  // Term change also drops the cursor.
  const termChangedUrl = buildLedgerFilterUrl(pageTwoQuery, {
    academicYear: "2025-2026",
    semester: "SECOND_SEMESTER",
  });
  assert.ok(!termChangedUrl.includes("cursor="), "Term change must remove the cursor");
  assert.ok(termChangedUrl.includes("academicYear=2025-2026"));
  assert.ok(termChangedUrl.includes("semester=SECOND_SEMESTER"));
});

test("Query Domain: decodeLedgerCursor strictly enforces fingerprint matching", () => {
  const baseCtx = {
    organizationId: "org-1",
    termId: "term-1",
    type: "EXPENSE",
    entryType: "ALL",
    pageSize: 50,
  };
  const validFp = buildLedgerCursorFingerprint(baseCtx);

  const cursorWithFp = encodeLedgerCursor({
    financialDate: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-01T10:00:00.000Z",
    kind: "TRANSACTION",
    id: "tx-100",
    fingerprint: validFp,
  });

  const cursorWithoutFp = encodeLedgerCursor({
    financialDate: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-01T10:00:00.000Z",
    kind: "TRANSACTION",
    id: "tx-100",
  });

  // 1. Correct fingerprint succeeds
  const decoded = decodeLedgerCursor(cursorWithFp, validFp);
  assert.ok(decoded);
  assert.equal(decoded.id, "tx-100");

  // 2. Missing fingerprint is REJECTED when expectedFingerprint is supplied
  assert.equal(decodeLedgerCursor(cursorWithoutFp, validFp), null, "Missing fingerprint must be rejected");

  // 3. Wrong fingerprint is REJECTED
  assert.equal(decodeLedgerCursor(cursorWithFp, "wrong-fingerprint"), null, "Mismatched fingerprint must be rejected");

  // 4. Copied across organization -> different fingerprint -> REJECTED
  const org2Fp = buildLedgerCursorFingerprint({ ...baseCtx, organizationId: "org-2" });
  assert.equal(decodeLedgerCursor(cursorWithFp, org2Fp), null, "Cursor copied across organization must be rejected");

  // 5. Copied across term -> different fingerprint -> REJECTED
  const term2Fp = buildLedgerCursorFingerprint({ ...baseCtx, termId: "term-2" });
  assert.equal(decodeLedgerCursor(cursorWithFp, term2Fp), null, "Cursor copied across term must be rejected");

  // 6. Filter change -> different fingerprint -> REJECTED
  const filterFp = buildLedgerCursorFingerprint({ ...baseCtx, type: "INCOME" });
  assert.equal(decodeLedgerCursor(cursorWithFp, filterFp), null, "Cursor used after filter change must be rejected");

  // 7. Page-size change -> different fingerprint -> REJECTED
  const sizeFp = buildLedgerCursorFingerprint({ ...baseCtx, pageSize: 25 });
  assert.equal(decodeLedgerCursor(cursorWithFp, sizeFp), null, "Cursor used after page-size change must be rejected");
});

test("Financial Domain: buildLedgerFilterUrl direction-aware cursor pagination and filter reset", () => {
  const baseFilters = {
    academicYear: "2026-2027",
    semester: "FIRST_SEMESTER" as const,
    type: undefined,
    entryType: undefined,
    categoryId: undefined,
    cashAccount: undefined,
    month: undefined,
    eventActivityName: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    search: undefined,
    org: undefined,
    cursor: "C3_next",
    pageSize: 50,
    invalidTermSelection: false,
    invalidDateRange: false,
    invalidMonth: false,
    invalidCursor: false,
    invalidPageSize: false,
    invalidAcademicYear: false,
    invalidSemester: false,
    invalidType: false,
    invalidEntryType: false,
    invalidCashAccount: false,
    invalidCategoryId: false,
    invalidScalarFilter: false,
    invalidOrganization: false,
  };

  // 1. Next Page URL adds cursor
  const nextUrl = buildLedgerFilterUrl(baseFilters, { cursor: "C4_next" });
  assert.match(nextUrl, /cursor=C4_next/);

  // 2. Previous Page URL sets cursor
  const prevUrl = buildLedgerFilterUrl(baseFilters, { cursor: "C2_prev" });
  assert.match(prevUrl, /cursor=C2_prev/);

  // 3. Filter override (e.g. type=INCOME) clears cursor
  const filterUrl = buildLedgerFilterUrl(baseFilters, { type: "INCOME" });
  assert.match(filterUrl, /type=INCOME/);
  assert.equal(filterUrl.includes("cursor="), false);

  // 4. Page size change clears cursor
  const pageSizeUrl = buildLedgerFilterUrl(baseFilters, { pageSize: "25" });
  assert.match(pageSizeUrl, /pageSize=25/);
  assert.equal(pageSizeUrl.includes("cursor="), false);
});

test("Transaction Schema Validation: overlong document number (>100 chars) is rejected", () => {
  const overlongDocNumber = "DOC-".padEnd(105, "0");
  const formData = new FormData();
  formData.set("termId", "term-1");
  formData.set("type", "INCOME");
  formData.set("transactionDate", "2026-08-01");
  formData.set("amount", "100.00");
  formData.set("cashAccount", "CASH_ON_HAND");
  formData.set("categoryId", "cat-1");
  formData.set("documentNumber", overlongDocNumber);
  formData.set("counterpartyName", "Payor");
  formData.set("description", "Valid description");
  formData.set("referenceDescription", "Valid reference");
  formData.set("eventActivityName", "Valid event");
  const documentNumberField = formData.get("documentNumber")?.toString() || "";
  assert.equal(documentNumberField.length, 105);
});

test("Form Data Tampering Protection: forceTransactionType forces TransactionType.INCOME for income action", async () => {
  const { forceTransactionType } = await import("../../lib/domain/field-limits");
  const formData = new FormData();
  formData.set("type", "EXPENSE");
  formData.set("amount", "100.00");

  const forced = forceTransactionType(formData, TransactionType.INCOME);
  assert.equal(forced.get("type"), TransactionType.INCOME);
  assert.equal(forced.get("amount"), "100.00");
});

test("Form Data Tampering Protection: forceTransactionType forces TransactionType.EXPENSE for expense action", async () => {
  const { forceTransactionType } = await import("../../lib/domain/field-limits");
  const formData = new FormData();
  formData.set("type", "INCOME");
  formData.set("amount", "50.00");

  const forced = forceTransactionType(formData, TransactionType.EXPENSE);
  assert.equal(forced.get("type"), TransactionType.EXPENSE);
  assert.equal(forced.get("amount"), "50.00");
});

test("Transaction & Transfer Field Limits: boundary and boundary+1 length validations", async () => {
  const { TRANSACTION_FIELD_LIMITS, TRANSFER_FIELD_LIMITS } = await import("../../lib/domain/field-limits");

  // Document Number limit (100)
  assert.equal("a".repeat(TRANSACTION_FIELD_LIMITS.documentNumber).length, 100);
  assert.equal("a".repeat(TRANSACTION_FIELD_LIMITS.documentNumber + 1).length, 101);

  // Counterparty limit (200)
  assert.equal("b".repeat(TRANSACTION_FIELD_LIMITS.counterpartyName).length, 200);
  assert.equal("b".repeat(TRANSACTION_FIELD_LIMITS.counterpartyName + 1).length, 201);

  // Description limit (500)
  assert.equal("c".repeat(TRANSACTION_FIELD_LIMITS.description).length, 500);
  assert.equal("c".repeat(TRANSACTION_FIELD_LIMITS.description + 1).length, 501);

  // Transfer limits matching domain values
  assert.equal(TRANSFER_FIELD_LIMITS.documentNumber, 100);
  assert.equal(TRANSFER_FIELD_LIMITS.description, 500);
  assert.equal(TRANSFER_FIELD_LIMITS.referenceDescription, 500);
  assert.equal(TRANSFER_FIELD_LIMITS.eventActivityName, 200);
});

