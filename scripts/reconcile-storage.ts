import path from "path";
import { PrismaClient } from "@prisma/client";
import { AttachmentStorageService } from "../lib/infrastructure/storage/attachment-store";

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
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("[Storage Reconciliation] Database connectivity failed! Aborting to prevent data loss.", error);
    await prisma.$disconnect();
    process.exit(1);
  }

  const storageService = new AttachmentStorageService(uploadsRoot, prisma);
  const plan = await storageService.planReconciliation(60 * 60 * 1000);

  if (plan.dbError) {
    console.error("[Storage Reconciliation] Database query failed during planning. Aborting.");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("\n--- Storage Reconciliation Plan ---");
  console.log(`Stale Staging Files to Delete: ${plan.deleteStaging.length}`);
  if (plan.deleteStaging.length > 0) {
    console.log("  Paths:", plan.deleteStaging);
  }

  console.log(`Trash Items to Restore: ${plan.restoreTrash.length}`);
  if (plan.restoreTrash.length > 0) {
    console.log("  Items:", plan.restoreTrash.map((t) => t.storageKey));
  }

  console.log(`Permanently Deleted Trash Items: ${plan.deleteTrash.length}`);
  if (plan.deleteTrash.length > 0) {
    console.log("  Items:", plan.deleteTrash.map((t) => t.trashKey));
  }

  console.log(`Stale Manifest-Only Items: ${plan.deleteManifestOnly.length}`);
  console.log(`Active Orphan Files to Delete: ${plan.deleteActiveOrphans.length}`);
  if (plan.deleteActiveOrphans.length > 0) {
    console.log("  Paths:", plan.deleteActiveOrphans);
  }

  console.log(`Missing Physical Files for DB Records: ${plan.missingDbFiles.length}`);
  if (plan.missingDbFiles.length > 0) {
    console.warn("  Missing DB storageKeys:", plan.missingDbFiles);
  }

  console.log(`Retained for Manual Inspection: ${plan.retainedForReview.length}`);
  if (plan.retainedForReview.length > 0) {
    console.log("  Items:", plan.retainedForReview);
  }

  if (dryRun) {
    console.log("\nDRY RUN complete. Zero files were modified. Pass --confirm to apply this plan.");
  } else {
    console.log("\n[Execution] Applying storage reconciliation plan...");
    const result = await storageService.applyReconciliation(plan);
    console.log("\n--- Reconciliation Execution Summary ---");
    console.log(`Cleaned Staged Files: ${result.cleanedStaged}`);
    console.log(`Cleaned/Restored Trash Items: ${result.cleanedTrash}`);
    console.log(`Cleaned Orphan Active Files: ${result.cleanedActive}`);
    console.log(`Missing Physical Files for DB Records: ${result.missingDbFiles.length}`);
    console.log("\nStorage reconciliation completed successfully.");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Reconciliation script error:", err);
  process.exit(1);
});
