import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { PrismaClient, Role, ExpenseReportBucket, CashAccount } from "@prisma/client";
import type { SessionUser } from "../../lib/auth/session";

// Production modules are NEVER statically imported here: they transitively
// import lib/db/prisma.ts, which instantiates the global Prisma singleton at
// import time. They are dynamically imported in test.before AFTER DATABASE_URL
// points at the isolated temporary database.
type GetTermByIdForUser = typeof import("../../lib/data/terms").getTermByIdForUser;
type ListTermsForUser = typeof import("../../lib/data/terms").listTermsForUser;
type GetActiveTermForUser = typeof import("../../lib/data/terms").getActiveTermForUser;
type ListLedgerTransactionsForUser = typeof import("../../lib/data/transactions").listLedgerTransactionsForUser;
type GetLedgerPageSnapshot = typeof import("../../lib/data/transactions").getLedgerPageSnapshot;
type GetTransactionForEditForUser = typeof import("../../lib/data/transactions").getTransactionForEditForUser;
type GetReportPackageForUser = typeof import("../../lib/data/reports").getReportPackageForUser;
type CreateAuditLog = typeof import("../../lib/data/audit-log").createAuditLog;
type ToAuditLogDto = typeof import("../../lib/data/audit-log").toAuditLogDto;
type ValidateOsaOrganizationForUser = typeof import("../../lib/data/osa").validateOsaOrganizationForUser;
type GetOsaLedgerSummaryForUser = typeof import("../../lib/data/osa").getOsaLedgerSummaryForUser;

const testDbPath = path.join(__dirname, "temp_isolation_test.db");
const dbUrl = `file:${testDbPath}`;
const sandboxUploadsDir = path.join(__dirname, "temp_isolation_uploads");

let getTermByIdForUser: GetTermByIdForUser | null = null;
let listTermsForUser: ListTermsForUser | null = null;
let getActiveTermForUser: GetActiveTermForUser | null = null;
let listLedgerTransactionsForUser: ListLedgerTransactionsForUser | null = null;
let getLedgerPageSnapshot: GetLedgerPageSnapshot | null = null;
let getTransactionForEditForUser: GetTransactionForEditForUser | null = null;
let getReportPackageForUser: GetReportPackageForUser | null = null;
let createAuditLog: CreateAuditLog | null = null;
let toAuditLogDto: ToAuditLogDto | null = null;
let validateOsaOrganizationForUser: ValidateOsaOrganizationForUser | null = null;
let getOsaLedgerSummaryForUser: GetOsaLedgerSummaryForUser | null = null;

let orgAId = "";
let orgBId = "";

let termAId = "";
let termBId = "";

let txAId = "";
let txBId = "";

const treasurerActorA: SessionUser = {
  id: "user-treasurer-a",
  fullName: "Treasurer A",
  username: "treasurer_a",
  role: Role.TREASURER,
  organizationId: "",
  organizationName: "Org A",
  active: true,
  mustChangePassword: false,
};

const officerActorA: SessionUser = {
  id: "user-officer-a",
  fullName: "Officer A",
  username: "officer_a",
  role: Role.OFFICER,
  organizationId: "",
  organizationName: "Org A",
  active: true,
  mustChangePassword: false,
};

const memberActorA: SessionUser = {
  id: "user-member-a",
  fullName: "Member A",
  username: "member_a",
  role: Role.MEMBER,
  organizationId: "",
  organizationName: "Org A",
  active: true,
  mustChangePassword: false,
};

const treasurerActorB: SessionUser = {
  id: "user-treasurer-b",
  fullName: "Treasurer B",
  username: "treasurer_b",
  role: Role.TREASURER,
  organizationId: "",
  organizationName: "Org B",
  active: true,
  mustChangePassword: false,
};

const osaActor: SessionUser = {
  id: "user-osa",
  fullName: "OSA Monitor",
  username: "osa_user",
  role: Role.OSA,
  organizationId: null,
  organizationName: null,
  active: true,
  mustChangePassword: false,
};

test.before(async () => {
  // 1. Configure the isolated temporary database FIRST
  process.env.DATABASE_URL = dbUrl;

  // 2. Scaffold the isolated database with the real Prisma schema
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  fs.writeFileSync(testDbPath, Buffer.alloc(0));
  execSync(`node scripts/migrate.js --deploy --db-url "${dbUrl}" --uploads-root "${sandboxUploadsDir}"`, {
    cwd: path.join(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: dbUrl },
    encoding: "utf8",
    stdio: "ignore",
  });

  // 3. Clear any existing test-process global Prisma singleton
  delete (globalThis as { prisma?: unknown }).prisma;

  // 4. Dynamically import production DAL services only after env + db are ready
  const termsModule = await import("../../lib/data/terms");
  const transactionsModule = await import("../../lib/data/transactions");
  const reportsModule = await import("../../lib/data/reports");
  const osaModule = await import("../../lib/data/osa");
  getTermByIdForUser = termsModule.getTermByIdForUser;
  listTermsForUser = termsModule.listTermsForUser;
  getActiveTermForUser = termsModule.getActiveTermForUser;
  listLedgerTransactionsForUser = transactionsModule.listLedgerTransactionsForUser;
  getLedgerPageSnapshot = transactionsModule.getLedgerPageSnapshot;
  getTransactionForEditForUser = transactionsModule.getTransactionForEditForUser;
  getReportPackageForUser = reportsModule.getReportPackageForUser;
  const auditModule = await import("../../lib/data/audit-log");
  createAuditLog = auditModule.createAuditLog;
  toAuditLogDto = auditModule.toAuditLogDto;
  validateOsaOrganizationForUser = osaModule.validateOsaOrganizationForUser;
  getOsaLedgerSummaryForUser = osaModule.getOsaLedgerSummaryForUser;

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const orgA = await prisma.organization.create({ data: { name: "Org A", slug: "org-a", active: true } });
    const orgB = await prisma.organization.create({ data: { name: "Org B", slug: "org-b", active: true } });
    await prisma.organization.create({ data: { name: "Inactive Org C", slug: "org-c", active: false } });

    orgAId = orgA.id;
    orgBId = orgB.id;

    treasurerActorA.organizationId = orgA.id;
    officerActorA.organizationId = orgA.id;
    memberActorA.organizationId = orgA.id;
    treasurerActorB.organizationId = orgB.id;

    await prisma.user.create({
      data: {
        id: treasurerActorA.id,
        username: treasurerActorA.username,
        passwordHash: "dummyhash",
        fullName: treasurerActorA.fullName,
        role: treasurerActorA.role,
        organizationId: orgA.id,
      },
    });

    await prisma.user.create({
      data: {
        id: treasurerActorB.id,
        username: treasurerActorB.username,
        passwordHash: "dummyhash",
        fullName: treasurerActorB.fullName,
        role: treasurerActorB.role,
        organizationId: orgB.id,
      },
    });

    const termA = await prisma.academicTerm.create({
      data: { organizationId: orgA.id, academicYear: "2025-2026", semester: "FIRST_SEMESTER", openingCashOnHandCents: 100000, openingCashInBankCents: 200000, active: true },
    });
    termAId = termA.id;

    const termB = await prisma.academicTerm.create({
      data: { organizationId: orgB.id, academicYear: "2025-2026", semester: "FIRST_SEMESTER", openingCashOnHandCents: 500000, openingCashInBankCents: 500000, active: true },
    });
    termBId = termB.id;

    const catIncA = await prisma.transactionCategory.create({
      data: { name: "Org A Dues", type: "INCOME", reportBucket: ExpenseReportBucket.OTHERS, active: true },
    });
    const catIncB = await prisma.transactionCategory.create({
      data: { name: "Org B Fees", type: "INCOME", reportBucket: ExpenseReportBucket.OTHERS, active: true },
    });

    const txA = await prisma.transaction.create({
      data: {
        organizationId: orgA.id,
        termId: termA.id,
        type: "INCOME",
        transactionDate: new Date(),
        amountCents: 15000,
        cashAccount: "CASH_ON_HAND",
        categoryId: catIncA.id,
        counterpartyName: "Member A",
        description: "Dues Payment",
        referenceDescription: "Ref A",
        eventActivityName: "Event A",
        recordedByUserId: treasurerActorA.id,
      },
    });
    txAId = txA.id;

    const txB = await prisma.transaction.create({
      data: {
        organizationId: orgB.id,
        termId: termB.id,
        type: "INCOME",
        transactionDate: new Date(),
        amountCents: 25000,
        cashAccount: "CASH_ON_HAND",
        categoryId: catIncB.id,
        counterpartyName: "Member B",
        description: "Fee Payment",
        referenceDescription: "Ref B",
        eventActivityName: "Event B",
        recordedByUserId: treasurerActorB.id,
      },
    });
    txBId = txB.id;
  } finally {
    await prisma.$disconnect();
  }
});

test.after(async () => {
  // Disconnect the production Prisma singleton and clear it
  try {
    const { prisma } = await import("../../lib/db/prisma");
    await prisma.$disconnect();
  } catch { /* best effort */ }
  delete (globalThis as { prisma?: unknown }).prisma;

  // Clean temporary database and sidecars
  for (const file of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`, `${testDbPath}-journal`]) {
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch { /* best effort */ }
  }
});

test("Organization Isolation Integration: Production Prisma singleton uses the isolated temporary database", async () => {
  const { prisma } = await import("../../lib/db/prisma");
  try {
    const rows = (await prisma.$queryRawUnsafe("PRAGMA database_list;")) as Array<{ name: string; file: string | null }>;
    const mainRow = rows.find((r) => r.name === "main");
    assert.ok(mainRow, "PRAGMA database_list must contain a main database row");
    assert.ok(mainRow.file, "Main database row must report a file path");

    const activeFile = path.resolve(mainRow.file);
    assert.equal(activeFile, path.resolve(testDbPath), "Production Prisma singleton must target the temporary test database");
    assert.notEqual(activeFile, path.resolve(path.join(__dirname, "../..", "prisma", "dev.db")), "Production Prisma must not target the normal development database");
  } finally {
    await prisma.$disconnect();
  }
});

test("Organization Isolation Integration: audit DTO retains actor and organization snapshots after rename", async () => {
  assert.ok(createAuditLog && toAuditLogDto);
  const audit = createAuditLog;
  const mapAudit = toAuditLogDto;
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await audit({
      userId: treasurerActorA.id,
      organizationId: orgAId,
      role: Role.TREASURER,
      action: "GENERATED_REPORT",
      entityType: "ReportPackage",
      entityId: "snapshot-test",
      metadata: { reportType: "PACKAGE", termId: termAId },
      throwOnError: true,
    });
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: "snapshot-test" },
      include: {
        user: { select: { id: true, username: true, fullName: true } },
        organization: { select: { id: true, name: true } },
      },
    });
    await prisma.user.update({ where: { id: treasurerActorA.id }, data: { username: "renamed_treasurer", fullName: "Renamed Treasurer" } });
    await prisma.organization.update({ where: { id: orgAId }, data: { name: "Renamed Organization" } });
    const renamedRow = await prisma.auditLog.findUniqueOrThrow({
      where: { id: row.id },
      include: {
        user: { select: { id: true, username: true, fullName: true } },
        organization: { select: { id: true, name: true } },
      },
    });
    const dto = mapAudit(renamedRow);
    assert.equal(dto.username, "treasurer_a");
    assert.equal(dto.fullName, "Treasurer A");
    assert.equal(dto.organizationName, "Org A");
    await prisma.user.update({ where: { id: treasurerActorA.id }, data: { username: "treasurer_a", fullName: "Treasurer A" } });
    await prisma.organization.update({ where: { id: orgAId }, data: { name: "Org A" } });
  } finally {
    await prisma.$disconnect();
  }
});

test("Organization Isolation Integration: unified ledger ordering and opaque pagination", async () => {
  assert.ok(getLedgerPageSnapshot);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  let secondTransactionId: string | null = null;
  let transferId: string | null = null;
  try {
    const category = await prisma.transactionCategory.findFirstOrThrow({ where: { id: { not: "" }, type: "INCOME" } });
    const secondTransaction = await prisma.transaction.create({
      data: {
        organizationId: orgAId,
        termId: termAId,
        type: "INCOME",
        transactionDate: new Date("2099-01-02T00:00:00.000Z"),
        amountCents: 1200,
        cashAccount: CashAccount.CASH_ON_HAND,
        categoryId: category.id,
        counterpartyName: "Fictional Payor Two",
        description: "Second ledger entry",
        referenceDescription: "Ref two",
        eventActivityName: "Event two",
        recordedByUserId: treasurerActorA.id,
        createdAt: new Date("2025-08-02T01:00:00.000Z"),
      },
    });
    secondTransactionId = secondTransaction.id;
    const transfer = await prisma.cashTransfer.create({
      data: {
        organizationId: orgAId,
        termId: termAId,
        transferDate: new Date("2099-01-03T00:00:00.000Z"),
        fromAccount: CashAccount.CASH_ON_HAND,
        toAccount: CashAccount.CASH_IN_BANK,
        amountCents: 500,
        description: "Fictional cash movement",
        referenceDescription: "Transfer ref",
        recordedByUserId: treasurerActorA.id,
        createdAt: new Date("2025-08-03T01:00:00.000Z"),
      },
    });
    transferId = transfer.id;

    const first = await getLedgerPageSnapshot(treasurerActorA, {
      academicYear: "2025-2026",
      semester: "FIRST_SEMESTER",
      pageSize: "1",
    });
    assert.equal(first.pagination.countOnPage, 1);
    assert.equal(first.entries[0].kind, "TRANSFER");
    assert.ok(first.pagination.nextCursor);

    const second = await getLedgerPageSnapshot(treasurerActorA, {
      academicYear: "2025-2026",
      semester: "FIRST_SEMESTER",
      pageSize: "1",
      cursor: first.pagination.nextCursor,
    });
    assert.equal(second.pagination.countOnPage, 1);
    assert.notEqual(second.entries[0].id, first.entries[0].id);
    assert.ok([second.entries[0].id, first.entries[0].id].includes(secondTransaction.id) || [second.entries[0].id, first.entries[0].id].includes(transfer.id));
  } finally {
    if (transferId) await prisma.cashTransfer.deleteMany({ where: { id: transferId } });
    if (secondTransactionId) await prisma.transaction.deleteMany({ where: { id: secondTransactionId } });
    await prisma.$disconnect();
  }
});

test("Organization Isolation Integration: Production DAL services enforce organization scope and role permissions", async () => {
  assert.ok(getTermByIdForUser && listTermsForUser && getActiveTermForUser && listLedgerTransactionsForUser
    && getTransactionForEditForUser && getReportPackageForUser && validateOsaOrganizationForUser && getOsaLedgerSummaryForUser,
    "DAL services must be loaded by test.before");
  const getTerm = getTermByIdForUser;
  const listTerms = listTermsForUser;
  const getActiveTerm = getActiveTermForUser;
  const listLedger = listLedgerTransactionsForUser;
  const getTxForEdit = getTransactionForEditForUser;
  const getReport = getReportPackageForUser;
  const validateOsaOrg = validateOsaOrganizationForUser;
  const getOsaSummary = getOsaLedgerSummaryForUser;

  assert.ok(orgBId);

  // 1. Same-organization term access
  const termOk = await getTerm(termAId, treasurerActorA);
  assert.ok(termOk);
  assert.equal(termOk.id, termAId);

  const termLeak = await getTerm(termBId, treasurerActorA);
  assert.equal(termLeak, null, "Treasurer A must not be able to access Org B term");

  const termsListA = await listTerms(treasurerActorA);
  assert.equal(termsListA.length, 1);
  assert.equal(termsListA[0].id, termAId);

  // 2. Same-organization detailed ledger access (Management only)
  const txsA = await listLedger({}, treasurerActorA);
  assert.equal(txsA.length, 1);
  assert.equal(txsA[0].id, txAId);

  const txEditLeak = await getTxForEdit(txBId, treasurerActorA);
  assert.equal(txEditLeak, null, "Treasurer A must not be able to fetch Org B transaction for edit");

  // 3. Officer, Member, and OSA rejection from detailed-ledger service
  const officerLedger = await listLedger({}, officerActorA);
  assert.equal(officerLedger.length, 0, "Officer must be rejected from detailed ledger service");

  const memberLedger = await listLedger({}, memberActorA);
  assert.equal(memberLedger.length, 0, "Member must be rejected from detailed ledger service");

  const osaLedger = await listLedger({}, osaActor);
  assert.equal(osaLedger.length, 0, "OSA must be rejected from detailed ledger service");

  // 4. OSA actor with hypothetical organizationId rejected by every same-organization service
  const osaWithOrg: SessionUser = {
    ...osaActor,
    organizationId: orgAId,
  };
  assert.equal(await getActiveTerm(osaWithOrg), null, "OSA with orgId must be rejected by getActiveTermForUser");
  assert.deepEqual(await listTerms(osaWithOrg), [], "OSA with orgId must be rejected by listTermsForUser");
  assert.equal(await getReport(osaWithOrg, termAId), null, "OSA with orgId must be rejected by getReportPackageForUser");
  assert.deepEqual(await listLedger({}, osaWithOrg), [], "OSA with orgId must be rejected by listLedgerTransactionsForUser");

  // 5. Officer/Member same-organization term and HTML report services still work
  const officerActiveTerm = await getActiveTerm(officerActorA);
  assert.ok(officerActiveTerm);
  assert.equal(officerActiveTerm.id, termAId);

  const officerTerms = await listTerms(officerActorA);
  assert.equal(officerTerms.length, 1);

  const officerReport = await getReport(officerActorA, termAId);
  assert.ok(officerReport);
  assert.equal(officerReport.organizationId, orgAId);

  const memberReport = await getReport(memberActorA, termAId);
  assert.ok(memberReport);
  assert.equal(memberReport.organizationId, orgAId);

  // 6. Management transaction edit rejection for Officer/Member
  const officerEditDenied = await getTxForEdit(txAId, officerActorA);
  assert.equal(officerEditDenied, null, "Officer role must be rejected from transaction edit service");

  // 7. Report-package organization scope
  const reportPackageBLeak = await getReport(treasurerActorA, termBId);
  assert.equal(reportPackageBLeak, null, "Org A Treasurer must not receive Org B report package");

  // 8. Active OSA organization selection
  const osaOrgA = await validateOsaOrg("org-a", osaActor);
  assert.ok(osaOrgA);
  assert.equal(osaOrgA.id, orgAId);

  // 9. Inactive / nonexistent OSA organization rejection
  const osaInactive = await validateOsaOrg("org-c", osaActor);
  assert.equal(osaInactive, null, "Inactive organization must be rejected for OSA selection");

  const osaMissing = await validateOsaOrg("nonexistent-slug", osaActor);
  assert.equal(osaMissing, null, "Nonexistent organization must be rejected for OSA selection");

  // 10. Non-OSA rejection from OSA services
  await assert.rejects(
    async () => {
      await validateOsaOrg("org-a", treasurerActorA);
    },
    { message: "Access denied: OSA monitoring access required." }
  );

  await assert.rejects(
    async () => {
      await getOsaSummary("org-a", treasurerActorA);
    },
    { message: "Access denied: OSA monitoring access required." }
  );

  // 11. Soft-deleted transactions excluded from report package results
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await prisma.transaction.update({
      where: { id: txAId },
      data: { deletedAt: new Date(), deleteReason: "Soft deletion test" },
    });
    const reportAfterDelete = await getReport(treasurerActorA, termAId);
    assert.ok(reportAfterDelete);
    assert.equal(reportAfterDelete.totalIncomeCents, 0, "Soft-deleted income transaction must be excluded from report totals");
    assert.equal(reportAfterDelete.collectionGroups.length, 0, "Soft-deleted collection items must be excluded from Schedule 1");
  } finally {
    await prisma.$disconnect();
  }

  // 12. OSA rejection from getDashboardBalancesForUser
  const transactionsModule = await import("../../lib/data/transactions");
  const osaBalances = await transactionsModule.getDashboardBalancesForUser(osaActor);
  assert.equal(osaBalances, null, "OSA user must be denied and return null from getDashboardBalancesForUser");

  const osaWithOrgBalances = await transactionsModule.getDashboardBalancesForUser(osaWithOrg);
  assert.equal(osaWithOrgBalances, null, "OSA user with orgId must still be denied and return null from getDashboardBalancesForUser");
});

test("Organization Isolation Integration: Historical term safety in transaction and transfer creation services", async () => {
  const transactionsSvcModule = await import("../../lib/application/transactions");
  const transfersSvcModule = await import("../../lib/application/transfers");
  const { AttachmentStorageService } = await import("../../lib/infrastructure/storage/attachment-store");

  // Sandbox storage so fail-closed rejected commands never touch production uploads.
  const sandboxUploads = path.join(__dirname, "temp_isolation_uploads");
  if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  const storage = new AttachmentStorageService(sandboxUploads);

  // Attempt to pass an inactive/historical termId
  await assert.rejects(
    async () => {
      await transactionsSvcModule.createTransactionService(treasurerActorA, {
        termId: "historical-term-999",
        type: "INCOME",
        transactionDate: new Date(),
        amountCents: 1000,
        cashAccount: CashAccount.CASH_ON_HAND,
        categoryId: "cat-1",
        counterpartyName: "Test",
        description: "Historical test",
        referenceDescription: "Ref",
        idempotencyKey: "historical-tx-key-1",
        attachment: {
          originalName: "test.png",
          mimeType: "image/png",
          sizeBytes: 8,
          buffer: Buffer.from(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        },
      }, { storageService: storage });
    },
    /The selected academic term is no longer active/
  );

  await assert.rejects(
    async () => {
      await transfersSvcModule.createCashTransferService(treasurerActorA, {
        termId: "historical-term-999",
        transferDate: new Date(),
        amountCents: 1000,
        fromAccount: CashAccount.CASH_ON_HAND,
        toAccount: CashAccount.CASH_IN_BANK,
        description: "Historical transfer",
        referenceDescription: "Ref",
        idempotencyKey: "historical-tf-key-1",
        attachment: {
          originalName: "test.png",
          mimeType: "image/png",
          sizeBytes: 8,
          buffer: Buffer.from(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        },
      }, { storageService: storage });
    },
    /The selected academic term is no longer active/
  );

  if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
});
