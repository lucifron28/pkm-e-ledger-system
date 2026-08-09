/*
  Migration: Enforce Financial, Academic Term, and Attachment Invariants
  Safely upgrades legacy Phase 7 databases.
*/

PRAGMA foreign_keys=OFF;
PRAGMA defer_foreign_keys=ON;

-- 1. Archive legacy Report table if present
CREATE TABLE IF NOT EXISTS "_LegacyReportArchive" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "termId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "snapshotDataJson" TEXT NOT NULL,
    "fileStoragePath" TEXT,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SQLite still compiles the source table in an INSERT ... SELECT when the
-- WHERE clause says the table exists. Create an empty compatibility table so
-- databases where Report was already removed can complete this migration.
CREATE TABLE IF NOT EXISTS "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "termId" TEXT,
    "generatedById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filtersJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "_LegacyReportArchive" ("id", "organizationId", "termId", "type", "title", "generatedById", "snapshotDataJson", "fileStoragePath", "fileMimeType", "fileSizeBytes", "createdAt")
SELECT "id", "organizationId", "termId", "type", "title", "generatedById", "filtersJson", NULL, NULL, NULL, "createdAt"
FROM "Report"
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='Report');

DROP INDEX IF EXISTS "Report_generatedById_idx";
DROP INDEX IF EXISTS "Report_termId_idx";
DROP INDEX IF EXISTS "Report_organizationId_type_idx";
DROP TABLE IF EXISTS "Report";

-- 2. Deduplicate multiple active academic terms per organization BEFORE creating unique index
-- Phase 7 AcademicTerm rows predate optimistic concurrency. Add the field
-- before the normalization projection reads it.
ALTER TABLE "AcademicTerm" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "AcademicTerm"
SET "active" = 0
WHERE ("active" = 1 OR "active" = true)
  AND "id" NOT IN (
    SELECT "id" FROM (
      SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "organizationId"
        ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
      ) as rn
      FROM "AcademicTerm"
      WHERE ("active" = 1 OR "active" = true)
    ) WHERE rn = 1
  );

-- 3. Academic-year normalization and conceptual term deduplication.
-- Repoint dependents and delete duplicate terms before changing the retained
-- row's unique academicYear value. Prefer the legacy A.Y. spelling when it
-- exists, so the retained row is deterministic and preserves its identity.
CREATE TEMP TABLE "_NormalizedTerm" AS
SELECT
  "id",
  "organizationId",
  "semester",
  "academicYear" AS "originalYear",
  TRIM(REPLACE(REPLACE(REPLACE(REPLACE("academicYear", 'A.Y. ', ''), 'AY ', ''), 'A.Y.', ''), 'AY', '')) AS "normYear",
  "active",
  "version",
  "updatedAt",
  "createdAt"
FROM "AcademicTerm";

CREATE TEMP TABLE "_CanonicalTermMap" AS
SELECT
  "id" AS "oldId",
  FIRST_VALUE("id") OVER (
    PARTITION BY "organizationId", "normYear", "semester"
    ORDER BY
      CASE WHEN "originalYear" LIKE 'A.Y.%' OR "originalYear" LIKE 'AY %' THEN 0 ELSE 1 END,
      "updatedAt" DESC,
      "createdAt" DESC,
      "id" DESC
  ) AS "canonicalId"
FROM "_NormalizedTerm";

-- Repoint transactions referencing non-canonical duplicate terms.
UPDATE "Transaction"
SET "termId" = (
  SELECT "canonicalId" FROM "_CanonicalTermMap" WHERE "_CanonicalTermMap"."oldId" = "Transaction"."termId"
)
WHERE "termId" IN (SELECT "oldId" FROM "_CanonicalTermMap" WHERE "oldId" <> "canonicalId");

-- Repoint cash transfers if any table exists.
CREATE TABLE IF NOT EXISTS "CashTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "transferDate" DATETIME NOT NULL,
    "fromAccount" TEXT NOT NULL,
    "toAccount" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "documentNumber" TEXT,
    "description" TEXT NOT NULL,
    "referenceDescription" TEXT NOT NULL,
    "eventActivityName" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "deletedByUserId" TEXT,
    "deleteReason" TEXT,
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

UPDATE "CashTransfer"
SET "termId" = (
  SELECT "canonicalId" FROM "_CanonicalTermMap" WHERE "_CanonicalTermMap"."oldId" = "CashTransfer"."termId"
)
WHERE "termId" IN (
  SELECT "oldId" FROM "_CanonicalTermMap" WHERE "oldId" <> "canonicalId"
);

UPDATE "_LegacyReportArchive"
SET "termId" = (
  SELECT "canonicalId" FROM "_CanonicalTermMap" WHERE "_CanonicalTermMap"."oldId" = "_LegacyReportArchive"."termId"
)
WHERE "termId" IN (
  SELECT "oldId" FROM "_CanonicalTermMap" WHERE "oldId" <> "canonicalId"
);

-- Preserve active selection on the canonical row before deleting duplicates.
UPDATE "AcademicTerm"
SET "active" = CASE WHEN EXISTS (
  SELECT 1
  FROM "_NormalizedTerm" n
  WHERE n."organizationId" = "AcademicTerm"."organizationId"
    AND n."semester" = "AcademicTerm"."semester"
    AND n."normYear" = (
      SELECT norm."normYear" FROM "_NormalizedTerm" norm WHERE norm."id" = "AcademicTerm"."id"
    )
    AND n."active" = 1
) THEN 1 ELSE "active" END
WHERE "id" IN (SELECT "canonicalId" FROM "_CanonicalTermMap");

-- Delete duplicate non-canonical terms before normalization.
DELETE FROM "AcademicTerm"
WHERE "id" IN (
  SELECT "oldId" FROM "_CanonicalTermMap" WHERE "oldId" <> "canonicalId"
);

UPDATE "AcademicTerm"
SET "academicYear" = (
  SELECT "normYear" FROM "_NormalizedTerm" WHERE "_NormalizedTerm"."id" = "AcademicTerm"."id"
)
WHERE "id" IN (SELECT "canonicalId" FROM "_CanonicalTermMap");

DROP TABLE "_CanonicalTermMap";
DROP TABLE "_NormalizedTerm";

-- 4. Create new AcademicTerm table with CHECK constraints
CREATE TABLE "new_AcademicTerm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "openingCashOnHandCents" INTEGER NOT NULL DEFAULT 0,
    "openingCashInBankCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AcademicTerm_opening_cash_on_hand_non_negative" CHECK ("openingCashOnHandCents" >= 0 AND "openingCashOnHandCents" <= 2147483647),
    CONSTRAINT "AcademicTerm_opening_cash_in_bank_non_negative" CHECK ("openingCashInBankCents" >= 0 AND "openingCashInBankCents" <= 2147483647),
    CONSTRAINT "AcademicTerm_version_positive" CHECK ("version" >= 1),
    CONSTRAINT "AcademicTerm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AcademicTerm" ("academicYear", "active", "createdAt", "id", "openingCashInBankCents", "openingCashOnHandCents", "organizationId", "semester", "updatedAt", "version")
SELECT "academicYear", "active", "createdAt", "id", "openingCashInBankCents", "openingCashOnHandCents", "organizationId", "semester", "updatedAt", "version" FROM "AcademicTerm";
DROP TABLE "AcademicTerm";
ALTER TABLE "new_AcademicTerm" RENAME TO "AcademicTerm";
CREATE INDEX "AcademicTerm_academicYear_semester_idx" ON "AcademicTerm"("academicYear", "semester");
CREATE UNIQUE INDEX "AcademicTerm_id_organizationId_key" ON "AcademicTerm"("id", "organizationId");
CREATE UNIQUE INDEX "AcademicTerm_organizationId_academicYear_semester_key" ON "AcademicTerm"("organizationId", "academicYear", "semester");

-- Create unique index for single active term per organization
CREATE UNIQUE INDEX IF NOT EXISTS "AcademicTerm_organizationId_active_unique"
ON "AcademicTerm"("organizationId")
WHERE "active" = 1;

-- 5. Create new TransactionCategory table with explicit reportBucket CASE conversion
CREATE TABLE "new_TransactionCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reportBucket" TEXT NOT NULL DEFAULT 'OTHERS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_TransactionCategory" ("id", "name", "type", "reportBucket", "active", "createdAt", "updatedAt")
SELECT
  "id",
  "name",
  "type",
  CASE "reportBucket"
    WHEN 'Supplies' THEN 'SUPPLIES'
    WHEN 'Equipment' THEN 'EQUIPMENT'
    WHEN 'Transportation' THEN 'TRANSPORTATION'
    WHEN 'Meals' THEN 'MEALS'
    WHEN 'Service' THEN 'SERVICE'
    WHEN 'Miscellaneous' THEN 'MISC'
    WHEN 'Misc' THEN 'MISC'
    WHEN 'Donation' THEN 'DONATION'
    WHEN 'Events' THEN 'OTHERS'
    WHEN 'Activities' THEN 'OTHERS'
    WHEN 'Others' THEN 'OTHERS'
    WHEN 'SUPPLIES' THEN 'SUPPLIES'
    WHEN 'EQUIPMENT' THEN 'EQUIPMENT'
    WHEN 'TRANSPORTATION' THEN 'TRANSPORTATION'
    WHEN 'MEALS' THEN 'MEALS'
    WHEN 'SERVICE' THEN 'SERVICE'
    WHEN 'MISC' THEN 'MISC'
    WHEN 'DONATION' THEN 'DONATION'
    WHEN 'OTHERS' THEN 'OTHERS'
    ELSE 'OTHERS'
  END AS "reportBucket",
  "active",
  "createdAt",
  "updatedAt"
FROM "TransactionCategory";

DROP TABLE "TransactionCategory";
ALTER TABLE "new_TransactionCategory" RENAME TO "TransactionCategory";
CREATE INDEX "TransactionCategory_type_reportBucket_idx" ON "TransactionCategory"("type", "reportBucket");
CREATE UNIQUE INDEX "TransactionCategory_name_type_key" ON "TransactionCategory"("name", "type");

-- 6. Create new Transaction table with CHECK constraints and composite FK
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "documentNumber" TEXT,
    "transactionDate" DATETIME NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "cashAccount" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "counterpartyName" TEXT,
    "description" TEXT NOT NULL,
    "referenceDescription" TEXT NOT NULL,
    "eventActivityName" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "deletedByUserId" TEXT,
    "deleteReason" TEXT,
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_amount_positive" CHECK ("amountCents" > 0 AND "amountCents" <= 2147483647),
    CONSTRAINT "Transaction_version_positive" CHECK ("version" >= 1),
    CONSTRAINT "Transaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_termId_organizationId_fkey" FOREIGN KEY ("termId", "organizationId") REFERENCES "AcademicTerm" ("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amountCents", "cashAccount", "categoryId", "counterpartyName", "createdAt", "deleteReason", "deletedAt", "deletedByUserId", "description", "documentNumber", "eventActivityName", "id", "organizationId", "recordedByUserId", "referenceDescription", "termId", "transactionDate", "type", "updatedAt", "updatedByUserId")
SELECT "amountCents", "cashAccount", "categoryId", "counterpartyName", "createdAt", "deleteReason", "deletedAt", "deletedByUserId", "description", "documentNumber", "eventActivityName", "id", "organizationId", "recordedByUserId", "referenceDescription", "termId", "transactionDate", "type", "updatedAt", "updatedByUserId" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_organizationId_termId_type_idx" ON "Transaction"("organizationId", "termId", "type");
CREATE INDEX "Transaction_transactionDate_idx" ON "Transaction"("transactionDate");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_deletedAt_idx" ON "Transaction"("deletedAt");

-- 7. Create new CashTransfer table with CHECK constraints and composite FK
CREATE TABLE "new_CashTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "transferDate" DATETIME NOT NULL,
    "fromAccount" TEXT NOT NULL,
    "toAccount" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "documentNumber" TEXT,
    "description" TEXT NOT NULL,
    "referenceDescription" TEXT NOT NULL,
    "eventActivityName" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "deletedByUserId" TEXT,
    "deleteReason" TEXT,
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CashTransfer_amount_positive" CHECK ("amountCents" > 0 AND "amountCents" <= 2147483647),
    CONSTRAINT "CashTransfer_distinct_accounts" CHECK ("fromAccount" <> "toAccount"),
    CONSTRAINT "CashTransfer_version_positive" CHECK ("version" >= 1),
    CONSTRAINT "CashTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashTransfer_termId_organizationId_fkey" FOREIGN KEY ("termId", "organizationId") REFERENCES "AcademicTerm" ("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashTransfer_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashTransfer_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CashTransfer_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CashTransfer" ("amountCents", "createdAt", "deleteReason", "deletedAt", "deletedByUserId", "description", "documentNumber", "eventActivityName", "fromAccount", "id", "idempotencyKey", "organizationId", "recordedByUserId", "referenceDescription", "termId", "toAccount", "transferDate", "updatedAt", "updatedByUserId", "version")
SELECT "amountCents", "createdAt", "deleteReason", "deletedAt", "deletedByUserId", "description", "documentNumber", "eventActivityName", "fromAccount", "id", "idempotencyKey", "organizationId", "recordedByUserId", "referenceDescription", "termId", "toAccount", "transferDate", "updatedAt", "updatedByUserId", "version" FROM "CashTransfer";
DROP TABLE "CashTransfer";
ALTER TABLE "new_CashTransfer" RENAME TO "CashTransfer";
CREATE INDEX "CashTransfer_organizationId_termId_idx" ON "CashTransfer"("organizationId", "termId");
CREATE INDEX "CashTransfer_transferDate_idx" ON "CashTransfer"("transferDate");
CREATE INDEX "CashTransfer_deletedAt_idx" ON "CashTransfer"("deletedAt");

-- 8. Create new Attachment table with XOR owner constraint & relative storagePath update
-- Normalize storagePath in existing records to relative key (storedName)
-- Phase 7 attachments were transaction-only. Add optional transfer ownership
-- before rebuilding the table with the XOR constraint.
ALTER TABLE "Attachment" ADD COLUMN "cashTransferId" TEXT;

UPDATE "Attachment"
SET "storagePath" = "storedName"
WHERE "storedName" IS NOT NULL
  AND TRIM("storedName") <> ''
  AND ("storagePath" LIKE '/%' OR "storagePath" LIKE '%\%');

CREATE TABLE "new_Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT,
    "cashTransferId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_owner_xor" CHECK (("transactionId" IS NOT NULL AND "cashTransferId" IS NULL) OR ("transactionId" IS NULL AND "cashTransferId" IS NOT NULL)),
    CONSTRAINT "Attachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_cashTransferId_fkey" FOREIGN KEY ("cashTransferId") REFERENCES "CashTransfer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Attachment" ("createdAt", "id", "mimeType", "originalName", "sizeBytes", "storagePath", "storedName", "transactionId", "uploadedById")
SELECT "createdAt", "id", "mimeType", "originalName", "sizeBytes", "storagePath", "storedName", "transactionId", "uploadedById" FROM "Attachment";
DROP TABLE "Attachment";
ALTER TABLE "new_Attachment" RENAME TO "Attachment";
CREATE INDEX "Attachment_transactionId_idx" ON "Attachment"("transactionId");
CREATE INDEX "Attachment_cashTransferId_idx" ON "Attachment"("cashTransferId");
CREATE INDEX "Attachment_uploadedById_idx" ON "Attachment"("uploadedById");

-- 9. Create CommandReceipt table
CREATE TABLE IF NOT EXISTS "CommandReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultEntityType" TEXT,
    "resultEntityId" TEXT,
    "responseJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "CommandReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommandReceipt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CommandReceipt_organizationId_commandType_idx" ON "CommandReceipt"("organizationId", "commandType");
CREATE UNIQUE INDEX IF NOT EXISTS "CommandReceipt_actorUserId_idempotencyKey_key" ON "CommandReceipt"("actorUserId", "idempotencyKey");

-- 10. Immutable AuditLog Triggers
CREATE TRIGGER IF NOT EXISTS "AuditLog_prevent_update"
BEFORE UPDATE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'AuditLog entries are immutable and cannot be updated.');
END;

CREATE TRIGGER IF NOT EXISTS "AuditLog_prevent_delete"
BEFORE DELETE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'AuditLog entries are immutable and cannot be deleted.');
END;

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
PRAGMA foreign_key_check;
