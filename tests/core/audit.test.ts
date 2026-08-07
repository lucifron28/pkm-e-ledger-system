import test from "node:test";
import assert from "node:assert/strict";
import { redactSensitiveKeys } from "../../lib/data/audit-log";
import type {
  AuditMetadataFor,
  CashTransferSnapshot,
  FinancialAuditAction,
  TransactionCreateAuditMetadata,
  TransactionDeleteAuditMetadata,
  TransactionEditAuditMetadata,
  TransactionSnapshot,
} from "../../lib/data/audit-log";
import { createAuditLog, createSystemAuditLog } from "../../lib/data/audit-log";

const transactionSnapshot: TransactionSnapshot = {
  id: "tx-1",
  organizationId: "org-1",
  termId: "term-1",
  type: "INCOME",
  transactionDate: "2026-08-01T00:00:00.000Z",
  cashAccount: "CASH_ON_HAND",
  amountCents: 10000,
  categoryId: "cat-1",
  categoryName: "Membership Dues",
  documentNumber: "OR-2026-001",
  counterpartyName: "Fictional Student",
  description: "Membership dues collection",
  referenceDescription: "Official receipt reference",
  eventActivityName: "Freshman Orientation",
  recordedByUserId: "user-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

const transferSnapshot: CashTransferSnapshot = {
  id: "transfer-1",
  organizationId: "org-1",
  termId: "term-1",
  transferDate: "2026-08-01T00:00:00.000Z",
  fromAccount: "CASH_ON_HAND",
  toAccount: "CASH_IN_BANK",
  amountCents: 15000,
  documentNumber: "REF-001",
  description: "Initial deposit",
  referenceDescription: "Deposit slip",
  eventActivityName: "Orientation",
  recordedByUserId: "user-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

/* Compile-time assertions: every financial action maps to a typed metadata shape. */
const compileTimeAssertions: {
  [A in FinancialAuditAction]: AuditMetadataFor<A>;
} = {
  ADDED_INCOME: { type: "INCOME", cashAccount: "CASH_ON_HAND", amountCents: 1000, categoryId: "cat", categoryName: "Dues", documentNumber: "OR-1", counterpartyName: "Payer", description: "Dues", referenceDescription: "Ref", eventActivityName: "Event" },
  ADDED_EXPENSE: { type: "EXPENSE", cashAccount: "CASH_ON_HAND", amountCents: 1000, categoryId: "cat", categoryName: "Supplies", documentNumber: "OR-1", counterpartyName: "Payee", description: "Purchase", referenceDescription: "Ref", eventActivityName: "Event" },
  EDITED_TRANSACTION: { before: transactionSnapshot, after: { ...transactionSnapshot, version: 2, amountCents: 12000 } },
  DELETED_TRANSACTION: { deleteReason: "Correction", before: transactionSnapshot },
  CREATED_CASH_TRANSFER: { amountCents: 1000, fromAccount: "CASH_ON_HAND", toAccount: "CASH_IN_BANK", documentNumber: "TR-1", description: "Move", referenceDescription: "Ref", eventActivityName: "Event" },
  EDITED_CASH_TRANSFER: { before: transferSnapshot, after: { ...transferSnapshot, version: 2, amountCents: 20000 } },
  DELETED_CASH_TRANSFER: { deleteReason: "Correction", before: transferSnapshot },
  CHANGED_OPENING_BALANCE: { academicYear: "2026-2027", semester: "FIRST_SEMESTER", previousCashOnHandCents: 0, newCashOnHandCents: 1000, previousCashInBankCents: 0, newCashInBankCents: 2000, previousBalanceForwardedCents: 0, newBalanceForwardedCents: 3000, operation: "UPDATE" },
  ACTIVATED_ACADEMIC_TERM: { academicYear: "2026-2027", semester: "FIRST_SEMESTER", previousActiveTermId: null },
};

/* Compile-time negative assertions: incomplete metadata must fail type checking. */
const incompleteEditMetadata = {
  // @ts-expect-error TransactionSnapshot requires id, organizationId, termId, transactionDate, and more
  before: { type: "INCOME", amountCents: 1000 },
  // @ts-expect-error TransactionSnapshot requires id, organizationId, termId, transactionDate, and more
  after: { type: "INCOME", amountCents: 2000 },
} satisfies TransactionEditAuditMetadata;

const incompleteDeleteMetadata = {
  deleteReason: "Correction",
  // @ts-expect-error TransactionSnapshot requires id, organizationId, termId, transactionDate, and more
  before: { type: "INCOME", amountCents: 1000 },
} satisfies TransactionDeleteAuditMetadata;

void incompleteEditMetadata;
void incompleteDeleteMetadata;

/**
 * Direct type-level assertions against createAuditLog itself. This function is
 * never invoked; it exists solely so TypeScript validates (or rejects) each
 * call signature at compile time.
 */
function auditLogSignatureChecks(): void {
  // Mapped action without metadata -> compile error.
  // @ts-expect-error mapped actions require exact metadata
  createAuditLog({ action: "ADDED_INCOME", organizationId: "org-1" });

  // Incomplete metadata -> compile error.
  // @ts-expect-error TransactionEditAuditMetadata requires full before/after snapshots
  createAuditLog({ action: "EDITED_TRANSACTION", organizationId: "org-1", metadata: { before: {}, after: {} } });

  // Unsupported extra field -> compile error (exact type, no Record intersection).
  // @ts-expect-error unexpected extra metadata field is rejected
  createAuditLog({ action: "DELETED_TRANSACTION", organizationId: "org-1", metadata: { deleteReason: "Correction", before: transactionSnapshot, unexpectedField: 1 } });

  // Correct metadata -> compiles.
  createAuditLog({
    action: "ADDED_INCOME",
    organizationId: "org-1",
    metadata: { type: "INCOME", cashAccount: "CASH_ON_HAND", amountCents: 1000, categoryId: "cat-1", categoryName: "Dues" },
  });

  // Unmapped/system actions remain untyped and optional.
  createSystemAuditLog({ action: "LOGGED_IN", userId: "user-1", organizationId: "org-1", metadata: { redirectDestination: "/dashboard" } });
  createSystemAuditLog({ action: "LOGGED_OUT", userId: "user-1" });
}
void auditLogSignatureChecks;

/* Runtime assertions: the compile-time mapping covers every financial audit action. */
test("Audit Log: AuditMetadataByAction mapping covers every financial audit action", () => {
  const mappedActions: FinancialAuditAction[] = [
    "ADDED_INCOME",
    "ADDED_EXPENSE",
    "EDITED_TRANSACTION",
    "DELETED_TRANSACTION",
    "CREATED_CASH_TRANSFER",
    "EDITED_CASH_TRANSFER",
    "DELETED_CASH_TRANSFER",
    "CHANGED_OPENING_BALANCE",
    "ACTIVATED_ACADEMIC_TERM",
  ];
  for (const action of mappedActions) {
    assert.ok(action in compileTimeAssertions, `missing mapping for ${action}`);
  }
  assert.deepEqual(Object.keys(compileTimeAssertions).sort(), mappedActions.sort());
});

test("Audit Log: transaction create, edit, and delete metadata carries all mutable and identifying fields", () => {
  const createMetadata: TransactionCreateAuditMetadata = {
    type: "INCOME",
    cashAccount: "CASH_ON_HAND",
    amountCents: 10000,
    categoryId: "cat-1",
    categoryName: "Membership Dues",
    documentNumber: "OR-2026-001",
    counterpartyName: "Fictional Student",
    description: "Membership dues collection",
    referenceDescription: "Official receipt reference",
    eventActivityName: "Freshman Orientation",
  };
  assert.equal(createMetadata.type, "INCOME");
  assert.equal(createMetadata.cashAccount, "CASH_ON_HAND");
  assert.equal(createMetadata.amountCents, 10000);
  assert.equal(createMetadata.categoryId, "cat-1");
  assert.equal(createMetadata.categoryName, "Membership Dues");
  assert.equal(createMetadata.documentNumber, "OR-2026-001");
  assert.equal(createMetadata.counterpartyName, "Fictional Student");
  assert.equal(createMetadata.description, "Membership dues collection");
  assert.equal(createMetadata.referenceDescription, "Official receipt reference");
  assert.equal(createMetadata.eventActivityName, "Freshman Orientation");

  const editMetadata: TransactionEditAuditMetadata = {
    before: transactionSnapshot,
    after: { ...transactionSnapshot, amountCents: 12000, description: "Membership dues collection adjusted", referenceDescription: "Official receipt reference rev 1", version: 2 },
  };
  assert.deepEqual(Object.keys(editMetadata.before).sort(), [
    "amountCents",
    "cashAccount",
    "categoryId",
    "categoryName",
    "counterpartyName",
    "createdAt",
    "description",
    "documentNumber",
    "eventActivityName",
    "id",
    "organizationId",
    "recordedByUserId",
    "referenceDescription",
    "termId",
    "transactionDate",
    "type",
    "version",
  ]);
  assert.equal(editMetadata.before.organizationId, "org-1");
  assert.equal(editMetadata.before.termId, "term-1");
  assert.equal(editMetadata.before.recordedByUserId, "user-1");
  assert.equal(editMetadata.after.documentNumber, "OR-2026-001");
  assert.equal(editMetadata.after.eventActivityName, "Freshman Orientation");

  const deleteMetadata: TransactionDeleteAuditMetadata = {
    deleteReason: "Recorded in error",
    before: { ...transactionSnapshot, amountCents: 12000, description: "Membership dues collection adjusted", referenceDescription: "Official receipt reference rev 1", version: 2 },
  };
  assert.deepEqual(Object.keys(deleteMetadata.before).sort(), [
    "amountCents",
    "cashAccount",
    "categoryId",
    "categoryName",
    "counterpartyName",
    "createdAt",
    "description",
    "documentNumber",
    "eventActivityName",
    "id",
    "organizationId",
    "recordedByUserId",
    "referenceDescription",
    "termId",
    "transactionDate",
    "type",
    "version",
  ]);
  assert.equal(deleteMetadata.deleteReason, "Recorded in error");
  assert.equal(deleteMetadata.before.organizationId, "org-1");
  assert.equal(deleteMetadata.before.termId, "term-1");
});

test("Audit Log: cash transfer edit and delete use before/after snapshots with full identifying fields", () => {
  const editMetadata = {
    before: transferSnapshot,
    after: { ...transferSnapshot, amountCents: 20000, documentNumber: "REF-001-REV", description: "Initial deposit adjusted", referenceDescription: "Deposit slip rev 1", version: 2 },
  };

  assert.equal(editMetadata.before.documentNumber, "REF-001");
  assert.equal(editMetadata.before.eventActivityName, "Orientation");
  assert.equal(editMetadata.before.organizationId, "org-1");
  assert.equal(editMetadata.before.termId, "term-1");
  assert.equal(editMetadata.before.recordedByUserId, "user-1");
  assert.equal(editMetadata.after.documentNumber, "REF-001-REV");
  assert.equal(editMetadata.after.eventActivityName, "Orientation");
  assert.equal(editMetadata.after.version, 2);

  const deleteMetadata = {
    before: { ...transferSnapshot, documentNumber: "REF-001-REV", description: "Initial deposit adjusted", referenceDescription: "Deposit slip rev 1", version: 2 },
    deleteReason: "Correction",
  };

  assert.equal(deleteMetadata.before.documentNumber, "REF-001-REV");
  assert.equal(deleteMetadata.before.eventActivityName, "Orientation");
  assert.equal(deleteMetadata.before.organizationId, "org-1");
  assert.equal(deleteMetadata.before.termId, "term-1");
  assert.equal(deleteMetadata.deleteReason, "Correction");
});

test("Audit Log: recursive redaction of sensitive keys in nested objects and arrays", () => {
  const input = {
    action: "EDITED_TRANSACTION",
    amountCents: 5000,
    before: {
      type: "INCOME",
      description: "Membership dues",
      nested: {
        passwordHash: "bcrypt-hash-value",
        token: "session-token",
        safeValue: "keep-me",
      },
    },
    after: {
      type: "EXPENSE",
      metadata: ["array", { secret: "s3cret", ordinary: "ok" }],
    },
  };

  const redacted = redactSensitiveKeys(input) as Record<string, unknown>;
  const before = redacted.before as Record<string, unknown>;
  const beforeNested = before.nested as Record<string, unknown>;
  const after = redacted.after as Record<string, unknown>;
  const afterMetadata = after.metadata as unknown[];
  const afterMetadataSecond = afterMetadata[1] as Record<string, unknown>;

  assert.equal(redacted.action, "EDITED_TRANSACTION");
  assert.equal(redacted.amountCents, 5000);
  assert.equal(before.type, "INCOME");
  assert.equal(before.description, "Membership dues");
  assert.equal(beforeNested.passwordHash, "[REDACTED]");
  assert.equal(beforeNested.token, "[REDACTED]");
  assert.equal(beforeNested.safeValue, "keep-me");
  assert.equal(afterMetadata[0], "array");
  assert.equal(afterMetadataSecond.secret, "[REDACTED]");
  assert.equal(afterMetadataSecond.ordinary, "ok");
});

test("Audit Log: formatHumanReadableSummary computes detailed summaries for edits, balance updates, and registration", async () => {
  const { formatHumanReadableSummary } = await import("../../lib/data/audit-log");
  const { AuditAction } = await import("@prisma/client");

  // EDITED_TRANSACTION with before/after
  const txEditSummary = formatHumanReadableSummary({
    action: AuditAction.EDITED_TRANSACTION,
    metadata: {
      before: { type: "INCOME", amountCents: 5000, cashAccount: "CASH_ON_HAND", transactionDate: "2026-08-01", description: "Old", counterpartyName: "Payor A" },
      after: { type: "EXPENSE", amountCents: 8000, cashAccount: "CASH_IN_BANK", transactionDate: "2026-08-02", description: "New", counterpartyName: "Payee B" },
    },
  });
  assert.match(txEditSummary, /Edited transaction/);
  assert.match(txEditSummary, /type: INCOME -> EXPENSE/);
  assert.match(txEditSummary, /amount: ₱50.00 -> ₱80.00/);

  // EDITED_CASH_TRANSFER with before/after
  const transferEditSummary = formatHumanReadableSummary({
    action: AuditAction.EDITED_CASH_TRANSFER,
    metadata: {
      before: { amountCents: 10000, fromAccount: "CASH_ON_HAND", toAccount: "CASH_IN_BANK", transferDate: "2026-08-01", description: "Transfer Old" },
      after: { amountCents: 15000, fromAccount: "CASH_ON_HAND", toAccount: "CASH_IN_BANK", transferDate: "2026-08-02", description: "Transfer New" },
    },
  });
  assert.match(transferEditSummary, /Edited cash transfer/);
  assert.match(transferEditSummary, /amount: ₱100.00 -> ₱150.00/);

  // CHANGED_OPENING_BALANCE with before/after
  const balanceSummary = formatHumanReadableSummary({
    action: AuditAction.CHANGED_OPENING_BALANCE,
    metadata: {
      previousCashOnHandCents: 100000,
      newCashOnHandCents: 150000,
      previousCashInBankCents: 200000,
      newCashInBankCents: 250000,
    },
  });
  assert.match(balanceSummary, /Updated Opening Balances/);
  assert.match(balanceSummary, /COH: ₱1,000.00 -> ₱1,500.00/);
  assert.match(balanceSummary, /CIB: ₱2,000.00 -> ₱2,500.00/);

  // REGISTERED_USER with production metadata shape (actorFullName, actorUsername, requestedRole)
  const regSummary = formatHumanReadableSummary({
    action: AuditAction.REGISTERED_USER,
    metadata: {
      actorFullName: "Fictional User",
      actorUsername: "fictional_user",
      requestedRole: "OFFICER",
    },
  });
  assert.equal(regSummary, "Registered new user account Fictional User (fictional_user) as OFFICER");
});

test("Audit Log Domain: cstack multi-page pagination navigation (Page 1 -> 2 -> 3 -> 4 -> 3 -> 2 -> 1)", async () => {
  const { parseCursorStack, encodeCursorStack } = await import("../../lib/domain/query");

  // Page 4: cursor = C3, cstack = C1.C2.C3
  const cstack4 = "C1.C2.C3";
  const stack4 = parseCursorStack(cstack4);
  assert.deepEqual(stack4, ["C1", "C2", "C3"]);

  // Traverse to Page 3
  const stack3 = [...stack4];
  stack3.pop();
  const cursor3 = stack3[stack3.length - 1];
  assert.equal(cursor3, "C2");
  assert.equal(encodeCursorStack(stack3), "C1.C2");

  // Traverse to Page 2
  const stack2 = [...stack3];
  stack2.pop();
  const cursor2 = stack2[stack2.length - 1];
  assert.equal(cursor2, "C1");
  assert.equal(encodeCursorStack(stack2), "C1");

  // Traverse to Page 1
  const stack1 = [...stack2];
  stack1.pop();
  const cursor1 = stack1[stack1.length - 1];
  assert.equal(cursor1, undefined);
  assert.equal(encodeCursorStack(stack1), undefined);
});

