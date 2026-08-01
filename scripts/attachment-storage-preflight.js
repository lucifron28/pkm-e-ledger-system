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

async function runRollback(uploadsRoot) {
  const sidecarPath = path.join(uploadsRoot, SIDECAR_NAME);
  if (fs.existsSync(sidecarPath)) {
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
    let removed = 0;
    for (const mapping of sidecar.mappings || []) {
      // Only files this run created may be rolled back. Pre-existing
      // destinations (identical content found on disk before the run) are
      // never deleted.
      if (mapping.provenance !== "CREATED_BY_RUN") continue;
      const copiedPath = path.join(uploadsRoot, mapping.newStorageKey);
      if (fs.existsSync(copiedPath)) {
        fs.unlinkSync(copiedPath);
        removed++;
      }
    }
    fs.unlinkSync(sidecarPath);
    console.log(`[preflight] Rolled back ${removed} CREATED_BY_RUN file(s); pre-existing files retained.`);
  } else {
    console.log("[preflight] No sidecar mapping found; nothing to roll back.");
  }
}

async function runPreflight(prisma, uploadsRoot) {
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
      const sourceFile = path.join(uploadsRoot, path.basename(rawKey));
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

  // Copy duplicated physical files to their deterministic migration keys and
  // verify integrity before the database migration runs. Every destination is
  // tracked as CREATED_BY_RUN or PREEXISTING; a pre-existing destination with
  // different content aborts the preflight without overwriting anything.
  const copied = [];
  try {
    for (const mapping of mappings) {
      const destFile = path.join(uploadsRoot, mapping.newStorageKey);
      const sourceHash = sha256Of(mapping.sourceFile);
      const sourceSize = fs.statSync(mapping.sourceFile).size;
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
      mapping.sourceHash = sourceHash;
      mapping.sizeBytes = sourceSize;
      copied.push(destFile);
    }

    const sidecar = {
      version: 2,
      generatedAt: new Date().toISOString(),
      uploadsRoot,
      mappings: mappings.map(({ attachmentId, oldStorageKey, newStorageKey, sourceHash, sizeBytes, provenance }) => ({
        attachmentId,
        oldStorageKey,
        newStorageKey,
        sourceHash,
        sizeBytes,
        provenance,
      })),
    };
    fs.writeFileSync(path.join(uploadsRoot, SIDECAR_NAME), JSON.stringify(sidecar, null, 2), "utf8");

    console.log(`[preflight] Prepared ${mappings.length} duplicate mapping(s); sidecar recorded in ${SIDECAR_NAME}.`);
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
      await runRollback(uploadsRoot);
    } else {
      await runPreflight(prisma, uploadsRoot);
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

module.exports = { normalizeLegacyKey, runPreflight, runRollback };
