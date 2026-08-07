/* Replace legacy attachment path columns with one relative storage key. */
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT,
    "cashTransferId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_owner_xor" CHECK (("transactionId" IS NOT NULL AND "cashTransferId" IS NULL) OR ("transactionId" IS NULL AND "cashTransferId" IS NOT NULL)),
    CONSTRAINT "Attachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_cashTransferId_fkey" FOREIGN KEY ("cashTransferId") REFERENCES "CashTransfer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- The preflight utility (scripts/attachment-storage-preflight.js) MUST run
-- before this migration. It detects duplicate normalized legacy storage keys
-- and copies each duplicated physical file to its deterministic unique
-- relative key (`<basename>-dup-<attachmentId>`), verifying hash and byte
-- length after the copy. The ranking below derives the exact same key the
-- preflight used, so every migrated storageKey references a real file that
-- exists on disk. If the preflight detects a duplicate whose physical file is
-- missing, it aborts before the migration runs - the database is never pointed
-- at a nonexistent file.
WITH RECURSIVE attachment_path("id", "rest", "segment") AS (
    SELECT
        "id",
        replace(
            CASE
              WHEN "storedName" IS NOT NULL AND TRIM("storedName") <> '' THEN "storedName"
              ELSE COALESCE("storagePath", '')
            END,
            char(92),
            '/'
        ),
        ''
    FROM "Attachment"
    UNION ALL
    SELECT
        "id",
        CASE WHEN instr("rest", '/') = 0 THEN '' ELSE substr("rest", instr("rest", '/') + 1) END,
        CASE WHEN instr("rest", '/') = 0 THEN "rest" ELSE substr("rest", 1, instr("rest", '/') - 1) END
    FROM attachment_path
    WHERE "rest" <> ''
), attachment_raw_key("id", "raw_key") AS (
    SELECT a."id", COALESCE(NULLIF(p."segment", ''), 'legacy-' || a."id")
    FROM "Attachment" a
    LEFT JOIN (SELECT "id", "segment" FROM attachment_path WHERE "rest" = '') p ON p."id" = a."id"
), attachment_ranked AS (
    SELECT
        a."id",
        rk."raw_key",
        ROW_NUMBER() OVER (PARTITION BY rk."raw_key" ORDER BY a."createdAt" ASC, a."id" ASC) AS "rn"
    FROM "Attachment" a
    JOIN attachment_raw_key rk ON rk."id" = a."id"
)
INSERT INTO "new_Attachment" ("id", "transactionId", "cashTransferId", "uploadedById", "originalName", "storageKey", "mimeType", "sizeBytes", "createdAt")
SELECT a."id", a."transactionId", a."cashTransferId", a."uploadedById", a."originalName",
       CASE
         WHEN r."rn" = 1 THEN r."raw_key"
         ELSE r."raw_key" || '-dup-' || a."id"
       END,
       a."mimeType", a."sizeBytes", a."createdAt"
FROM "Attachment" a
JOIN attachment_ranked r ON r."id" = a."id";

DROP TABLE "Attachment";
ALTER TABLE "new_Attachment" RENAME TO "Attachment";
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_transactionId_idx" ON "Attachment"("transactionId");
CREATE INDEX "Attachment_cashTransferId_idx" ON "Attachment"("cashTransferId");
CREATE INDEX "Attachment_uploadedById_idx" ON "Attachment"("uploadedById");

ALTER TABLE "CommandReceipt" ADD COLUMN "claimToken" TEXT;
ALTER TABLE "CommandReceipt" ADD COLUMN "leaseExpiresAt" DATETIME;
CREATE INDEX "CommandReceipt_status_createdAt_idx" ON "CommandReceipt"("status", "createdAt");
CREATE INDEX "CommandReceipt_status_leaseExpiresAt_idx" ON "CommandReceipt"("status", "leaseExpiresAt");

ALTER TABLE "AuditLog" ADD COLUMN "actorUsernameSnapshot" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "actorFullNameSnapshot" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "actorRoleSnapshot" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "organizationNameSnapshot" TEXT;

-- Existing releases used different trigger names. Temporarily remove every
-- known immutability trigger so legacy snapshot values can be backfilled.
DROP TRIGGER IF EXISTS "AuditLog_no_update";
DROP TRIGGER IF EXISTS "AuditLog_no_delete";
DROP TRIGGER IF EXISTS "AuditLog_prevent_update";
DROP TRIGGER IF EXISTS "AuditLog_prevent_delete";

UPDATE "AuditLog"
SET
  "actorUsernameSnapshot" = json_extract("metadataJson", '$.actorUsername'),
  "actorFullNameSnapshot" = json_extract("metadataJson", '$.actorFullName'),
  "actorRoleSnapshot" = json_extract("metadataJson", '$.actorRole'),
  "organizationNameSnapshot" = json_extract("metadataJson", '$.organizationNameSnapshot')
WHERE "metadataJson" IS NOT NULL;

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
PRAGMA foreign_key_check;
