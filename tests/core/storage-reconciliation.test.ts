import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { AttachmentStorageService } from "../../lib/infrastructure/storage/attachment-store";

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

  const mockDb = {
    attachment: {
      findMany: async () => [
        { id: "att-1", storageKey: "active-1.png", transactionId: "tx-1", cashTransferId: null },
      ],
    },
  };

  const service = new AttachmentStorageService(tmpDir, mockDb as any);
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
  const mockDb = {
    attachment: {
      findMany: async () => {
        throw new Error("Database unavailable");
      },
    },
  };

  const service = new AttachmentStorageService(tmpDir, mockDb as any);
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
