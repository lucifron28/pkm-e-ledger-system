/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const readline = require("readline");

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

function getRestorePaths() {
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

async function runRestore(targetFolderOverride, options) {
  console.log("=== PKM e-Ledger Restore Utility ===");

  // Application-stopped confirmation comes ONLY from explicit flags, env vars,
  // or a trusted internal options.confirmAppStopped === true argument.
  // SKIP_RESTORE_PROMPT must NEVER count as application-stopped confirmation.
  // Interactive shutdown confirmation is NOT an authorized source.
  const appStoppedArg = process.argv.includes("--confirm-app-stopped") || process.argv.includes("--app-stopped");
  const appStoppedEnv = process.env.APP_WRITER_STOPPED === "true" || process.env.CONFIRM_APP_STOPPED === "true";
  const appStoppedOption = !!(options && options.confirmAppStopped === true);
  const appStoppedConfirmed = appStoppedArg || appStoppedEnv || appStoppedOption;

  if (!appStoppedConfirmed) {
    // Fail immediately for both CLI and imported calls: before backup
    // enumeration, validation, prompts, rollback creation, or file modification.
    throw new Error(
      "Restore aborted: Application must be stopped before restore. No approved confirmation provided (--confirm-app-stopped, --app-stopped, APP_WRITER_STOPPED=true, CONFIRM_APP_STOPPED=true, options.confirmAppStopped: true)."
    );
  }

  const { backupsDir, dbPath, uploadsDir } = getRestorePaths();

  if (!fs.existsSync(backupsDir)) {
    throw new Error("Error: No backups directory found. Nothing to restore.");
  }

  const backupFolders = fs
    .readdirSync(backupsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name.startsWith("backup_"))
    .map((dirent) => dirent.name)
    .sort()
    .reverse();

  if (backupFolders.length === 0) {
    throw new Error("Error: No backup folders found inside the backups directory.");
  }

  let targetFolder = targetFolderOverride || (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null);
  if (!targetFolder) {
    if (process.env.SKIP_RESTORE_PROMPT === "true") {
      targetFolder = backupFolders[0];
    } else {
      console.log("\nAvailable Backups (Newest first):");
      backupFolders.forEach((folder, idx) => {
        console.log(`[${idx + 1}] ${folder}`);
      });

      const choice = await askQuestion("\nEnter the number of the backup to restore (or 'q' to quit): ");
      if (choice.toLowerCase() === "q") {
        console.log("Operation cancelled.");
        return false;
      }

      const choiceIdx = parseInt(choice, 10) - 1;
      if (isNaN(choiceIdx) || choiceIdx < 0 || choiceIdx >= backupFolders.length) {
        throw new Error("Invalid choice.");
      }

      targetFolder = backupFolders[choiceIdx];
    }
  } else {
    if (!backupFolders.includes(targetFolder)) {
      throw new Error(`Error: Backup folder "${targetFolder}" not found in backups directory.`);
    }
  }

  const targetBackupPath = path.join(backupsDir, targetFolder);
  const backedDbFile = path.join(targetBackupPath, path.basename(dbPath));

  console.log(`\nSelected Backup: ${targetFolder}`);
  console.log(`Path: ${targetBackupPath}`);

  // Requirement: Validate the backup with PRAGMA integrity_check before modifying active data!
  await verifySqliteIntegrity(backedDbFile);
  console.log("✓ Backup file SQLite PRAGMA integrity_check verified before modify.");

  if (process.env.SKIP_RESTORE_PROMPT !== "true" && require.main === module) {
    const confirmation = await askQuestion(
      "\nWARNING: Restoring will overwrite the current active database and uploads folder.\nAre you sure you want to proceed? (yes/no): "
    );

    if (confirmation.toLowerCase() !== "yes" && confirmation.toLowerCase() !== "y") {
      console.log("Restore operation aborted.");
      return false;
    }
  }

  // Requirement 4: Track exact state of artifacts before restore
  const existedBefore = {
    db: fs.existsSync(dbPath),
    uploads: fs.existsSync(uploadsDir),
    wal: fs.existsSync(`${dbPath}-wal`),
    shm: fs.existsSync(`${dbPath}-shm`),
    journal: fs.existsSync(`${dbPath}-journal`),
  };

  const safetyRollbackDir = path.join(backupsDir, "temp_safety_rollback");
  if (fs.existsSync(safetyRollbackDir)) {
    fs.rmSync(safetyRollbackDir, { recursive: true, force: true });
  }
  fs.mkdirSync(safetyRollbackDir, { recursive: true });

  try {
    console.log("\n1. Creating temporary safety rollback of current active state...");
    if (existedBefore.db) {
      fs.copyFileSync(dbPath, path.join(safetyRollbackDir, path.basename(dbPath)));
    }
    const sidecarExts = ["-wal", "-shm", "-journal"];
    for (const ext of sidecarExts) {
      const activeSidecar = `${dbPath}${ext}`;
      if (fs.existsSync(activeSidecar)) {
        fs.copyFileSync(activeSidecar, path.join(safetyRollbackDir, `${path.basename(dbPath)}${ext}`));
      }
    }
    if (existedBefore.uploads) {
      fs.cpSync(uploadsDir, path.join(safetyRollbackDir, "uploads"), { recursive: true });
    }
    console.log("✓ Safety rollback created.");

    console.log("2. Removing stale active -wal, -shm, and -journal files before restoring...");
    for (const ext of sidecarExts) {
      const activeSidecar = `${dbPath}${ext}`;
      if (fs.existsSync(activeSidecar)) {
        try { fs.unlinkSync(activeSidecar); } catch { /* ignore */ }
      }
    }

    console.log("3. Overwriting database with backup file...");
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    fs.copyFileSync(backedDbFile, dbPath);
    await verifySqliteIntegrity(dbPath);
    console.log("✓ Database overwritten and integrity verified.");

    // Hook for dependency-injected testing failure after active database replacement
    if (options && typeof options.postDbOverwriteHook === "function") {
      await options.postDbOverwriteHook();
    }

    console.log("4. Overwriting uploads directory with backup attachments...");
    const backedUploadsDir = path.join(targetBackupPath, "uploads");
    if (fs.existsSync(backedUploadsDir)) {
      if (fs.existsSync(uploadsDir)) {
        fs.rmSync(uploadsDir, { recursive: true, force: true });
      }
      fs.cpSync(backedUploadsDir, uploadsDir, { recursive: true });
      console.log("✓ Uploads directory overwritten.");
    } else {
      if (fs.existsSync(uploadsDir)) {
        fs.rmSync(uploadsDir, { recursive: true, force: true });
      }
      console.log("✓ Active uploads directory cleared (backup contained no attachments).");
    }

    // Hook for dependency-injected testing failure after uploads replacement
    if (options && typeof options.postUploadsOverwriteHook === "function") {
      await options.postUploadsOverwriteHook();
    }

    fs.rmSync(safetyRollbackDir, { recursive: true, force: true });
    console.log("\n✓ Restore operation completed successfully!");
    return true;
  } catch (error) {
    console.error("\n❌ Restore failed!", error.message || error);
    console.error("Attempting rollback to safety backup...");
    let rollbackFailed = false;
    try {
      // 1. Restore db or remove newly created db
      const savedDb = path.join(safetyRollbackDir, path.basename(dbPath));
      if (existedBefore.db && fs.existsSync(savedDb)) {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        fs.copyFileSync(savedDb, dbPath);
      } else if (!existedBefore.db && fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }

      // 2. Restore sidecars or remove newly created sidecars
      const sidecarExts = ["-wal", "-shm", "-journal"];
      for (const ext of sidecarExts) {
        const activeSidecar = `${dbPath}${ext}`;
        const savedSidecar = path.join(safetyRollbackDir, `${path.basename(dbPath)}${ext}`);
        if (existedBefore[ext.replace("-", "")] && fs.existsSync(savedSidecar)) {
          if (fs.existsSync(activeSidecar)) fs.unlinkSync(activeSidecar);
          fs.copyFileSync(savedSidecar, activeSidecar);
        } else if (!existedBefore[ext.replace("-", "")] && fs.existsSync(activeSidecar)) {
          fs.unlinkSync(activeSidecar);
        }
      }

      // 3. Restore uploads or remove newly created uploads
      const savedUploads = path.join(safetyRollbackDir, "uploads");
      if (existedBefore.uploads && fs.existsSync(savedUploads)) {
        if (fs.existsSync(uploadsDir)) fs.rmSync(uploadsDir, { recursive: true, force: true });
        fs.cpSync(savedUploads, uploadsDir, { recursive: true });
      } else if (!existedBefore.uploads && fs.existsSync(uploadsDir)) {
        fs.rmSync(uploadsDir, { recursive: true, force: true });
      }

      console.log("✓ Successfully rolled back to pre-restore state.");
    } catch (rollbackError) {
      rollbackFailed = true;
      console.error("CRITICAL ERROR: Rollback failed! Safety rollback directory retained.", rollbackError);
    }

    if (!rollbackFailed && fs.existsSync(safetyRollbackDir)) {
      fs.rmSync(safetyRollbackDir, { recursive: true, force: true });
    }

    throw error;
  }
}

if (require.main === module) {
  runRestore().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = { runRestore, verifySqliteIntegrity };
