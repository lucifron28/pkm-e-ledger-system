const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

async function main() {
  const confirm = process.argv.includes("--confirm");
  const prisma = new PrismaClient();

  const uploadsRoot = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
  const stagingDir = path.join(uploadsRoot, "staging");
  const trashDir = path.join(uploadsRoot, "trash");

  console.log(`[Storage Reconciliation] Root: ${uploadsRoot}`);
  console.log(`[Storage Reconciliation] Mode: ${confirm ? "CONFIRM (will delete orphans)" : "DRY RUN (pass --confirm to delete)"}`);

  if (!fs.existsSync(uploadsRoot)) {
    console.log("[Storage Reconciliation] Uploads directory does not exist. Nothing to reconcile.");
    await prisma.$disconnect();
    return;
  }

  let dbKeys = new Set();
  try {
    const attachments = await prisma.attachment.findMany({ select: { storageKey: true } });
    dbKeys = new Set(attachments.map((a) => a.storageKey));
    console.log(`[Storage Reconciliation] Found ${dbKeys.size} attachment storageKeys in database.`);
  } catch (error) {
    console.error("[Storage Reconciliation] Database query failed! Aborting to prevent accidental file deletion.", error);
    await prisma.$disconnect();
    process.exit(1);
  }

  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;

  // Active files in root
  const rootFiles = fs.readdirSync(uploadsRoot, { withFileTypes: true });
  const activeOrphans = [];
  for (const entry of rootFiles) {
    if (entry.isFile()) {
      const fileName = entry.name;
      if (!dbKeys.has(fileName)) {
        const filePath = path.join(uploadsRoot, fileName);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > ONE_HOUR) {
          activeOrphans.push(filePath);
        }
      }
    }
  }

  // Staging files
  const staleStaging = [];
  if (fs.existsSync(stagingDir)) {
    const stagingFiles = fs.readdirSync(stagingDir, { withFileTypes: true });
    for (const entry of stagingFiles) {
      if (entry.isFile()) {
        const filePath = path.join(stagingDir, entry.name);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > ONE_HOUR) {
          staleStaging.push(filePath);
        }
      }
    }
  }

  // Trash files
  const staleTrash = [];
  if (fs.existsSync(trashDir)) {
    const trashFiles = fs.readdirSync(trashDir, { withFileTypes: true });
    for (const entry of trashFiles) {
      if (entry.isFile()) {
        const filePath = path.join(trashDir, entry.name);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > ONE_HOUR) {
          staleTrash.push(filePath);
        }
      }
    }
  }

  console.log(`\n--- Reconciliation Summary ---`);
  console.log(`Unreferenced Active Files (>1h old): ${activeOrphans.length}`);
  console.log(`Stale Staging Files (>1h old): ${staleStaging.length}`);
  console.log(`Stale Trash Files (>1h old): ${staleTrash.length}`);

  const toDelete = [...activeOrphans, ...staleStaging, ...staleTrash];

  if (toDelete.length === 0) {
    console.log(`\nStorage is fully reconciled. No orphan files found.`);
  } else if (confirm) {
    console.log(`\nCleaning up ${toDelete.length} orphan files...`);
    let deletedCount = 0;
    for (const file of toDelete) {
      try {
        fs.unlinkSync(file);
        deletedCount++;
      } catch (err) {
        console.error(`Failed to delete ${file}:`, err);
      }
    }
    console.log(`Successfully deleted ${deletedCount} orphan files.`);
  } else {
    console.log(`\nRun with --confirm to permanently delete these ${toDelete.length} orphan files.`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Storage reconciliation crashed:", err);
  process.exit(1);
});
