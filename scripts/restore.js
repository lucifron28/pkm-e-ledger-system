/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Load .env variables manually
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
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

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

async function runRestore() {
  console.log("=== PKM e-Ledger Restore Utility ===");

  if (!fs.existsSync(backupsDir)) {
    console.error("Error: No backups directory found. Nothing to restore.");
    process.exit(1);
  }

  const backupFolders = fs
    .readdirSync(backupsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name.startsWith("backup_"))
    .map((dirent) => dirent.name)
    .sort()
    .reverse(); // Newest first

  if (backupFolders.length === 0) {
    console.error("Error: No backup folders found inside the backups directory.");
    process.exit(1);
  }

  // Determine target backup folder
  let targetFolder = process.argv[2];
  if (!targetFolder) {
    console.log("\nAvailable Backups (Newest first):");
    backupFolders.forEach((folder, idx) => {
      console.log(`[${idx + 1}] ${folder}`);
    });

    const choice = await askQuestion("\nEnter the number of the backup to restore (or 'q' to quit): ");
    if (choice.toLowerCase() === "q") {
      console.log("Operation cancelled.");
      process.exit(0);
    }

    const choiceIdx = parseInt(choice, 10) - 1;
    if (isNaN(choiceIdx) || choiceIdx < 0 || choiceIdx >= backupFolders.length) {
      console.error("Invalid choice.");
      process.exit(1);
    }

    targetFolder = backupFolders[choiceIdx];
  } else {
    if (!backupFolders.includes(targetFolder)) {
      console.error(`Error: Backup folder "${targetFolder}" not found in backups directory.`);
      process.exit(1);
    }
  }

  const targetBackupPath = path.join(backupsDir, targetFolder);
  console.log(`\nSelected Backup: ${targetFolder}`);
  console.log(`Path: ${targetBackupPath}`);

  const confirmation = await askQuestion(
    "\nWARNING: Restoring will overwrite the current active database and uploads folder.\nAre you sure you want to proceed? (yes/no): "
  );

  if (confirmation.toLowerCase() !== "yes" && confirmation.toLowerCase() !== "y") {
    console.log("Restore operation aborted.");
    process.exit(0);
  }

  // Create safety rollback folder of the current active state
  const safetyRollbackDir = path.join(backupsDir, "temp_safety_rollback");
  if (fs.existsSync(safetyRollbackDir)) {
    fs.rmSync(safetyRollbackDir, { recursive: true, force: true });
  }
  fs.mkdirSync(safetyRollbackDir, { recursive: true });

  try {
    console.log("\n1. Creating temporary safety rollback of current active state...");
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(safetyRollbackDir, path.basename(dbPath)));
    }
    if (fs.existsSync(uploadsDir)) {
      fs.cpSync(uploadsDir, path.join(safetyRollbackDir, "uploads"), { recursive: true });
    }
    console.log("✓ Safety rollback created.");

    console.log("2. Overwriting database with backup file...");
    const backedDbFile = path.join(targetBackupPath, path.basename(dbPath));
    if (!fs.existsSync(backedDbFile)) {
      throw new Error(`Backup database file not found at: ${backedDbFile}`);
    }
    // Delete target database file first if it exists to avoid handle locks
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    fs.copyFileSync(backedDbFile, dbPath);
    console.log("✓ Database overwritten.");

    console.log("3. Overwriting uploads directory with backup attachments...");
    const backedUploadsDir = path.join(targetBackupPath, "uploads");
    if (fs.existsSync(backedUploadsDir)) {
      if (fs.existsSync(uploadsDir)) {
        fs.rmSync(uploadsDir, { recursive: true, force: true });
      }
      fs.cpSync(backedUploadsDir, uploadsDir, { recursive: true });
      console.log("✓ Uploads directory overwritten.");
    } else {
      // If no uploads in backup, clear current uploads to match backup state
      if (fs.existsSync(uploadsDir)) {
        fs.rmSync(uploadsDir, { recursive: true, force: true });
      }
      console.log("✓ Active uploads directory cleared (backup contained no attachments).");
    }

    // Clean up safety rollback
    fs.rmSync(safetyRollbackDir, { recursive: true, force: true });
    console.log("\n✓ Restore operation completed successfully!");
  } catch {
    console.error("\n❌ Restore failed! Attempting rollback to safety backup...");
    try {
      if (fs.existsSync(path.join(safetyRollbackDir, path.basename(dbPath)))) {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        fs.copyFileSync(path.join(safetyRollbackDir, path.basename(dbPath)), dbPath);
      }
      if (fs.existsSync(path.join(safetyRollbackDir, "uploads"))) {
        if (fs.existsSync(uploadsDir)) fs.rmSync(uploadsDir, { recursive: true, force: true });
        fs.cpSync(path.join(safetyRollbackDir, "uploads"), uploadsDir, { recursive: true });
      }
      console.log("✓ Successfully rolled back to pre-restore state.");
    } catch (rollbackError) {
      console.error("CRITICAL ERROR: Rollback failed! Manual intervention required.", rollbackError);
    }
    process.exit(1);
  }
}

runRestore();
