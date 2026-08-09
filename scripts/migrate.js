/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Safe database migration orchestrator.
 *
 * npm run db:migrate now runs this script instead of calling `prisma migrate`
 * directly, so the attachment storage-key preflight is never bypassed:
 *
 *   1. Inspect PRAGMA table_info("Attachment"):
 *      - storedName/storagePath columns present  -> LEGACY (preflight runs)
 *      - storageKey column present (no legacy)   -> MIGRATED (preflight no-ops)
 *      - no Attachment table                     -> FRESH (preflight no-ops)
 *   2. Run the attachment preflight only for LEGACY databases. The preflight
 *      copies duplicated legacy files to their deterministic migration keys,
 *      tracks each destination as CREATED_BY_RUN or PREEXISTING, refuses to
 *      overwrite a conflicting pre-existing destination, and records the
 *      mapping in a sidecar JSON file.
 *   3. Run the Prisma migration (`migrate dev` by default, `migrate deploy`
 *      with --deploy).
 *   4. If the migration fails, invoke the preflight rollback, which deletes
 *      ONLY CREATED_BY_RUN files and retains pre-existing files.
 *
 * The orchestrator is safely rerunnable: after the hardening migration has
 * applied, the Attachment table no longer has legacy columns, so the preflight
 * no-ops and `migrate deploy` finds no pending migrations.
 *
 * Usage:
 *   node scripts/migrate.js [--db-url file:./prisma/dev.db] [--uploads-root ./uploads] [--schema prisma/schema.prisma] [--deploy]
 */
const { execFileSync, execSync } = require("child_process");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const ROOT_DIR = path.resolve(__dirname, "..");

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

async function inspectAttachmentState(prisma) {
  const tables = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Attachment'`
  );
  if (tables.length === 0) return "FRESH";
  const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info("Attachment")`);
  const names = new Set(columns.map((column) => column.name));
  if (names.has("storageKey")) return "MIGRATED";
  if (names.has("storedName") || names.has("storagePath")) return "LEGACY";
  return "FRESH";
}

function runPrismaMigration(dbUrl, mode, schemaArg) {
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const command = schemaArg
    ? `${npxCmd} prisma migrate ${mode} --schema "${schemaArg}"`
    : `${npxCmd} prisma migrate ${mode}`;
  execSync(command, {
    cwd: ROOT_DIR,
    env: { ...process.env, DATABASE_URL: dbUrl },
    encoding: "utf8",
    stdio: "inherit",
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const dbUrl = args["db-url"] || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is required (--db-url or env).");
    process.exit(1);
  }
  const uploadsRoot = path.resolve(args["uploads-root"] || path.join(ROOT_DIR, "uploads"));
  const schemaArg = args.schema ? path.resolve(args.schema) : null;
  const mode = args.deploy ? "deploy" : "dev";
  const preflightPath = path.join(ROOT_DIR, "scripts", "attachment-storage-preflight.js");
  const preflightArgs = [preflightPath, "--db-url", dbUrl, "--uploads-root", uploadsRoot];

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  let state;
  try {
    state = await inspectAttachmentState(prisma);
  } catch (error) {
    console.error("[migrate] FAILED: could not inspect Attachment table:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
  console.log(`[migrate] Attachment state: ${state}`);

  let preflightRan = false;
  if (state === "LEGACY") {
    console.log("[migrate] Legacy attachment columns detected; running storage-key preflight.");
    try {
      const preflightOutput = execFileSync(process.execPath, preflightArgs, {
        cwd: ROOT_DIR,
        encoding: "utf8",
        stdio: "pipe",
      });
      if (!preflightOutput.includes("[preflight] SUCCESS")) {
        console.error(preflightOutput);
        console.error("[migrate] FAILED: attachment storage-key preflight did not succeed.");
        process.exit(1);
      }
      preflightRan = true;
    } catch (error) {
      console.error("[migrate] FAILED: attachment storage-key preflight aborted.");
      console.error(String(error.message || error));
      process.exit(1);
    }
  } else {
    console.log("[migrate] No legacy attachment columns; skipping storage-key preflight.");
  }

  try {
    runPrismaMigration(dbUrl, mode, schemaArg);
  } catch (error) {
    if (preflightRan) {
      console.error("[migrate] Migration failed; rolling back CREATED_BY_RUN preflight files.");
      execFileSync(process.execPath, [...preflightArgs, "--rollback"], {
        cwd: ROOT_DIR,
        encoding: "utf8",
        stdio: "inherit",
      });
    }
    console.error("[migrate] FAILED:", error.message || "Prisma migration exited with an error.");
    process.exit(1);
  }

  try {
    const finalizeOutput = execFileSync(process.execPath, [...preflightArgs, "--finalize"], {
      cwd: ROOT_DIR,
      encoding: "utf8",
      stdio: "pipe",
    });
    if (
      !finalizeOutput.includes("[preflight] Migration finalized (MIGRATED)") &&
      !finalizeOutput.includes("already MIGRATED") &&
      !finalizeOutput.includes("No sidecar mapping found")
    ) {
      console.error(finalizeOutput);
      console.error("[migrate] FAILED: sidecar finalization did not complete.");
      process.exit(1);
    }
  } catch (error) {
    console.error("[migrate] FAILED: sidecar finalization encountered an error:", error.message || error);
    process.exit(1);
  }

  console.log("[migrate] SUCCESS");
}

if (require.main === module) {
  main();
}

module.exports = { inspectAttachmentState, runPrismaMigration };
