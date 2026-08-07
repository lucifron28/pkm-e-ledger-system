import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { execFileSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const ROOT_DIR = path.resolve(__dirname, "../..");
const SOURCE_MIGRATIONS_DIR = path.join(ROOT_DIR, "prisma", "migrations");
const TEMP_MIGRATION_DIR = path.resolve(__dirname, "../temp_migration_test");
const PHASE_7_MIGRATIONS = [
  "20260707000000_init",
  "20260717165141_add_must_change_password",
  "20260731000001_audit_log_immutability",
];
const HARDENED_MIGRATIONS = [
  ...PHASE_7_MIGRATIONS,
  "20260731160613_enforce_financial_invariants",
  "20260801000000_storage_keys_and_audit_snapshots",
];

function cleanupTempDir() {
  if (fs.existsSync(TEMP_MIGRATION_DIR)) {
    fs.rmSync(TEMP_MIGRATION_DIR, { recursive: true, force: true });
  }
}

function prepareMigrationFixture(name: string, migrationNames: string[]): string {
  const fixtureDir = path.join(TEMP_MIGRATION_DIR, name);
  const fixtureMigrationsDir = path.join(fixtureDir, "migrations");
  fs.mkdirSync(fixtureMigrationsDir, { recursive: true });
  fs.copyFileSync(
    path.join(ROOT_DIR, "prisma", "schema.prisma"),
    path.join(fixtureDir, "schema.prisma")
  );
  fs.copyFileSync(
    path.join(SOURCE_MIGRATIONS_DIR, "migration_lock.toml"),
    path.join(fixtureMigrationsDir, "migration_lock.toml")
  );
  for (const migrationName of migrationNames) {
    fs.cpSync(
      path.join(SOURCE_MIGRATIONS_DIR, migrationName),
      path.join(fixtureMigrationsDir, migrationName),
      { recursive: true }
    );
  }
  return path.join(fixtureDir, "schema.prisma");
}

function runPreflight(dbUrl: string, uploadsRoot: string, rollback = false): void {
  const preflightArgs = [
    path.join(ROOT_DIR, "scripts", "attachment-storage-preflight.js"),
    "--db-url",
    dbUrl,
    "--uploads-root",
    uploadsRoot,
  ];
  if (rollback) preflightArgs.push("--rollback");
  const result = execFileSync(process.execPath, preflightArgs, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (!result.includes("[preflight] SUCCESS")) {
    throw new Error(`Attachment storage-key preflight did not succeed: ${result}`);
  }
}

function runOrchestrator(
  dbUrl: string,
  uploadsRoot: string,
  schemaPath: string,
  opts: { deploy?: boolean; failOk?: boolean } = {}
): string {
  const orchestratorArgs = [
    path.join(ROOT_DIR, "scripts", "migrate.js"),
    "--db-url",
    dbUrl,
    "--uploads-root",
    uploadsRoot,
    "--schema",
    schemaPath,
  ];
  if (opts.deploy !== false) orchestratorArgs.push("--deploy");
  try {
    const result = execFileSync(process.execPath, orchestratorArgs, {
      cwd: ROOT_DIR,
      encoding: "utf8",
      stdio: "pipe",
    });
    if (!result.includes("[migrate] SUCCESS")) {
      throw new Error(`Migration orchestrator did not report success: ${result}`);
    }
    return result;
  } catch (error) {
    if (opts.failOk) return "";
    throw error;
  }
}

function deployMigrations(schemaPath: string, dbUrl: string, uploadsRoot: string): void {
  runOrchestrator(dbUrl, uploadsRoot, schemaPath);
}

test("Migration Test Suite: deploy all migrations on an empty DB", async () => {
  cleanupTempDir();
  fs.mkdirSync(TEMP_MIGRATION_DIR, { recursive: true });

  const dbPath = path.join(TEMP_MIGRATION_DIR, "empty.db");
  const dbUrl = `file:${dbPath}`;
  const uploadsRoot = path.join(TEMP_MIGRATION_DIR, "uploads");
  fs.mkdirSync(uploadsRoot, { recursive: true });
  const schemaPath = prepareMigrationFixture("empty", HARDENED_MIGRATIONS);
  fs.writeFileSync(dbPath, Buffer.alloc(0));
  deployMigrations(schemaPath, dbUrl, uploadsRoot);

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const orgCount = await prisma.organization.count();
    assert.equal(orgCount, 0);
    const migrationCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`
    );
    assert.equal(Number(migrationCount[0].count), HARDENED_MIGRATIONS.length);
  } finally {
    await prisma.$disconnect();
    cleanupTempDir();
  }
});

test("Migration Test Suite: preflight aborts when a duplicate legacy key has no physical file", async () => {
  cleanupTempDir();
  fs.mkdirSync(TEMP_MIGRATION_DIR, { recursive: true });

  const dbPath = path.join(TEMP_MIGRATION_DIR, "missing_file.db");
  const dbUrl = `file:${dbPath}`;
  const uploadsRoot = path.join(TEMP_MIGRATION_DIR, "uploads");
  fs.mkdirSync(uploadsRoot, { recursive: true });
  const phase7SchemaPath = prepareMigrationFixture("phase7-missing", PHASE_7_MIGRATIONS);
  fs.writeFileSync(dbPath, Buffer.alloc(0));
  deployMigrations(phase7SchemaPath, dbUrl, uploadsRoot);

  const legacyPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "Organization" ("id", "name", "slug", "active", "updatedAt") VALUES ('org-1', 'Fictional Organization', 'fictional-organization', 1, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "AcademicTerm" ("id", "organizationId", "academicYear", "semester", "openingCashOnHandCents", "openingCashInBankCents", "active", "createdAt", "updatedAt") VALUES ('term-canonical', 'org-1', '2026-2027', 'FIRST_SEMESTER', 999, 999, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "TransactionCategory" ("id", "name", "type", "reportBucket", "active", "updatedAt") VALUES ('cat-1', 'Fictional Supplies', 'EXPENSE', 'Supplies', 1, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "fullName", "username", "passwordHash", "role", "organizationId", "active", "mustChangePassword", "updatedAt") VALUES ('user-1', 'Fictional Treasurer', 'fictional_treasurer', 'hash', 'TREASURER', 'org-1', 1, 0, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "Transaction" ("id", "organizationId", "termId", "type", "transactionDate", "amountCents", "cashAccount", "categoryId", "counterpartyName", "description", "referenceDescription", "recordedByUserId", "createdAt", "updatedAt") VALUES ('tx-1', 'org-1', 'term-canonical', 'EXPENSE', '2026-08-01T00:00:00.000Z', 500, 'CASH_ON_HAND', 'cat-1', 'Fictional Supplier', 'Fictional Purchase', 'Ref 123', 'user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
    // Two attachments share the same basename, but NO physical file exists for it.
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "Attachment" ("id", "transactionId", "uploadedById", "originalName", "storedName", "storagePath", "mimeType", "sizeBytes") VALUES ('att-1', 'tx-1', 'user-1', 'missing.png', 'stored-receipt-123.png', '/legacy/absolute/path/stored-receipt-123.png', 'image/png', 1024)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "Attachment" ("id", "transactionId", "uploadedById", "originalName", "storedName", "storagePath", "mimeType", "sizeBytes") VALUES ('att-2', 'tx-1', 'user-1', 'missing-2.png', 'stored-receipt-123.png', '/legacy/absolute/path/stored-receipt-123.png', 'image/png', 1024)`
    );
  } finally {
    await legacyPrisma.$disconnect();
  }

  // The preflight must fail hard and identify the affected rows; no copied
  // files may be left behind and the migration must never run.
  assert.throws(
    () => runPreflight(dbUrl, uploadsRoot),
    /Duplicate legacy storage keys with missing physical files/
  );
  assert.equal(
    fs.existsSync(path.join(uploadsRoot, "stored-receipt-123.png-dup-att-2")),
    false,
    "No copied file may be produced when the source file is missing"
  );
  assert.equal(
    fs.existsSync(path.join(uploadsRoot, ".attachment-storage-key-migration.json")),
    false,
    "No sidecar mapping may be written on failure"
  );
  cleanupTempDir();
});

test("Migration Test Suite: upgrade an authentic Phase 7 fixture through hardening migrations", async () => {
  cleanupTempDir();
  fs.mkdirSync(TEMP_MIGRATION_DIR, { recursive: true });

  const dbPath = path.join(TEMP_MIGRATION_DIR, "legacy_upgrade.db");
  const dbUrl = `file:${dbPath}`;
  const uploadsRoot = path.join(TEMP_MIGRATION_DIR, "uploads");
  fs.mkdirSync(uploadsRoot, { recursive: true });

  // Real fictional physical files the legacy attachment rows reference.
  const sharedPngContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);
  const legacyPdfContent = Buffer.from("%PDF-1.7 fictional legacy receipt content");
  fs.writeFileSync(path.join(uploadsRoot, "stored-receipt-123.png"), sharedPngContent);
  fs.writeFileSync(path.join(uploadsRoot, "legacy-receipt.pdf"), legacyPdfContent);
  const sha256Of = (content: Buffer) => crypto.createHash("sha256").update(content).digest("hex");
  const sharedPngHash = sha256Of(sharedPngContent);
  const legacyPdfHash = sha256Of(legacyPdfContent);

  const phase7SchemaPath = prepareMigrationFixture("phase7", PHASE_7_MIGRATIONS);
  fs.writeFileSync(dbPath, Buffer.alloc(0));
  deployMigrations(phase7SchemaPath, dbUrl, uploadsRoot);

  const legacyPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "Organization" ("id", "name", "slug", "active", "updatedAt") VALUES ('org-1', 'Fictional Organization', 'fictional-organization', 1, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "AcademicTerm" ("id", "organizationId", "academicYear", "semester", "openingCashOnHandCents", "openingCashInBankCents", "active", "createdAt", "updatedAt") VALUES ('term-old', 'org-1', 'A.Y. 2026-2027', 'FIRST_SEMESTER', 10000, 20000, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "AcademicTerm" ("id", "organizationId", "academicYear", "semester", "openingCashOnHandCents", "openingCashInBankCents", "active", "createdAt", "updatedAt") VALUES ('term-canonical', 'org-1', '2026-2027', 'FIRST_SEMESTER', 999, 999, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "TransactionCategory" ("id", "name", "type", "reportBucket", "active", "updatedAt") VALUES ('cat-1', 'Fictional Supplies', 'EXPENSE', 'Supplies', 1, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "fullName", "username", "passwordHash", "role", "organizationId", "active", "mustChangePassword", "updatedAt") VALUES ('user-1', 'Fictional Treasurer', 'fictional_treasurer', 'hash', 'TREASURER', 'org-1', 1, 0, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "Transaction" ("id", "organizationId", "termId", "type", "transactionDate", "amountCents", "cashAccount", "categoryId", "counterpartyName", "description", "referenceDescription", "recordedByUserId", "createdAt", "updatedAt") VALUES ('tx-1', 'org-1', 'term-canonical', 'EXPENSE', '2026-08-01T00:00:00.000Z', 500, 'CASH_ON_HAND', 'cat-1', 'Fictional Supplier', 'Fictional Purchase', 'Ref 123', 'user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "Attachment" ("id", "transactionId", "uploadedById", "originalName", "storedName", "storagePath", "mimeType", "sizeBytes") VALUES ('att-1', 'tx-1', 'user-1', 'receipt.png', 'stored-receipt-123.png', '/legacy/absolute/path/stored-receipt-123.png', 'image/png', 1024)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "Attachment" ("id", "transactionId", "uploadedById", "originalName", "storedName", "storagePath", "mimeType", "sizeBytes") VALUES ('att-2', 'tx-1', 'user-1', 'legacy-receipt.pdf', '', '/legacy/absolute/path/legacy-receipt.pdf', 'application/pdf', 2048)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "Attachment" ("id", "transactionId", "uploadedById", "originalName", "storedName", "storagePath", "mimeType", "sizeBytes") VALUES ('att-3', 'tx-1', 'user-1', 'duplicate.png', 'stored-receipt-123.png', '/legacy/absolute/path/stored-receipt-123.png', 'image/png', 1024)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "Report" ("id", "organizationId", "termId", "generatedById", "type", "title", "filtersJson", "createdAt", "updatedAt") VALUES ('rep-1', 'org-1', 'term-canonical', 'user-1', 'SUMMARY', 'Fictional Report', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "AuditLog" ("id", "userId", "organizationId", "role", "action", "entityType", "entityId", "metadataJson", "createdAt") VALUES ('audit-legacy', 'user-1', 'org-1', 'TREASURER', 'ADDED_EXPENSE', 'Transaction', 'tx-1', '{"actorUsername":"fictional_treasurer","actorFullName":"Fictional Treasurer","actorRole":"TREASURER","organizationNameSnapshot":"Fictional Organization"}', CURRENT_TIMESTAMP)`
    );
  } finally {
    await legacyPrisma.$disconnect();
  }

  const hardenedSchemaPath = prepareMigrationFixture("hardened", HARDENED_MIGRATIONS);
  deployMigrations(hardenedSchemaPath, dbUrl, uploadsRoot);

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const fkCheck = await prisma.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check;");
    assert.equal(fkCheck.length, 0, "PRAGMA foreign_key_check must return 0 rows");

    const migrations = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      `SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL ORDER BY "migration_name"`
    );
    assert.deepEqual(
      migrations.map((row) => row.migration_name),
      [...HARDENED_MIGRATIONS].sort()
    );

    const catRead = await prisma.transactionCategory.findUnique({ where: { id: "cat-1" } });
    assert.equal(catRead?.reportBucket, "SUPPLIES");

    const terms = await prisma.academicTerm.findMany({ where: { organizationId: "org-1" } });
    assert.equal(terms.length, 1);
    assert.equal(terms[0].id, "term-old");
    assert.equal(terms[0].academicYear, "2026-2027");
    assert.equal(terms[0].active, true);
    assert.equal(terms[0].version, 1);

    const transaction = await prisma.transaction.findUnique({ where: { id: "tx-1" } });
    assert.equal(transaction?.termId, "term-old");

    const attachment = await prisma.attachment.findUnique({ where: { id: "att-1" } });
    assert.equal(attachment?.storageKey, "stored-receipt-123.png");
    assert.equal(attachment?.transactionId, "tx-1");
    const legacyAttachment = await prisma.attachment.findUnique({ where: { id: "att-2" } });
    assert.equal(legacyAttachment?.storageKey, "legacy-receipt.pdf");
    assert.equal(legacyAttachment?.storageKey.includes("/"), false);
    const duplicateAttachment = await prisma.attachment.findUnique({ where: { id: "att-3" } });
    assert.equal(duplicateAttachment?.storageKey, "stored-receipt-123.png-dup-att-3");

    // Every migrated attachment row must resolve to an existing, readable
    // physical file whose hash matches the preflight-copied content.
    const attachments = await prisma.attachment.findMany();
    assert.equal(attachments.length, 3);
    for (const attachment of attachments) {
      const filePath = path.join(uploadsRoot, attachment.storageKey);
      assert.ok(fs.existsSync(filePath), `storageKey must resolve to an existing file: ${attachment.storageKey}`);
      const stat = fs.statSync(filePath);
      assert.ok(stat.isFile() && stat.size > 0, `storageKey file must be readable: ${attachment.storageKey}`);
    }
    assert.equal(
      crypto.createHash("sha256").update(fs.readFileSync(path.join(uploadsRoot, "stored-receipt-123.png"))).digest("hex"),
      sharedPngHash,
      "Surviving duplicate file must be byte-identical to the legacy source"
    );
    assert.equal(
      crypto.createHash("sha256").update(fs.readFileSync(path.join(uploadsRoot, "stored-receipt-123.png-dup-att-3"))).digest("hex"),
      sharedPngHash,
      "Copied duplicate file must be byte-identical to the legacy source"
    );
    assert.equal(
      crypto.createHash("sha256").update(fs.readFileSync(path.join(uploadsRoot, "legacy-receipt.pdf"))).digest("hex"),
      legacyPdfHash,
      "Non-duplicate legacy file must remain byte-identical"
    );

    // The preflight sidecar records the exact attachment ID -> new storage key
    // mapping used by the migration.
    const sidecarPath = path.join(uploadsRoot, ".attachment-storage-key-migration.json");
    assert.ok(fs.existsSync(sidecarPath), "Preflight sidecar mapping must exist");
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
    const att3Mapping = sidecar.mappings.find((m: { attachmentId: string }) => m.attachmentId === "att-3");
    assert.equal(att3Mapping?.oldStorageKey, "stored-receipt-123.png");
    assert.equal(att3Mapping?.newStorageKey, "stored-receipt-123.png-dup-att-3");
    assert.equal(att3Mapping?.sizeBytes, sharedPngContent.length);

    // Deletion regression: removing a deduplicated row must leave the surviving
    // row that owns the original basename intact, and must not collide with the
    // unique storage key index.
    await prisma.attachment.delete({ where: { id: "att-3" } });
    const survivingAttachment = await prisma.attachment.findUnique({ where: { id: "att-1" } });
    assert.equal(survivingAttachment?.storageKey, "stored-receipt-123.png");
    assert.equal(await prisma.attachment.count(), 2, "att-1 and att-2 must survive the deletion of the duplicate");
    await prisma.attachment.delete({ where: { id: "att-1" } });
    const legacyAttachmentAfterDelete = await prisma.attachment.findUnique({ where: { id: "att-2" } });
    assert.equal(legacyAttachmentAfterDelete?.storageKey, "legacy-receipt.pdf");
    assert.equal(await prisma.attachment.count(), 1);

    const legacyAudit = await prisma.auditLog.findUnique({ where: { id: "audit-legacy" } });
    assert.equal(legacyAudit?.actorUsernameSnapshot, "fictional_treasurer");
    assert.equal(legacyAudit?.actorFullNameSnapshot, "Fictional Treasurer");
    assert.equal(legacyAudit?.actorRoleSnapshot, "TREASURER");
    assert.equal(legacyAudit?.organizationNameSnapshot, "Fictional Organization");

    const archive = await prisma.$queryRawUnsafe<Array<{ termId: string | null; snapshotDataJson: string }>>(
      `SELECT "termId", "snapshotDataJson" FROM "_LegacyReportArchive" WHERE "id" = 'rep-1'`
    );
    assert.equal(archive[0].termId, "term-old");
    assert.equal(archive[0].snapshotDataJson, "{}");
    const reportTable = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT "name" FROM sqlite_master WHERE type = 'table' AND name = 'Report'`
    );
    assert.equal(reportTable.length, 0);

    const indexes = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT "name" FROM sqlite_master WHERE type = 'index'`
    );
    const indexNames = new Set(indexes.map((index) => index.name));
    assert.ok(indexNames.has("AcademicTerm_organizationId_active_unique"));
    assert.ok(indexNames.has("Transaction_organizationId_termId_type_idx"));
    assert.ok(indexNames.has("Attachment_storageKey_key"));

    await assert.rejects(async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Transaction" ("id", "organizationId", "termId", "type", "transactionDate", "amountCents", "cashAccount", "categoryId", "description", "referenceDescription", "recordedByUserId", "updatedAt") VALUES ('tx-bad', 'org-1', 'term-old', 'EXPENSE', '2026-08-01', -100, 'CASH_ON_HAND', 'cat-1', 'Bad', 'Ref', 'user-1', CURRENT_TIMESTAMP)`
      );
    }, /CHECK constraint failed/i);

    await assert.rejects(async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Attachment" ("id", "uploadedById", "originalName", "storageKey", "mimeType", "sizeBytes") VALUES ('att-bad', 'user-1', 'bad.png', 'bad.png', 'image/png', 100)`
      );
    }, /CHECK constraint failed/i);

    const auditLog = await prisma.auditLog.create({
      data: {
        userId: "user-1",
        organizationId: "org-1",
        role: "TREASURER",
        action: "ADDED_EXPENSE",
        entityType: "Transaction",
        entityId: "tx-1",
      },
    });

    await assert.rejects(async () => {
      await prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET "entityType" = 'Hacked' WHERE "id" = '${auditLog.id}'`);
    }, /AuditLog entries are immutable|AuditLog rows are immutable/i);

    await assert.rejects(async () => {
      await prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "id" = '${auditLog.id}'`);
    }, /AuditLog entries are immutable|AuditLog rows are immutable/i);
  } finally {
    await prisma.$disconnect();
    cleanupTempDir();
  }
});

async function buildLegacyFixture(
  name: string,
  files: Record<string, Buffer>,
  attachmentRows: Array<{ id: string; storedName: string; storagePath: string }>
): Promise<{ dbUrl: string; uploadsRoot: string; schemaPath: string }> {
  cleanupTempDir();
  fs.mkdirSync(TEMP_MIGRATION_DIR, { recursive: true });
  const dbPath = path.join(TEMP_MIGRATION_DIR, `${name}.db`);
  const dbUrl = `file:${dbPath}`;
  const uploadsRoot = path.join(TEMP_MIGRATION_DIR, `${name}-uploads`);
  fs.mkdirSync(uploadsRoot, { recursive: true });
  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(uploadsRoot, fileName), content);
  }

  const phase7SchemaPath = prepareMigrationFixture(`phase7-${name}`, PHASE_7_MIGRATIONS);
  fs.writeFileSync(dbPath, Buffer.alloc(0));
  deployMigrations(phase7SchemaPath, dbUrl, uploadsRoot);

  const legacyPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "Organization" ("id", "name", "slug", "active", "updatedAt") VALUES ('org-1', 'Fictional Organization', 'fictional-organization', 1, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "AcademicTerm" ("id", "organizationId", "academicYear", "semester", "openingCashOnHandCents", "openingCashInBankCents", "active", "createdAt", "updatedAt") VALUES ('term-canonical', 'org-1', '2026-2027', 'FIRST_SEMESTER', 999, 999, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "TransactionCategory" ("id", "name", "type", "reportBucket", "active", "updatedAt") VALUES ('cat-1', 'Fictional Supplies', 'EXPENSE', 'Supplies', 1, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "fullName", "username", "passwordHash", "role", "organizationId", "active", "mustChangePassword", "updatedAt") VALUES ('user-1', 'Fictional Treasurer', 'fictional_treasurer', 'hash', 'TREASURER', 'org-1', 1, 0, CURRENT_TIMESTAMP)`
    );
    await legacyPrisma.$executeRawUnsafe(
      `INSERT INTO "Transaction" ("id", "organizationId", "termId", "type", "transactionDate", "amountCents", "cashAccount", "categoryId", "counterpartyName", "description", "referenceDescription", "recordedByUserId", "createdAt", "updatedAt") VALUES ('tx-1', 'org-1', 'term-canonical', 'EXPENSE', '2026-08-01T00:00:00.000Z', 500, 'CASH_ON_HAND', 'cat-1', 'Fictional Supplier', 'Fictional Purchase', 'Ref 123', 'user-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
    for (const row of attachmentRows) {
      await legacyPrisma.$executeRawUnsafe(
        `INSERT INTO "Attachment" ("id", "transactionId", "uploadedById", "originalName", "storedName", "storagePath", "mimeType", "sizeBytes") VALUES ('${row.id}', 'tx-1', 'user-1', '${row.id}.png', '${row.storedName}', '${row.storagePath}', 'image/png', 1024)`
      );
    }
  } finally {
    await legacyPrisma.$disconnect();
  }
  return { dbUrl, uploadsRoot, schemaPath: phase7SchemaPath };
}

const PNG_CONTENT = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);

test("Migration Orchestrator: legacy migration runs preflight and migrates duplicates", async () => {
  const fixture = await buildLegacyFixture("orchestrator-legacy", {
    "stored-receipt-123.png": PNG_CONTENT,
  }, [
    { id: "att-1", storedName: "stored-receipt-123.png", storagePath: "/legacy/a/stored-receipt-123.png" },
    { id: "att-2", storedName: "stored-receipt-123.png", storagePath: "/legacy/a/stored-receipt-123.png" },
  ]);
  const hardenedSchemaPath = prepareMigrationFixture("orchestrator-legacy-hardened", HARDENED_MIGRATIONS);
  try {
    runOrchestrator(fixture.dbUrl, fixture.uploadsRoot, hardenedSchemaPath);

    const prisma = new PrismaClient({ datasources: { db: { url: fixture.dbUrl } } });
    try {
      const attachments = await prisma.attachment.findMany();
      assert.equal(attachments.length, 2);
      const att1 = attachments.find((a) => a.id === "att-1");
      const att2 = attachments.find((a) => a.id === "att-2");
      assert.equal(att1?.storageKey, "stored-receipt-123.png");
      assert.equal(att2?.storageKey, "stored-receipt-123.png-dup-att-2");
      for (const attachment of attachments) {
        const filePath = path.join(fixture.uploadsRoot, attachment.storageKey);
        assert.ok(fs.existsSync(filePath), `storageKey must resolve: ${attachment.storageKey}`);
        assert.ok(fs.statSync(filePath).size > 0, "file must be readable");
      }
      const sidecar = JSON.parse(
        fs.readFileSync(path.join(fixture.uploadsRoot, ".attachment-storage-key-migration.json"), "utf8")
      );
      assert.equal(sidecar.mappings[0].provenance, "CREATED_BY_RUN");
      assert.equal(sidecar.mappings[0].newStorageKey, "stored-receipt-123.png-dup-att-2");
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    cleanupTempDir();
  }
});

test("Migration Orchestrator: rerun after the hardening migration is a safe no-op", async () => {
  const fixture = await buildLegacyFixture("orchestrator-rerun", {
    "stored-receipt-123.png": PNG_CONTENT,
  }, [
    { id: "att-1", storedName: "stored-receipt-123.png", storagePath: "/legacy/a/stored-receipt-123.png" },
    { id: "att-2", storedName: "stored-receipt-123.png", storagePath: "/legacy/a/stored-receipt-123.png" },
  ]);
  const hardenedSchemaPath = prepareMigrationFixture("orchestrator-rerun-hardened", HARDENED_MIGRATIONS);
  try {
    runOrchestrator(fixture.dbUrl, fixture.uploadsRoot, hardenedSchemaPath);
    const dupFile = path.join(fixture.uploadsRoot, "stored-receipt-123.png-dup-att-2");
    assert.ok(fs.existsSync(dupFile));
    const hashBefore = crypto.createHash("sha256").update(fs.readFileSync(dupFile)).digest("hex");

    // Rerun: preflight must no-op (no legacy columns) and deploy must find no pending migrations.
    const output = runOrchestrator(fixture.dbUrl, fixture.uploadsRoot, hardenedSchemaPath);
    assert.ok(output.includes("skipping storage-key preflight"), "Rerun must skip the preflight");

    const prisma = new PrismaClient({ datasources: { db: { url: fixture.dbUrl } } });
    try {
      assert.equal(await prisma.attachment.count(), 2, "Rerun must not duplicate rows");
    } finally {
      await prisma.$disconnect();
    }
    assert.equal(fs.existsSync(dupFile), true, "Rerun must not delete the migrated duplicate file");
    assert.equal(
      crypto.createHash("sha256").update(fs.readFileSync(dupFile)).digest("hex"),
      hashBefore,
      "Rerun must not alter the migrated file"
    );
  } finally {
    cleanupTempDir();
  }
});

test("Migration Orchestrator: identical pre-existing destination is adopted without overwrite", async () => {
  const fixture = await buildLegacyFixture("orchestrator-preexisting-identical", {
    "stored-receipt-123.png": PNG_CONTENT,
  }, [
    { id: "att-1", storedName: "stored-receipt-123.png", storagePath: "/legacy/a/stored-receipt-123.png" },
    { id: "att-2", storedName: "stored-receipt-123.png", storagePath: "/legacy/a/stored-receipt-123.png" },
  ]);
  // Pre-create the destination with IDENTICAL content.
  const dupFile = path.join(fixture.uploadsRoot, "stored-receipt-123.png-dup-att-2");
  fs.writeFileSync(dupFile, PNG_CONTENT);
  const originalMtime = fs.statSync(dupFile).mtimeMs;

  const hardenedSchemaPath = prepareMigrationFixture("orchestrator-preexisting-hardened", HARDENED_MIGRATIONS);
  try {
    runOrchestrator(fixture.dbUrl, fixture.uploadsRoot, hardenedSchemaPath);

    const sidecar = JSON.parse(
      fs.readFileSync(path.join(fixture.uploadsRoot, ".attachment-storage-key-migration.json"), "utf8")
    );
    assert.equal(sidecar.mappings[0].provenance, "PREEXISTING", "Identical destination must be marked PREEXISTING");
    assert.equal(
      crypto.createHash("sha256").update(fs.readFileSync(dupFile)).digest("hex"),
      crypto.createHash("sha256").update(PNG_CONTENT).digest("hex"),
      "Destination content must be untouched"
    );
    assert.ok(fs.statSync(dupFile).mtimeMs >= originalMtime, "Destination must not be rewritten");

    const prisma = new PrismaClient({ datasources: { db: { url: fixture.dbUrl } } });
    try {
      const att2 = await prisma.attachment.findUnique({ where: { id: "att-2" } });
      assert.equal(att2?.storageKey, "stored-receipt-123.png-dup-att-2");
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    cleanupTempDir();
  }
});

test("Migration Orchestrator: conflicting pre-existing destination aborts without overwrite", async () => {
  const fixture = await buildLegacyFixture("orchestrator-preexisting-conflict", {
    "stored-receipt-123.png": PNG_CONTENT,
  }, [
    { id: "att-1", storedName: "stored-receipt-123.png", storagePath: "/legacy/a/stored-receipt-123.png" },
    { id: "att-2", storedName: "stored-receipt-123.png", storagePath: "/legacy/a/stored-receipt-123.png" },
  ]);
  // Pre-create the destination with DIFFERENT content.
  const conflictingContent = Buffer.from("CONFLICTING-USER-CONTENT");
  const dupFile = path.join(fixture.uploadsRoot, "stored-receipt-123.png-dup-att-2");
  fs.writeFileSync(dupFile, conflictingContent);

  const hardenedSchemaPath = prepareMigrationFixture("orchestrator-conflict-hardened", HARDENED_MIGRATIONS);
  try {
    assert.throws(
      () => runOrchestrator(fixture.dbUrl, fixture.uploadsRoot, hardenedSchemaPath),
      /Conflicting pre-existing destination/
    );
    // The conflicting file must remain untouched.
    assert.deepEqual(fs.readFileSync(dupFile), conflictingContent, "Conflicting destination must be retained");

    const prisma = new PrismaClient({ datasources: { db: { url: fixture.dbUrl } } });
    try {
      const migrationCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`
      );
      assert.equal(Number(migrationCount[0].count), PHASE_7_MIGRATIONS.length, "Hardening migration must not run");
    } finally {
      await prisma.$disconnect();
    }
    // Preflight failure must not leave a sidecar or partial copies.
    assert.equal(fs.existsSync(path.join(fixture.uploadsRoot, ".attachment-storage-key-migration.json")), false);
  } finally {
    cleanupTempDir();
  }
});

test("Migration Orchestrator: failed migration rolls back CREATED_BY_RUN and retains pre-existing files", async () => {
  const fixture = await buildLegacyFixture("orchestrator-rollback", {
    "shared.png": PNG_CONTENT,
  }, [
    { id: "att-1", storedName: "shared.png", storagePath: "/legacy/a/shared.png" },
    { id: "att-2", storedName: "shared.png", storagePath: "/legacy/a/shared.png" },
    { id: "att-3", storedName: "shared.png", storagePath: "/legacy/a/shared.png" },
  ]);
  // att-2's destination pre-exists with identical content; att-3's is created by the run.
  const preexistingFile = path.join(fixture.uploadsRoot, "shared.png-dup-att-2");
  fs.writeFileSync(preexistingFile, PNG_CONTENT);

  // Fixture whose hardening migrations include a deliberately failing migration
  // that sorts BEFORE the storage-keys migration, so the storage migration never
  // applies and the database stays in its legacy state after rollback.
  const failingSchemaPath = prepareMigrationFixture("orchestrator-rollback-hardened", HARDENED_MIGRATIONS);
  const badMigrationDir = path.join(TEMP_MIGRATION_DIR, "orchestrator-rollback-hardened", "migrations", "20260731999999_force_failure");
  fs.mkdirSync(badMigrationDir, { recursive: true });
  fs.writeFileSync(path.join(badMigrationDir, "migration.sql"), "THIS IS NOT VALID SQL;");

  try {
    assert.throws(
      () => runOrchestrator(fixture.dbUrl, fixture.uploadsRoot, failingSchemaPath),
      /ERROR|error|failed/i
    );

    // CREATED_BY_RUN file (att-3) must be rolled back; PREEXISTING file (att-2) must remain.
    assert.equal(fs.existsSync(path.join(fixture.uploadsRoot, "shared.png-dup-att-3")), false, "CREATED_BY_RUN file must be rolled back");
    assert.equal(fs.existsSync(preexistingFile), true, "PREEXISTING file must be retained");
    assert.deepEqual(fs.readFileSync(preexistingFile), PNG_CONTENT, "PREEXISTING file content must be untouched");
    const sidecarContent = JSON.parse(fs.readFileSync(path.join(fixture.uploadsRoot, ".attachment-storage-key-migration.json"), "utf8"));
    assert.equal(sidecarContent.state, "ROLLED_BACK", "Sidecar must be updated to ROLLED_BACK state after rollback");

    const prisma = new PrismaClient({ datasources: { db: { url: fixture.dbUrl } } });
    try {
      // 3 phase-7 migrations + enforce_financial_invariants applied; the
      // storage-keys migration must NOT have applied (it sorts after the failure).
      const migrationCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`
      );
      assert.equal(Number(migrationCount[0].count), 4, "Storage-keys migration must not be recorded as applied");
      const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("Attachment")`);
      const names = new Set(columns.map((column) => column.name));
      assert.ok(names.has("storedName"), "Attachment table must still be in its legacy shape");
      assert.ok(!names.has("storageKey"), "Attachment table must still be in its legacy shape");
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    cleanupTempDir();
  }
});

test("Migration Preflight: foreign MIGRATED sidecar throws error on DB identity mismatch", async () => {
  const uploadsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "preflight-foreign-"));
  const sidecarPath = path.join(uploadsRoot, ".attachment-storage-key-migration.json");
  fs.writeFileSync(
    sidecarPath,
    JSON.stringify({
      version: 1,
      dbIdentity: "/different/path/to/other.db",
      uploadsRoot,
      state: "MIGRATED",
      mappings: [],
    })
  );

  const { runPreflight } = await import("../../scripts/attachment-storage-preflight");
  await assert.rejects(
    () => runPreflight(null, uploadsRoot, "file:./local.db"),
    /Database identity mismatch/
  );

  fs.rmSync(uploadsRoot, { recursive: true, force: true });
});

test("Migration Preflight: PREPARED resume with missing destination throws error", async () => {
  const uploadsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "preflight-resume-"));
  const sidecarPath = path.join(uploadsRoot, ".attachment-storage-key-migration.json");
  const canonicalDb = path.resolve("./local.db");
  const canonicalRoot = path.resolve(uploadsRoot);

  fs.writeFileSync(
    sidecarPath,
    JSON.stringify({
      version: 1,
      dbIdentity: canonicalDb,
      uploadsRoot: canonicalRoot,
      state: "PREPARED",
      mappings: [
        { attachmentId: "att-1", oldStorageKey: "missing.png", newStorageKey: "missing.png-dup-att-1" },
      ],
    })
  );

  const { runPreflight: runPreflightResume } = await import("../../scripts/attachment-storage-preflight");
  await assert.rejects(
    () => runPreflightResume(null, uploadsRoot, "file:./local.db"),
    /Preflight resume failed: missing destination file/
  );

  fs.rmSync(uploadsRoot, { recursive: true, force: true });
});
