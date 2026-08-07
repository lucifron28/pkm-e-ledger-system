/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Attachment storage-key migration preflight.
 *
 * Normally invoked by the migration orchestrator (`scripts/migrate.js`, wired
 * to `npm run db:migrate` / `npm run db:migrate:deploy`) BEFORE `prisma migrate`
 * applies 20260801000000_storage_keys_and_audit_snapshots.
 *
 * The migration derives each new storage key deterministically:
 *   - the oldest row (earliest createdAt, then smallest id) keeps the
 *     normalized legacy key;
 *   - every later duplicate gets `<basename>-dup-<attachmentId>`.
 *
 * This preflight makes those keys SAFE by physically copying each duplicated
 * file to the exact deterministic key BEFORE the migration runs, verifying
 * hash and byte length after the copy, and recording the attachment ID ->
 * new storage key mapping in a sidecar JSON record for auditability. Each
 * destination is tracked as CREATED_BY_RUN or PREEXISTING:
 *   - a missing destination is copied and marked CREATED_BY_RUN;
 *   - an existing destination with identical content is adopted as PREEXISTING
 *     and never overwritten;
 *   - an existing destination with different content aborts the preflight.
 * Rollback (`--rollback`) deletes only CREATED_BY_RUN files and retains every
 * pre-existing file.
 *
 * If a duplicated row has no corresponding physical file, the preflight
 * aborts (exit 1) and lists the affected attachment IDs and basenames, so the
 * database is never pointed at a nonexistent file.
 *
 * Usage (standalone):
 *   node scripts/attachment-storage-preflight.js --db-url file:./prisma/dev.db [--uploads-root ./uploads]
 *   node scripts/attachment-storage-preflight.js --rollback --db-url file:./prisma/dev.db [--uploads-root ./uploads]
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const SIDECAR_NAME = ".attachment-storage-key-migration.json";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    let key;
    let value;
    if (eq !== -1) {
      key = arg.slice(2, eq);
      value = arg.slice(eq + 1);
    } else {
      key = arg.slice(2);
      value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
      if (value !== undefined) i++;
    }
    args[key] = value !== undefined ? value : true;
  }
  return args;
}

function getCanonicalDbIdentity(dbUrl) {
  if (!dbUrl) return "";
  let raw = dbUrl.replace(/^file:/, "");
  const qIdx = raw.indexOf("?");
  if (qIdx !== -1) raw = raw.slice(0, qIdx);
  return path.resolve(raw);
}

function getCanonicalUploadsRoot(uploadsRoot) {
  return path.resolve(uploadsRoot);
}

function normalizeLegacyKey(row) {
  const storedName = (row.storedName || "").trim();
  const storagePath = (row.storagePath || "").trim();
  const raw = (storedName || storagePath || "").replace(/\\/g, "/");
  const segment = raw.split("/").filter(Boolean).pop() || "";
  return segment || `legacy-${row.id}`;
}

/** Mirrors the migration SQL ranking: earliest createdAt, then smallest id. */
function compareLegacyRows(a, b) {
  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (aTime !== bTime) return aTime - bTime;
  return a.id.localeCompare(b.id);
}

function sha256Of(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function validateSidecar(sidecar, canonicalDb, canonicalRoot, migrationTarget) {
  if (!sidecar || typeof sidecar !== "object") {
    throw new Error("Sidecar validation failed: sidecar object missing or invalid.");
  }
  if (![1, 2, 3].includes(sidecar.version)) {
    throw new Error(`Sidecar validation failed: unsupported version ${sidecar.version}.`);
  }
  if (typeof sidecar.runId !== "string" || !sidecar.runId.trim()) {
    throw new Error("Sidecar validation failed: runId is required.");
  }
  if (!sidecar.dbIdentity || (canonicalDb && sidecar.dbIdentity !== canonicalDb)) {
    throw new Error(`Sidecar validation failed: database identity mismatch (sidecar=${sidecar.dbIdentity}, current=${canonicalDb}).`);
  }
  if (!sidecar.uploadsRoot || sidecar.uploadsRoot !== canonicalRoot) {
    throw new Error(`Sidecar validation failed: uploads root mismatch (sidecar=${sidecar.uploadsRoot}, current=${canonicalRoot}).`);
  }
  if (!sidecar.migrationTarget || (migrationTarget && sidecar.migrationTarget !== migrationTarget)) {
    throw new Error(`Sidecar validation failed: migration target mismatch (sidecar=${sidecar.migrationTarget}, current=${migrationTarget}).`);
  }
  if (!["PREPARED", "MIGRATED", "ROLLED_BACK"].includes(sidecar.state)) {
    throw new Error(`Sidecar validation failed: unrecognized state ${sidecar.state}.`);
  }
  if (!Array.isArray(sidecar.mappings)) {
    throw new Error("Sidecar validation failed: mappings array missing or invalid.");
  }
}

async function runRollback(prisma, uploadsRoot, dbUrl) {
  const canonicalRoot = getCanonicalUploadsRoot(uploadsRoot);
  const canonicalDb = getCanonicalDbIdentity(dbUrl);
  const sidecarPath = path.join(canonicalRoot, SIDECAR_NAME);

  if (!fs.existsSync(sidecarPath)) {
    console.log("[preflight] No sidecar mapping found; nothing to roll back.");
    return;
  }

  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
  validateSidecar(sidecar, canonicalDb, canonicalRoot, "20260801000000_storage_keys_and_audit_snapshots");

  if (sidecar.state === "MIGRATED") {
    throw new Error("Cannot rollback: migration is already finalized (MIGRATED). Live files preserved.");
  }

  if (sidecar.state === "ROLLED_BACK") {
    console.log("[preflight] Migration has already been rolled back.");
    return;
  }

  let dbReferencedKeys = new Set();
  if (prisma) {
    try {
      const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info("Attachment")`);
      const names = new Set(columns.map((c) => c.name));
      if (names.has("storageKey")) {
        const rows = await prisma.$queryRawUnsafe(`SELECT DISTINCT storageKey FROM "Attachment"`);
        dbReferencedKeys = new Set(rows.map((r) => r.storageKey).filter(Boolean));
      }
    } catch (error) {
      throw new Error(`Cannot rollback: database read failed (${String(error)}). Aborting to prevent unlinking referenced files.`);
    }
  }

  let removed = 0;
  for (const mapping of sidecar.mappings || []) {
    if (mapping.provenance !== "CREATED_BY_RUN") continue;
    if (dbReferencedKeys.has(mapping.newStorageKey)) {
      console.warn(`[preflight] Skipping rollback of ${mapping.newStorageKey}: referenced by database.`);
      continue;
    }
    const copiedPath = path.join(canonicalRoot, mapping.newStorageKey);
    if (fs.existsSync(copiedPath)) {
      fs.unlinkSync(copiedPath);
      removed++;
    }
  }

  sidecar.state = "ROLLED_BACK";
  sidecar.rolledBackAt = new Date().toISOString();
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), "utf8");
  console.log(`[preflight] Rolled back ${removed} CREATED_BY_RUN file(s); pre-existing and referenced files retained.`);
}

async function finalizeMigration(prisma, uploadsRoot, dbUrl) {
  const canonicalRoot = getCanonicalUploadsRoot(uploadsRoot);
  const canonicalDb = getCanonicalDbIdentity(dbUrl);
  const sidecarPath = path.join(canonicalRoot, SIDECAR_NAME);

  if (!fs.existsSync(sidecarPath)) {
    console.log("[preflight] No sidecar mapping found; nothing to finalize.");
    return;
  }

  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
  validateSidecar(sidecar, canonicalDb, canonicalRoot, "20260801000000_storage_keys_and_audit_snapshots");

  if (sidecar.state === "MIGRATED") {
    console.log("[preflight] Sidecar is already MIGRATED; no-op.");
    return;
  }

  // Verify DB schema has storageKey
  const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info("Attachment")`);
  const names = new Set(columns.map((c) => c.name));
  if (!names.has("storageKey")) {
    throw new Error("Cannot finalize migration: Attachment table missing storageKey column.");
  }

  // Verify mapped rows match on storageKey and physical file exists
  for (const mapping of sidecar.mappings || []) {
    const rows = await prisma.$queryRaw`
      SELECT id, storageKey FROM "Attachment" WHERE id = ${mapping.attachmentId}
    `;
    if (rows.length === 0) {
      throw new Error(`Finalization verification failed: attachment row ${mapping.attachmentId} missing in database`);
    }
    if (rows[0].storageKey !== mapping.newStorageKey) {
      throw new Error(`Finalization verification failed: attachment ${mapping.attachmentId} has storageKey=${rows[0].storageKey}, expected ${mapping.newStorageKey}`);
    }
    const destFile = path.join(canonicalRoot, mapping.newStorageKey);
    if (!fs.existsSync(destFile)) {
      throw new Error(`Finalization verification failed: physical file missing for ${mapping.newStorageKey}`);
    }
    const expectedSize = mapping.sizeBytes ?? mapping.sourceSizeBytes;
    if (expectedSize && fs.statSync(destFile).size !== expectedSize) {
      throw new Error(`Finalization verification failed: physical file size mismatch for ${mapping.newStorageKey}`);
    }
    if (mapping.sourceHash && sha256Of(destFile) !== mapping.sourceHash) {
      throw new Error(`Finalization verification failed: physical file hash mismatch for ${mapping.newStorageKey}`);
    }
  }

  sidecar.state = "MIGRATED";
  sidecar.finalizedAt = new Date().toISOString();
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), "utf8");
  console.log(`[preflight] Migration finalized (MIGRATED); sidecar updated in ${SIDECAR_NAME}.`);
}

async function runPreflight(prisma, uploadsRoot, dbUrl) {
  const canonicalRoot = getCanonicalUploadsRoot(uploadsRoot);
  const canonicalDb = getCanonicalDbIdentity(dbUrl);
  const sidecarPath = path.join(canonicalRoot, SIDECAR_NAME);

  if (fs.existsSync(sidecarPath)) {
    const existingSidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
    validateSidecar(existingSidecar, canonicalDb, canonicalRoot, "20260801000000_storage_keys_and_audit_snapshots");

    let hasStorageKey = false;
    let hasTable = false;
    if (prisma) {
      const tableRows = await prisma.$queryRawUnsafe(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Attachment'`
      );
      hasTable = tableRows.length > 0;
      if (hasTable) {
        const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info("Attachment")`);
        const names = new Set(columns.map((c) => c.name));
        hasStorageKey = names.has("storageKey");
      }
    }

    if (existingSidecar.state === "MIGRATED") {
      if (prisma && hasTable && !hasStorageKey) {
        throw new Error(
          "Stale sidecar / schema state conflict: sidecar state is MIGRATED but Attachment table is in legacy shape (missing storageKey)."
        );
      }
      console.log("[preflight] Sidecar is already MIGRATED; skipping preflight.");
      return;
    }

    if (existingSidecar.state === "PREPARED") {
      console.log("[preflight] Found existing PREPARED sidecar for current database; verifying files on disk.");
      for (const mapping of existingSidecar.mappings || []) {
        const destFile = path.join(canonicalRoot, mapping.newStorageKey);
        const expectedHash = mapping.sourceHash || mapping.hash;
        const expectedSize = mapping.sizeBytes ?? mapping.sourceSizeBytes;

        if (!expectedHash || expectedSize === undefined || expectedSize === null) {
          throw new Error(`Preflight resume failed: missing hash or size metadata for ${mapping.newStorageKey}`);
        }

        if (!fs.existsSync(destFile)) {
          let restored = false;
          if (mapping.sourceFile && fs.existsSync(mapping.sourceFile)) {
            fs.copyFileSync(mapping.sourceFile, destFile);
            restored = true;
          } else if (mapping.oldStorageKey) {
            const legacyPath = path.join(canonicalRoot, mapping.oldStorageKey);
            if (fs.existsSync(legacyPath)) {
              fs.copyFileSync(legacyPath, destFile);
              restored = true;
            }
          }
          if (!restored || !fs.existsSync(destFile)) {
            throw new Error(`Preflight resume failed: missing destination file for ${mapping.newStorageKey}`);
          }
        }

        const actualSize = fs.statSync(destFile).size;
        if (actualSize !== expectedSize) {
          throw new Error(`Preflight resume failed: size mismatch for ${mapping.newStorageKey} (expected=${expectedSize}, actual=${actualSize})`);
        }
        const actualHash = sha256Of(destFile);
        if (actualHash !== expectedHash) {
          throw new Error(`Preflight resume failed: hash mismatch for ${mapping.newStorageKey} (expected=${expectedHash}, actual=${actualHash})`);
        }
      }
      return;
    }
  }

  const tableRows = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Attachment'`
  );
  if (tableRows.length === 0) {
    console.log("[preflight] No legacy Attachment table; nothing to migrate.");
    return;
  }

  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, storedName, storagePath, createdAt FROM "Attachment"`
  );
  if (rows.length === 0) {
    console.log("[preflight] No legacy attachments; nothing to migrate.");
    return;
  }

  const rawByAttachment = new Map();
  for (const row of rows) {
    rawByAttachment.set(row.id, normalizeLegacyKey(row));
  }

  const groups = new Map();
  for (const row of rows) {
    const key = rawByAttachment.get(row.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const mappings = [];
  const missingFiles = [];
  for (const [rawKey, group] of groups) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort(compareLegacyRows);
    for (const loser of sorted.slice(1)) {
      const newStorageKey = `${rawKey}-dup-${loser.id}`;
      const sourceFile = path.join(canonicalRoot, path.basename(rawKey));
      if (!fs.existsSync(sourceFile) || !fs.statSync(sourceFile).isFile()) {
        missingFiles.push({ attachmentId: loser.id, basename: path.basename(rawKey) });
        continue;
      }
      mappings.push({ attachmentId: loser.id, oldStorageKey: rawKey, newStorageKey, sourceFile });
    }
  }

  if (missingFiles.length > 0) {
    console.error("[preflight] FAILED: duplicate legacy storage keys reference missing physical files.");
    for (const miss of missingFiles) {
      console.error(`  - attachmentId=${miss.attachmentId} basename=${miss.basename}`);
    }
    console.error("Repair the physical files (or remove the affected rows) and retry the migration.");
    throw new Error("Duplicate legacy storage keys with missing physical files.");
  }

  const runId = crypto.randomUUID();
  const copied = [];
  try {
    for (const mapping of mappings) {
      const destFile = path.join(canonicalRoot, mapping.newStorageKey);
      const sourceHash = sha256Of(mapping.sourceFile);
      const sourceSize = fs.statSync(mapping.sourceFile).size;
      mapping.sourceHash = sourceHash;
      mapping.sizeBytes = sourceSize;

      if (fs.existsSync(destFile)) {
        const destHash = sha256Of(destFile);
        const destSize = fs.statSync(destFile).size;
        if (destHash === sourceHash && destSize === sourceSize) {
          mapping.provenance = "PREEXISTING";
          console.log(`[preflight] Destination ${mapping.newStorageKey} already exists with identical content; treating as PREEXISTING.`);
          continue;
        }
        throw new Error(
          `Conflicting pre-existing destination ${mapping.newStorageKey}: content differs from the legacy source; refusing to overwrite.`
        );
      }
      fs.copyFileSync(mapping.sourceFile, destFile);
      const destHash = sha256Of(destFile);
      const destSize = fs.statSync(destFile).size;
      if (destHash !== sourceHash || destSize !== sourceSize) {
        throw new Error(`Verification failed for ${mapping.newStorageKey}: hash/length mismatch after copy.`);
      }
      mapping.provenance = "CREATED_BY_RUN";
      copied.push(destFile);
    }

    const sidecar = {
      version: 3,
      runId,
      generatedAt: new Date().toISOString(),
      dbIdentity: canonicalDb,
      uploadsRoot: canonicalRoot,
      schemaState: "LEGACY",
      migrationTarget: "20260801000000_storage_keys_and_audit_snapshots",
      state: "PREPARED",
      mappings: mappings.map(({ attachmentId, oldStorageKey, newStorageKey, sourceHash, sizeBytes, provenance }) => ({
        attachmentId,
        oldStorageKey,
        newStorageKey,
        sourceHash,
        sizeBytes,
        provenance,
      })),
    };
    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), "utf8");

    console.log(`[preflight] Prepared ${mappings.length} duplicate mapping(s); sidecar (PREPARED) recorded in ${SIDECAR_NAME}.`);
  } catch (error) {
    for (const file of copied) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch { /* best effort rollback */ }
    }
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const dbUrl = args["db-url"] || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is required (--db-url or env).");
    process.exit(1);
  }
  const uploadsRoot = path.resolve(args["uploads-root"] || path.join(process.cwd(), "uploads"));

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    if (args.rollback) {
      await runRollback(prisma, uploadsRoot, dbUrl);
    } else if (args.finalize) {
      await finalizeMigration(prisma, uploadsRoot, dbUrl);
    } else {
      await runPreflight(prisma, uploadsRoot, dbUrl);
    }
    console.log("[preflight] SUCCESS");
  } catch (error) {
    console.error("[preflight] FAILED:", error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

module.exports = { normalizeLegacyKey, runPreflight, runRollback, finalizeMigration };
