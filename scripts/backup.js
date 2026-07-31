/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.substring(0, eqIdx).trim();
      const val = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

loadEnv();

const rootDir = path.join(__dirname, "..");

function getBackupPaths() {
  const backupsDir = process.env.BACKUP_DIR || path.join(rootDir, "backups");
  let dbPath = process.env.DATABASE_PATH;
  if (!dbPath) {
    const dbUrl = process.env.DATABASE_URL || "";
    if (dbUrl.startsWith("file:")) {
      const relative = dbUrl.substring(5).split("?")[0];
      dbPath = path.resolve(rootDir, "prisma", relative);
    } else {
      dbPath = path.join(rootDir, "prisma", "dev.db");
    }
  }
  const uploadsDir = process.env.UPLOADS_DIR || path.join(rootDir, "uploads");
  return { backupsDir, dbPath, uploadsDir };
}

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function verifySqliteIntegrity(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Database file not found at ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    throw new Error(`Database file at ${filePath} is 0 bytes.`);
  }

  const { PrismaClient } = require("@prisma/client");
  const absolutePath = path.resolve(filePath);
  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${absolutePath}` } },
  });

  let isOk = false;
  try {
    const result = await prisma.$queryRawUnsafe("PRAGMA integrity_check;");
    if (Array.isArray(result) && result.length > 0) {
      const val = result[0].integrity_check || result[0]["integrity_check"];
      if (val === "ok") {
        isOk = true;
      }
    }
  } catch (err) {
    throw new Error(`SQLite integrity check failed for ${filePath}: ${err.message}`);
  } finally {
    await prisma.$disconnect();
  }

  if (!isOk) {
    throw new Error(`SQLite integrity check returned non-ok result for ${filePath}`);
  }
}

async function runBackup() {
  console.log("=== PKM e-Ledger Backup Utility ===");

  const appStoppedArg = process.argv.includes("--confirm-app-stopped") || process.argv.includes("--app-stopped");
  const appStoppedEnv = process.env.APP_WRITER_STOPPED === "true" || process.env.CONFIRM_APP_STOPPED === "true";
  if (!appStoppedArg && !appStoppedEnv) {
    throw new Error(
      "Backup aborted: Application must be stopped before backup. Provide --confirm-app-stopped flag or set APP_WRITER_STOPPED=true env var."
    );
  }

  const { backupsDir, dbPath, uploadsDir } = getBackupPaths();

  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite database file not found at: ${dbPath}`);
  }

  const sidecars = [`${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`].filter((f) => fs.existsSync(f));
  if (sidecars.length > 0) {
    throw new Error(
      `Refusing backup: WAL/journal sidecar files exist (${sidecars.map((s) => path.basename(s)).join(", ")}). Stop PM2 / application to flush SQLite before backup.`
    );
  }

  await verifySqliteIntegrity(dbPath);

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = getTimestamp();
  const targetBackupDir = path.join(backupsDir, `backup_${timestamp}`);
  fs.mkdirSync(targetBackupDir, { recursive: true });

  try {
    const dbBackupDest = path.join(targetBackupDir, path.basename(dbPath));
    fs.copyFileSync(dbPath, dbBackupDest);
    console.log(`✓ Copied SQLite database: ${path.basename(dbPath)}`);

    await verifySqliteIntegrity(dbBackupDest);
    console.log("✓ Backup database PRAGMA integrity_check ok.");

    if (fs.existsSync(uploadsDir)) {
      const uploadsBackupDest = path.join(targetBackupDir, "uploads");
      fs.cpSync(uploadsDir, uploadsBackupDest, { recursive: true });
      console.log("✓ Copied transaction attachments uploads folder recursively");
    } else {
      console.log("ℹ No uploads folder detected; skipped attachments copy.");
    }

    console.log(`✓ Backup successfully created at: ${targetBackupDir}`);

    const MAX_BACKUPS = 10;
    const backupFolders = fs
      .readdirSync(backupsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory() && dirent.name.startsWith("backup_"))
      .map((dirent) => dirent.name)
      .sort();

    if (backupFolders.length > MAX_BACKUPS) {
      const foldersToRemove = backupFolders.slice(0, backupFolders.length - MAX_BACKUPS);
      console.log(`\nCleaning up older backups (retaining latest ${MAX_BACKUPS})...`);
      for (const folder of foldersToRemove) {
        const fullPath = path.join(backupsDir, folder);
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`- Removed old backup: ${folder}`);
      }
    }

    console.log("\nBackup cycle completed successfully.");
    return targetBackupDir;
  } catch (error) {
    if (fs.existsSync(targetBackupDir)) {
      try { fs.rmSync(targetBackupDir, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
    console.error("Backup failed:", error.message || error);
    throw error;
  }
}

if (require.main === module) {
  runBackup().catch(() => process.exit(1));
}

module.exports = { runBackup, verifySqliteIntegrity };
