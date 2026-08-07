/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { AttachmentStorageService } = require("../lib/infrastructure/storage/attachment-store");

async function main() {
  const confirm = process.argv.includes("--confirm");
  const dryRun = !confirm;
  const uploadsRoot = path.resolve(
    process.env.UPLOADS_DIR || process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads")
  );

  console.log(`=== PKM e-Ledger Storage Reconciliation ===`);
  console.log(`Uploads Directory: ${uploadsRoot}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (pass --confirm to execute changes)" : "CONFIRM (executing storage changes)"}`);

  const prisma = new PrismaClient();
  try {
    // Fail closed if database is unavailable
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("[Storage Reconciliation] Database connectivity failed! Aborting to prevent data loss.", error);
    await prisma.$disconnect();
    process.exit(1);
  }

  const storageService = new AttachmentStorageService(uploadsRoot, prisma);

  if (dryRun) {
    console.log("\n[Dry Run] Querying DB records and inspecting file system...");
    const dbAttachments = await prisma.attachment.findMany({
      select: { id: true, storageKey: true, transactionId: true, cashTransferId: true },
    });
    console.log(`Database Attachment records: ${dbAttachments.length}`);

    const result = await storageService.reconcile(60 * 60 * 1000);
    console.log("\n--- Dry Run Reconciliation Summary ---");
    console.log(`Stale Staging Files (eligible for deletion): ${result.cleanedStaged}`);
    console.log(`Cleaned/Restored Trash Items: ${result.cleanedTrash}`);
    console.log(`Orphan Active Files (eligible for deletion): ${result.cleanedActive}`);
    console.log(`Missing Physical Files for DB Records: ${result.missingDbFiles.length}`);
    if (result.missingDbFiles.length > 0) {
      console.warn(`Missing DB storageKeys:`, result.missingDbFiles);
    }
    console.log("\nNo files were modified. Pass --confirm to apply changes.");
  } else {
    console.log("\n[Execution] Running attachment storage reconciliation...");
    const result = await storageService.reconcile(60 * 60 * 1000);
    console.log("\n--- Reconciliation Execution Summary ---");
    console.log(`Cleaned Staged Files: ${result.cleanedStaged}`);
    console.log(`Cleaned/Restored Trash Items: ${result.cleanedTrash}`);
    console.log(`Cleaned Orphan Active Files: ${result.cleanedActive}`);
    console.log(`Missing Physical Files for DB Records: ${result.missingDbFiles.length}`);
    if (result.missingDbFiles.length > 0) {
      console.warn(`Missing DB storageKeys:`, result.missingDbFiles);
    }
    console.log("\nStorage reconciliation completed successfully.");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Reconciliation script error:", err);
  process.exit(1);
});
