import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import fs from "fs";
import { execSync, spawnSync } from "child_process";
import { PrismaClient } from "@prisma/client";
/* eslint-disable @typescript-eslint/no-require-imports */
const { runBackup } = require("../../scripts/backup");
const { runRestore } = require("../../scripts/restore");

const sandboxDir = path.join(__dirname, "temp_recovery_sandbox");
const sandboxDb = path.join(sandboxDir, "sandbox.db");
const sandboxUploads = path.join(sandboxDir, "uploads");
const sandboxBackups = path.join(sandboxDir, "backups");
const dbUrl = `file:${sandboxDb}`;

function resetSandboxEnv() {
  process.env.BACKUP_DIR = sandboxBackups;
  process.env.DATABASE_PATH = sandboxDb;
  process.env.UPLOADS_DIR = sandboxUploads;
}

function setAppStoppedEnv(value: boolean) {
  if (value) {
    process.env.APP_WRITER_STOPPED = "true";
  } else {
    delete process.env.APP_WRITER_STOPPED;
    delete process.env.CONFIRM_APP_STOPPED;
  }
}

test.before(() => {
  if (fs.existsSync(sandboxDir)) {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  }
  fs.mkdirSync(sandboxDir, { recursive: true });
  fs.mkdirSync(sandboxUploads, { recursive: true });

  execSync(`npx prisma db push --skip-generate`, {
    cwd: path.join(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: dbUrl },
    encoding: "utf8",
    stdio: "ignore",
  });

  fs.writeFileSync(path.join(sandboxUploads, "receipt.pdf"), "%PDF-1.7 test receipt content");
});

test.after(() => {
  if (fs.existsSync(sandboxDir)) {
    try { fs.rmSync(sandboxDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

test("Recovery Integration: Real SQLite database backup and restore cycle", async () => {
  resetSandboxEnv();
  process.env.SKIP_RESTORE_PROMPT = "true";
  setAppStoppedEnv(true);

  let prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  let createdOrgId = "";
  try {
    const org = await prisma.organization.create({
      data: { name: "Original Sandbox Org", slug: "sandbox-org", active: true },
    });
    createdOrgId = org.id;
  } finally {
    await prisma.$disconnect();
  }

  const backupPath = await runBackup();
  assert.ok(fs.existsSync(backupPath), "Backup directory must exist");
  assert.ok(fs.existsSync(path.join(backupPath, "sandbox.db")), "Backup database file must exist");
  assert.ok(fs.existsSync(path.join(backupPath, "uploads", "receipt.pdf")), "Backup receipt file must exist");

  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await prisma.organization.update({
      where: { id: createdOrgId },
      data: { name: "MUTATED Sandbox Org" },
    });
  } finally {
    await prisma.$disconnect();
  }

  const targetFolder = path.basename(backupPath);
  const success = await runRestore(targetFolder);
  assert.ok(success, "Restore operation should succeed");

  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const restoredOrg = await prisma.organization.findUnique({ where: { id: createdOrgId } });
    assert.ok(restoredOrg);
    assert.equal(restoredOrg.name, "Original Sandbox Org", "Restored database must contain pre-mutation record");
  } finally {
    await prisma.$disconnect();
  }
});

test("Recovery Integration: Restore shutdown confirmation enforcement", async () => {
  resetSandboxEnv();
  process.env.SKIP_RESTORE_PROMPT = "true";
  setAppStoppedEnv(true);

  const backupPath = await runBackup();
  const targetFolder = path.basename(backupPath);

  // 1. Imported runRestore without confirmation rejects (before any backup processing)
  setAppStoppedEnv(false);
  await assert.rejects(
    async () => {
      await runRestore(targetFolder);
    },
    { message: /Application must be stopped/ }
  );

  // 2. SKIP_RESTORE_PROMPT=true alone still rejects (never counts as confirmation)
  process.env.SKIP_RESTORE_PROMPT = "true";
  await assert.rejects(
    async () => {
      await runRestore(targetFolder);
    },
    { message: /Application must be stopped/ }
  );

  // 3. Explicit options.confirmAppStopped=true succeeds
  const successOpt = await runRestore(targetFolder, { confirmAppStopped: true });
  assert.ok(successOpt, "options.confirmAppStopped=true must be accepted as confirmation");

  // 4. APP_WRITER_STOPPED=true succeeds
  setAppStoppedEnv(true);
  const successEnv = await runRestore(targetFolder);
  assert.ok(successEnv, "APP_WRITER_STOPPED=true must be accepted as confirmation");
});

test("Recovery Integration: Restore CLI fails immediately without approved confirmation", () => {
  const scriptPath = path.join(__dirname, "..", "..", "scripts", "restore.js");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BACKUP_DIR: sandboxBackups,
    DATABASE_PATH: sandboxDb,
    UPLOADS_DIR: sandboxUploads,
    SKIP_RESTORE_PROMPT: "true",
  };
  delete env.APP_WRITER_STOPPED;
  delete env.CONFIRM_APP_STOPPED;

  const started = Date.now();
  const result = spawnSync(process.execPath, [scriptPath], { env, encoding: "utf8", timeout: 10000, input: "" });
  const elapsed = Date.now() - started;

  assert.equal(result.status, 1, "CLI must exit non-zero without approved confirmation");
  assert.match(result.stderr, /No approved confirmation/, "CLI must report the missing approved confirmation");
  assert.ok(elapsed < 5000, "CLI must fail immediately without prompting or backup processing");
});

test("Recovery Integration: Corrupt backup rejection and preflight safety", async () => {
  resetSandboxEnv();
  process.env.SKIP_RESTORE_PROMPT = "true";
  setAppStoppedEnv(true);

  const corruptFolder = "backup_corrupt_test";
  const corruptFolderPath = path.join(sandboxBackups, corruptFolder);
  fs.mkdirSync(corruptFolderPath, { recursive: true });
  fs.writeFileSync(path.join(corruptFolderPath, "sandbox.db"), "NOT A REAL SQLITE DATABASE FILE");

  await assert.rejects(
    async () => {
      await runRestore(corruptFolder, { confirmAppStopped: true });
    },
    { message: /SQLite integrity check failed/ }
  );

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const orgs = await prisma.organization.findMany();
    assert.ok(orgs.length > 0, "Active database must remain intact after corrupt restore rejection");
  } finally {
    await prisma.$disconnect();
  }
});

test("Recovery Integration: Rollback safety on failure after active database replacement", async () => {
  resetSandboxEnv();
  process.env.SKIP_RESTORE_PROMPT = "true";
  setAppStoppedEnv(true);

  let prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  let orgAId = "";
  try {
    const orgA = await prisma.organization.create({
      data: { name: "Pre-Restore State Org", slug: "pre-restore-org", active: true },
    });
    orgAId = orgA.id;
  } finally {
    await prisma.$disconnect();
  }

  const backupPath = await runBackup();
  const targetFolder = path.basename(backupPath);

  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await prisma.organization.update({
      where: { id: orgAId },
      data: { name: "State B Active Org Name" },
    });
  } finally {
    await prisma.$disconnect();
  }

  await assert.rejects(
    async () => {
      await runRestore(targetFolder, {
        confirmAppStopped: true,
        postDbOverwriteHook: async () => {
          throw new Error("INJECTED_FAILURE_AFTER_DB_REPLACEMENT");
        },
      });
    },
    { message: "INJECTED_FAILURE_AFTER_DB_REPLACEMENT" }
  );

  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const activeOrg = await prisma.organization.findUnique({ where: { id: orgAId } });
    assert.ok(activeOrg);
    assert.equal(activeOrg.name, "State B Active Org Name", "Active state must be restored upon post-replacement failure");
  } finally {
    await prisma.$disconnect();
  }

  const safetyRollbackDir = path.join(sandboxBackups, "temp_safety_rollback");
  assert.equal(fs.existsSync(safetyRollbackDir), false, "Safety rollback directory must be cleaned up after successful rollback");
});

test("Recovery Integration: Rollback after uploads replacement failure restores all artifacts", async () => {
  resetSandboxEnv();
  process.env.SKIP_RESTORE_PROMPT = "true";
  setAppStoppedEnv(true);

  // Pre-backup state: original upload contents plus a file that will be backed up
  fs.writeFileSync(path.join(sandboxUploads, "original-receipt.pdf"), "%PDF-1.7 ORIGINAL");
  fs.writeFileSync(path.join(sandboxUploads, "backup-extra.pdf"), "%PDF-1.7 EXTRA");

  let prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  let orgId = "";
  try {
    const org = await prisma.organization.create({
      data: { name: "Uploads Test Org", slug: "uploads-test-org", active: true },
    });
    orgId = org.id;
  } finally {
    await prisma.$disconnect();
  }

  const backupPath = await runBackup();
  const targetFolder = path.basename(backupPath);

  // Pre-restore state (after backup): mutated db record, mutated uploads, deleted extra file, sidecars
  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await prisma.organization.update({
      where: { id: orgId },
      data: { name: "Mutated Uploads Test Org" },
    });
  } finally {
    await prisma.$disconnect();
  }
  fs.writeFileSync(path.join(sandboxUploads, "original-receipt.pdf"), "%PDF-1.7 MUTATED");
  fs.unlinkSync(path.join(sandboxUploads, "backup-extra.pdf"));
  fs.writeFileSync(`${sandboxDb}-wal`, "wal-content-before");
  fs.writeFileSync(`${sandboxDb}-journal`, "journal-content-before");

  await assert.rejects(
    async () => {
      await runRestore(targetFolder, {
        confirmAppStopped: true,
        postUploadsOverwriteHook: async () => {
          throw new Error("INJECTED_FAILURE_AFTER_UPLOADS_REPLACEMENT");
        },
      });
    },
    { message: "INJECTED_FAILURE_AFTER_UPLOADS_REPLACEMENT" }
  );

  // 1. WAL and journal restored; SHM removed (did not exist before) -- must be checked BEFORE
  //    opening Prisma, which deletes invalid sidecar files on connect.
  assert.equal(fs.readFileSync(`${sandboxDb}-wal`, "utf8"), "wal-content-before", "WAL file must be restored");
  assert.equal(fs.readFileSync(`${sandboxDb}-journal`, "utf8"), "journal-content-before", "Journal file must be restored");
  assert.equal(fs.existsSync(`${sandboxDb}-shm`), false, "SHM file must not exist after rollback if it did not exist before");

  // 2. Pre-restore database records restored
  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    assert.ok(org);
    assert.equal(org.name, "Mutated Uploads Test Org", "Database must roll back to pre-restore record");
  } finally {
    await prisma.$disconnect();
  }

  // 3. Original upload contents restored
  assert.equal(
    fs.readFileSync(path.join(sandboxUploads, "original-receipt.pdf"), "utf8"),
    "%PDF-1.7 MUTATED",
    "Upload contents must roll back to pre-restore state"
  );

  // 4. Files introduced from the backup removed (did not exist before restore)
  assert.equal(
    fs.existsSync(path.join(sandboxUploads, "backup-extra.pdf")),
    false,
    "File introduced from backup must be removed when it did not exist before restore"
  );

  // 5. Rollback storage removed after successful rollback
  assert.equal(
    fs.existsSync(path.join(sandboxBackups, "temp_safety_rollback")),
    false,
    "Safety rollback directory must be cleaned up after successful rollback"
  );
});

test("Recovery Integration: Rollback storage retained when rollback itself fails", async () => {
  resetSandboxEnv();
  process.env.SKIP_RESTORE_PROMPT = "true";
  setAppStoppedEnv(true);

  const safetyRollbackDir = path.join(sandboxBackups, "temp_safety_rollback");

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await prisma.organization.create({
      data: { name: "Rollback Failure Org", slug: "rollback-failure-org", active: true },
    });
  } finally {
    await prisma.$disconnect();
  }

  const backupPath = await runBackup();
  const targetFolder = path.basename(backupPath);

  // Controlled filesystem mocking: make rollback restore of the database fail
  const originalCopyFileSync = fs.copyFileSync;
  fs.copyFileSync = function (src, dest, ...rest) {
    if (String(src).includes("temp_safety_rollback")) {
      throw new Error("SIMULATED_ROLLBACK_FAILURE");
    }
    return originalCopyFileSync(src, dest, ...rest);
  };

  try {
    await assert.rejects(
      async () => {
        await runRestore(targetFolder, {
          confirmAppStopped: true,
          postDbOverwriteHook: async () => {
            throw new Error("INJECTED_FAILURE_TRIGGERING_ROLLBACK");
          },
        });
      },
      { message: "INJECTED_FAILURE_TRIGGERING_ROLLBACK" }
    );
  } finally {
    fs.copyFileSync = originalCopyFileSync;
  }

  // Rollback storage retained when rollback itself fails
  assert.equal(fs.existsSync(safetyRollbackDir), true, "Safety rollback directory must be retained when rollback fails");
  assert.ok(
    fs.existsSync(path.join(safetyRollbackDir, "sandbox.db")),
    "Rollback storage must contain the pre-restore database"
  );
});
