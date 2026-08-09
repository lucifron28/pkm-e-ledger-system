import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { AttachmentStorageService, StorageDatabase } from "../../lib/infrastructure/storage/attachment-store";

function snapshotDir(dir: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  if (!fs.existsSync(dir)) return snapshot;

  function walk(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      const relPath = path.relative(dir, fullPath).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        snapshot[relPath] = fs.readFileSync(fullPath, "utf8");
      }
    }
  }

  walk(dir);
  return snapshot;
}

test("Storage Reconciliation: planReconciliation dry-run performs zero mutation", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-dryrun-"));
  const stagingDir = path.join(tmpDir, "staging");
  const trashDir = path.join(tmpDir, "trash");
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.mkdirSync(trashDir, { recursive: true });

  const activeFile = path.join(tmpDir, "active-1.png");
  fs.writeFileSync(activeFile, "active content");

  const staleStaging = path.join(stagingDir, "stale.png");
  fs.writeFileSync(staleStaging, "stale staging");
  const oldTime = Date.now() - 2 * 60 * 60 * 1000;
  fs.utimesSync(staleStaging, new Date(oldTime), new Date(oldTime));

  const trashPayload = path.join(trashDir, "trash-1.png");
  fs.writeFileSync(trashPayload, "trash payload");
  const manifestPath = path.join(trashDir, "trash-1.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      version: 1,
      trashKey: "trash-1.png",
      originalStorageKey: "active-1.png",
      attachmentId: "att-1",
      state: "PREPARED",
      operationTimestamp: new Date().toISOString(),
      stateChangedAt: new Date().toISOString(),
    })
  );

  const mockDb: StorageDatabase = {
    attachment: {
      findMany: async () => [
        { id: "att-1", storageKey: "active-1.png", transactionId: "tx-1", cashTransferId: null },
      ],
    },
  };

  const service = new AttachmentStorageService(tmpDir, mockDb);
  const snapshotBefore = snapshotDir(tmpDir);

  const plan = await service.planReconciliation(60 * 60 * 1000);

  const snapshotAfter = snapshotDir(tmpDir);
  assert.deepEqual(snapshotAfter, snapshotBefore, "Plan reconciliation must not mutate any file on disk");
  assert.equal(plan.deleteStaging.length, 1);
  assert.equal(plan.restoreTrash.length, 1);

  const result = await service.applyReconciliation(plan);
  assert.equal(result.cleanedStaged, 1);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Storage Reconciliation: fails closed on database query error", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-dberr-"));
  const mockDb: StorageDatabase = {
    attachment: {
      findMany: async () => {
        throw new Error("Database unavailable");
      },
    },
  };

  const service = new AttachmentStorageService(tmpDir, mockDb);
  const plan = await service.planReconciliation();
  assert.equal(plan.dbError, true);
  assert.equal(plan.deleteStaging.length, 0);
  assert.equal(plan.restoreTrash.length, 0);

  const result = await service.applyReconciliation(plan);
  assert.equal(result.cleanedStaged, 0);
  assert.equal(result.cleanedTrash, 0);
  assert.equal(result.cleanedActive, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Storage Reconciliation: DB_DELETED and CLEANED manifests retain trash when DB row exists", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-conflict-"));
  const trashDir = path.join(tmpDir, "trash");
  fs.mkdirSync(trashDir, { recursive: true });

  const trashPayload = path.join(trashDir, "trash-dbdel.png");
  fs.writeFileSync(trashPayload, "trash payload");
  const manifestPath = path.join(trashDir, "trash-dbdel.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      version: 1,
      trashKey: "trash-dbdel.png",
      originalStorageKey: "referenced.png",
      attachmentId: "att-conflict",
      state: "DB_DELETED",
      operationTimestamp: new Date().toISOString(),
      stateChangedAt: new Date().toISOString(),
    })
  );

  // DB contains referenced.png
  const mockDb: StorageDatabase = {
    attachment: {
      findMany: async () => [
        { id: "att-conflict", storageKey: "referenced.png", transactionId: "tx-1", cashTransferId: null },
      ],
    },
  };

  const service = new AttachmentStorageService(tmpDir, mockDb);
  const plan = await service.planReconciliation();

  assert.equal(plan.deleteTrash.length, 0, "DB_DELETED manifest must not be deleted when referenced by DB");
  assert.equal(plan.retainedForReview.length, 1, "Conflict must be retained for review");
  assert.match(plan.retainedForReview[0].reason, /Conflict/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Storage Reconciliation: applyReconciliation re-validates DB before unlinking trash or orphans", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-race-"));
  const trashDir = path.join(tmpDir, "trash");
  fs.mkdirSync(trashDir, { recursive: true });

  const orphanPath = path.join(tmpDir, "newly-referenced.png");
  fs.writeFileSync(orphanPath, "orphan payload");
  const oldTime = Date.now() - 2 * 60 * 60 * 1000;
  fs.utimesSync(orphanPath, new Date(oldTime), new Date(oldTime));

  const trashPayload = path.join(trashDir, "trash-race.png");
  fs.writeFileSync(trashPayload, "trash payload");
  const manifestPath = path.join(trashDir, "trash-race.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      version: 1,
      trashKey: "trash-race.png",
      originalStorageKey: "newly-referenced.png",
      attachmentId: "att-race",
      state: "PREPARED",
      operationTimestamp: new Date().toISOString(),
      stateChangedAt: new Date(oldTime).toISOString(),
    })
  );

  // DB initially has NO rows
  let dbRows: Array<{ id: string; storageKey: string; transactionId: string | null; cashTransferId: string | null }> = [];
  const mockDb: StorageDatabase = {
    attachment: {
      findMany: async () => dbRows,
    },
  };

  const service = new AttachmentStorageService(tmpDir, mockDb);
  const plan = await service.planReconciliation();
  assert.equal(plan.deleteTrash.length, 1);
  assert.equal(plan.deleteActiveOrphans.length, 1);

  // Race condition: BEFORE applyReconciliation runs, DB gets a row referencing newly-referenced.png!
  dbRows = [{ id: "att-race", storageKey: "newly-referenced.png", transactionId: "tx-2", cashTransferId: null }];

  const result = await service.applyReconciliation(plan);
  assert.equal(result.cleanedTrash, 0, "Trash deletion must be skipped when DB key becomes referenced");
  assert.equal(result.cleanedActive, 0, "Active orphan deletion must be skipped when DB key becomes referenced");
  assert.equal(fs.existsSync(orphanPath), true, "Active file must be preserved");

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
