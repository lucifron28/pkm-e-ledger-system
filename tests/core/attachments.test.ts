import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import fs from "fs";
import {
  validateAttachmentFile,
  validateFileMagicBytes,
  validateAndReadAttachmentFile,
} from "../../lib/domain/attachments";
import { AttachmentStorageService, StorageDatabase } from "../../lib/infrastructure/storage/attachment-store";
import { ValidationError } from "../../lib/domain/errors";

test("Attachment Domain: Valid MIME types and file extensions", () => {
  const validFile = new File(["dummy content"], "receipt.jpg", { type: "image/jpeg" });
  assert.equal(validateAttachmentFile(validFile), null);

  const validPng = new File(["dummy content"], "receipt.png", { type: "image/png" });
  assert.equal(validateAttachmentFile(validPng), null);

  const validPdf = new File(["dummy content"], "report.pdf", { type: "application/pdf" });
  assert.equal(validateAttachmentFile(validPdf), null);
});

test("Attachment Domain: Invalid MIME types and extension mismatches", () => {
  const invalidExe = new File(["dummy content"], "malware.exe", { type: "application/x-msdownload" });
  assert.equal(validateAttachmentFile(invalidExe), "Only JPEG, PNG, and PDF files are allowed.");

  const mismatch = new File(["dummy content"], "receipt.png", { type: "image/jpeg" });
  assert.equal(validateAttachmentFile(mismatch), "File extension does not match its MIME type.");
});

test("Attachment Domain: File size limits (0 byte and > 10MB)", () => {
  const emptyFile = new File([], "empty.pdf", { type: "application/pdf" });
  assert.equal(validateAttachmentFile(emptyFile), "File is required.");

  const largeBuffer = new Uint8Array(11 * 1024 * 1024);
  const largeFile = new File([largeBuffer], "large.pdf", { type: "application/pdf" });
  assert.equal(validateAttachmentFile(largeFile), "File must be under 10 MB.");
});

test("Attachment Domain: Magic bytes signature validation - JPEG", () => {
  const validJpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  assert.ok(validateFileMagicBytes(validJpegHeader, "image/jpeg"));

  const spoofedJpeg = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
  assert.equal(validateFileMagicBytes(spoofedJpeg, "image/jpeg"), false);
});

test("Attachment Domain: Magic bytes signature validation - Full 8-byte PNG", () => {
  const validPngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(validateFileMagicBytes(validPngHeader, "image/png"));

  const partialPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
  assert.equal(validateFileMagicBytes(partialPng, "image/png"), false);
});

test("Attachment Domain: Magic bytes signature validation - PDF %PDF", () => {
  const validPdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  assert.ok(validateFileMagicBytes(validPdfHeader, "application/pdf"));

  const spoofedPdf = new Uint8Array([0x41, 0x42, 0x43, 0x44]);
  assert.equal(validateFileMagicBytes(spoofedPdf, "application/pdf"), false);
});

test("Attachment Domain: validateAndReadAttachmentFile rejects spoofed attachment", async () => {
  const spoofedPngContent = new TextEncoder().encode("NOT A REAL PNG FILE CONTENT");
  const spoofedFile = new File([spoofedPngContent], "fake_invoice.png", { type: "image/png" });

  const result = await validateAndReadAttachmentFile(spoofedFile);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error, "File content signature does not match its declared type.");
  }

  const validPngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const validFile = new File([validPngBytes], "valid_invoice.png", { type: "image/png" });
  const validResult = await validateAndReadAttachmentFile(validFile);
  assert.equal(validResult.success, true);
  if (validResult.success) {
    assert.equal(validResult.data.originalName, "valid_invoice.png");
    assert.equal(validResult.data.extension, "png");
    assert.equal(validResult.data.buffer.length, 10);
  }
});

test("Attachment Storage: Staging, commit, trash, and restoration lifecycle in temp sandbox", async () => {
  const sandboxUploads = path.join(__dirname, "temp_storage_unit_test");
  if (fs.existsSync(sandboxUploads)) {
    fs.rmSync(sandboxUploads, { recursive: true, force: true });
  }
  const store = new AttachmentStorageService(sandboxUploads);

  try {
    const fileBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const staged = await store.stageUpload(fileBuffer, "sample_receipt.png", "image/png");

    assert.ok(fs.existsSync(staged.stagedPath), "Staged file must exist in staging directory");

    const committed = await store.commitUpload(staged.stageId, staged.extension);
    assert.equal(fs.existsSync(staged.stagedPath), false, "Staged file must be moved out of staging");
    const activePath = store.resolveActivePath(committed.storageKey);
    assert.ok(fs.existsSync(activePath), "Committed file must exist in storage path");

    const trashKey = await store.moveToTrash(committed.storageKey, { attachmentId: "att-1", transactionId: "tx-1" });
    assert.equal(fs.existsSync(activePath), false, "Active storage path must be cleared when moved to trash");
    const manifestPath = path.join(store.getTrashDir(), `${path.basename(trashKey, path.extname(trashKey))}.json`);
    const movedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { state: string };
    assert.equal(movedManifest.state, "MOVED");

    await store.restoreFromTrash(trashKey, committed.storageKey);
    assert.ok(fs.existsSync(activePath), "Restored file must return to active storage path");

    const resolved = store.resolveActivePath(committed.storageKey);
    assert.equal(resolved, activePath);

    // Directory traversal is safely stripped by path.basename
    const sanitizedPath = store.resolveActivePath("../../../etc/passwd");
    assert.equal(sanitizedPath, path.resolve(sandboxUploads, "passwd"));

    assert.throws(
      () => store.resolveActivePath("   "),
      (err: unknown) => err instanceof ValidationError
    );
  } finally {
    if (fs.existsSync(sandboxUploads)) {
      fs.rmSync(sandboxUploads, { recursive: true, force: true });
    }
  }
});

test("Attachment Storage: reconciliation uses exact manifest mapping and cleans active orphans", async () => {
  const sandboxUploads = path.join(__dirname, "temp_storage_reconcile_test");
  if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  const emptyDatabase: StorageDatabase = { attachment: { findMany: async () => [] } };
  const store = new AttachmentStorageService(sandboxUploads, emptyDatabase);

  try {
    fs.mkdirSync(store.getTrashDir(), { recursive: true });
    fs.writeFileSync(path.join(store.getTrashDir(), "unmapped.pdf"), "not mapped");
    const activeOrphan = path.join(sandboxUploads, "orphan.png");
    fs.writeFileSync(activeOrphan, "orphan");
    const old = new Date(Date.now() - 10_000);
    fs.utimesSync(activeOrphan, old, old);

    const result = await store.reconcile(0);
    assert.equal(result.cleanedActive, 1);
    assert.equal(fs.existsSync(activeOrphan), false);
    assert.equal(fs.existsSync(path.join(store.getTrashDir(), "unmapped.pdf")), true);
  } finally {
    if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  }
});

test("Attachment Storage: reconciliation repairs a crash after move before state advance", async () => {
  const sandboxUploads = path.join(__dirname, "temp_storage_prepared_test");
  if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  const db: StorageDatabase = {
    attachment: {
      findMany: async () => [{ id: "att-crash", storageKey: "crash.png", transactionId: "tx-crash", cashTransferId: null }],
    },
  };
  const store = new AttachmentStorageService(sandboxUploads, db);

  try {
    fs.mkdirSync(store.getTrashDir(), { recursive: true });
    const trashKey = "crash-trash.png";
    const old = new Date(Date.now() - 10_000).toISOString();
    fs.writeFileSync(path.join(store.getTrashDir(), trashKey), "crash-receipt");
    fs.writeFileSync(
      path.join(store.getTrashDir(), "crash-trash.json"),
      JSON.stringify({
        version: 1,
        state: "PREPARED",
        trashKey,
        originalStorageKey: "crash.png",
        attachmentId: "att-crash",
        transactionId: "tx-crash",
        cashTransferId: null,
        operationTimestamp: old,
        stateChangedAt: old,
      })
    );

    await store.reconcile(0);

    assert.equal(fs.readFileSync(store.resolveActivePath("crash.png"), "utf8"), "crash-receipt");
    assert.equal(fs.existsSync(path.join(store.getTrashDir(), trashKey)), false);
    assert.equal(fs.existsSync(path.join(store.getTrashDir(), "crash-trash.json")), false);
  } finally {
    if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  }
});

test("Attachment Storage: database lookup failure fails closed without cleanup", async () => {
  const sandboxUploads = path.join(__dirname, "temp_storage_reconcile_fail_closed");
  if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  const failingDatabase: StorageDatabase = {
    attachment: {
      findMany: async () => {
        throw new Error("database unavailable");
      },
    },
  };
  const store = new AttachmentStorageService(sandboxUploads, failingDatabase);

  try {
    fs.mkdirSync(store.getStagingDir(), { recursive: true });
    const stagedPath = path.join(store.getStagingDir(), "stale.png");
    fs.writeFileSync(stagedPath, "staged");
    fs.writeFileSync(path.join(sandboxUploads, "active.png"), "active");
    const result = await store.reconcile(0);
    assert.deepEqual(result, { cleanedStaged: 0, cleanedTrash: 0, cleanedActive: 0, missingDbFiles: [] });
    assert.equal(fs.existsSync(stagedPath), true);
    assert.equal(fs.existsSync(path.join(sandboxUploads, "active.png")), true);
  } finally {
    if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  }
});

test("Attachment Storage: reconciliation cleans stale manifest when trash file is missing but active file exists", async () => {
  const sandboxUploads = path.join(__dirname, "temp_storage_missing_trash_file");
  if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  const db: StorageDatabase = {
    attachment: {
      findMany: async () => [{ id: "att-1", storageKey: "active.png", transactionId: "tx-1", cashTransferId: null }],
    },
  };
  const store = new AttachmentStorageService(sandboxUploads, db);

  try {
    fs.mkdirSync(store.getTrashDir(), { recursive: true });
    fs.writeFileSync(store.resolveActivePath("active.png"), "active-content");
    // Create orphan manifest whose referenced trash file was lost/deleted
    const manifestPath = path.join(store.getTrashDir(), "lost-trash.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        state: "PREPARED",
        trashKey: "nonexistent-trash.png",
        originalStorageKey: "active.png",
        attachmentId: "att-1",
        transactionId: "tx-1",
        cashTransferId: null,
        operationTimestamp: new Date().toISOString(),
        stateChangedAt: new Date().toISOString(),
      })
    );

    const result = await store.reconcile(0);
    assert.equal(result.cleanedTrash, 1);
    assert.equal(fs.existsSync(manifestPath), false, "Stale manifest must be unlinked");
    assert.equal(fs.existsSync(store.resolveActivePath("active.png")), true, "Active file remains intact");
  } finally {
    if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  }
});

test("Attachment Storage: reconciliation reports missing files when uploadsRoot directory does not exist", async () => {
  const nonexistentRoot = path.join(__dirname, "temp_nonexistent_uploads_root");
  if (fs.existsSync(nonexistentRoot)) fs.rmSync(nonexistentRoot, { recursive: true, force: true });
  const db: StorageDatabase = {
    attachment: {
      findMany: async () => [
        { id: "att-1", storageKey: "missing-1.png", transactionId: "tx-1", cashTransferId: null },
        { id: "att-2", storageKey: "missing-2.png", transactionId: "tx-2", cashTransferId: null },
      ],
    },
  };
  const store = new AttachmentStorageService(nonexistentRoot, db);

  const result = await store.reconcile(0);
  assert.deepEqual(result.missingDbFiles.sort(), ["missing-1.png", "missing-2.png"]);
});

test("Attachment Storage: reconciliation cleans stale MOVED manifest when trash file is missing but active file exists", async () => {
  const sandboxUploads = path.join(__dirname, "temp_storage_missing_trash_moved");
  if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  const db: StorageDatabase = {
    attachment: {
      findMany: async () => [{ id: "att-1", storageKey: "active.png", transactionId: "tx-1", cashTransferId: null }],
    },
  };
  const store = new AttachmentStorageService(sandboxUploads, db);

  try {
    fs.mkdirSync(store.getTrashDir(), { recursive: true });
    fs.writeFileSync(store.resolveActivePath("active.png"), "active-content");
    const manifestPath = path.join(store.getTrashDir(), "lost-moved.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        state: "MOVED",
        trashKey: "nonexistent-moved.png",
        originalStorageKey: "active.png",
        attachmentId: "att-1",
        transactionId: "tx-1",
        cashTransferId: null,
        operationTimestamp: new Date().toISOString(),
        stateChangedAt: new Date().toISOString(),
      })
    );

    const result = await store.reconcile(0);
    assert.equal(result.cleanedTrash, 1);
    assert.equal(fs.existsSync(manifestPath), false, "Stale MOVED manifest must be unlinked");
    assert.equal(fs.existsSync(store.resolveActivePath("active.png")), true, "Active file remains intact");
  } finally {
    if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  }
});

test("Attachment Storage: reconciliation completes a crash after state advance and never leaves the restoration manifest", async () => {
  const sandboxUploads = path.join(__dirname, "temp_storage_moved_crash");
  if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  const db: StorageDatabase = {
    attachment: {
      findMany: async () => [{ id: "att-1", storageKey: "crash-moved.png", transactionId: "tx-1", cashTransferId: null }],
    },
  };
  const store = new AttachmentStorageService(sandboxUploads, db);

  try {
    fs.mkdirSync(store.getTrashDir(), { recursive: true });
    const trashKey = "moved-trash.png";
    const old = new Date(Date.now() - 10_000).toISOString();
    fs.writeFileSync(path.join(store.getTrashDir(), trashKey), "crash-receipt");
    fs.writeFileSync(
      path.join(store.getTrashDir(), "moved-trash.json"),
      JSON.stringify({
        version: 1,
        state: "MOVED",
        trashKey,
        originalStorageKey: "crash-moved.png",
        attachmentId: "att-1",
        transactionId: "tx-1",
        cashTransferId: null,
        operationTimestamp: old,
        stateChangedAt: old,
      })
    );

    await store.reconcile(0);

    assert.equal(fs.readFileSync(store.resolveActivePath("crash-moved.png"), "utf8"), "crash-receipt", "Active file must be restored from trash");
    assert.equal(fs.existsSync(path.join(store.getTrashDir(), trashKey)), false, "Trash file must be consumed by restoration");
    assert.equal(fs.existsSync(path.join(store.getTrashDir(), "moved-trash.json")), false, "Restoration manifest must not be left behind");
  } finally {
    if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  }
});
