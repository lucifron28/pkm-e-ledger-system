/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

// Load .env variables manually to avoid external dependencies
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    console.log("No .env file found. Using default paths.");
    return;
  }
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    // Skip comments and empty lines
    if (line.trim().startsWith("#") || !line.trim()) return;
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[match[1]] = value.trim();
    }
  });
}

loadEnv();

const rootDir = path.join(__dirname, "..");
const backupsDir = path.join(rootDir, "backups");

// Determine SQLite file path
let dbPath;
if (process.env.DATABASE_URL) {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl.startsWith("file:")) {
    const rawPath = dbUrl.replace(/^file:/, "");
    if (path.isAbsolute(rawPath)) {
      dbPath = rawPath;
    } else {
      // Relative paths are resolved relative to the prisma directory
      dbPath = path.resolve(rootDir, "prisma", rawPath);
    }
  } else {
    dbPath = path.resolve(rootDir, "prisma", "dev.db");
  }
} else {
  dbPath = path.resolve(rootDir, "prisma", "dev.db");
}
const uploadsDir = path.join(rootDir, "uploads");

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

async function runBackup() {
  console.log("=== PKM e-Ledger Backup Utility ===");
  
  if (!fs.existsSync(dbPath)) {
    console.error(`Error: SQLite database file not found at: ${dbPath}`);
    process.exit(1);
  }

  // Ensure backups directory exists
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = getTimestamp();
  const targetBackupDir = path.join(backupsDir, `backup_${timestamp}`);
  fs.mkdirSync(targetBackupDir, { recursive: true });

  try {
    // 1. Copy SQLite database
    const dbBackupDest = path.join(targetBackupDir, path.basename(dbPath));
    fs.copyFileSync(dbPath, dbBackupDest);
    console.log(`✓ Copied SQLite database: ${path.basename(dbPath)}`);

    // 2. Copy Uploads directory recursively (if it exists)
    if (fs.existsSync(uploadsDir)) {
      const uploadsBackupDest = path.join(targetBackupDir, "uploads");
      fs.cpSync(uploadsDir, uploadsBackupDest, { recursive: true });
      console.log("✓ Copied transaction attachments uploads folder recursively");
    } else {
      console.log("ℹ No uploads folder detected; skipped attachments copy.");
    }

    console.log(`✓ Backup successfully created at: ${targetBackupDir}`);

    // 3. Clean up older backups (keep last 10)
    const MAX_BACKUPS = 10;
    const backupFolders = fs
      .readdirSync(backupsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory() && dirent.name.startsWith("backup_"))
      .map((dirent) => dirent.name)
      .sort(); // Sorts chronologically due to YYYYMMDD_HHMMSS format

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
  } catch (error) {
    console.error("Backup failed:", error);
    process.exit(1);
  }
}

runBackup();
