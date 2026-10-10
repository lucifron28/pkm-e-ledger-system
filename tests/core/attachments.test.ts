import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import fs from "fs";
import {
  validateAttachmentFile,
  validateFileMagicBytes,
  validateAndReadAttachmentFile,
  validateAttachmentMetadata,
} from "../../lib/domain/attachments";
import { validateUploadFile } from "../../lib/infrastructure/storage/client-upload";
import {
  AttachmentStorageService,
  StorageDatabase,
  isBlobStorageKey,
  isVercelBlobConfigured,
  getBlobAccess,
  getDefaultUploadsRoot,
} from "../../lib/infrastructure/storage/attachment-store";
import { AccessDeniedError, ValidationError } from "../../lib/domain/errors";
import { verifyAndSecureAttachmentStorage } from "../../lib/infrastructure/storage/attachment-verification";
import { Role } from "@prisma/client";
import type { SessionUser } from "../../lib/auth/session";

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

test("Attachment Domain: validateAttachmentMetadata accepts valid metadata and rejects invalid", () => {
  assert.equal(validateAttachmentMetadata("receipt.jpg", "image/jpeg", 1024), null);
  assert.equal(validateAttachmentMetadata("invoice.pdf", "application/pdf", 5 * 1024 * 1024), null);
  assert.equal(validateAttachmentMetadata("photo.png", "image/png", 2048), null);

  assert.equal(validateAttachmentMetadata("empty.pdf", "application/pdf", 0), "File is required.");
  assert.equal(validateAttachmentMetadata("huge.pdf", "application/pdf", 11 * 1024 * 1024), "File must be under 10 MB.");
  assert.equal(validateAttachmentMetadata("script.js", "application/javascript", 1024), "Only JPEG, PNG, and PDF files are allowed.");
  assert.equal(validateAttachmentMetadata("doc.pdf", "image/jpeg", 1024), "File extension does not match its MIME type.");
});

test("Attachment Client Upload: validateUploadFile enforces size and type checks", () => {
  const validFile = new File(["hello"], "scan.pdf", { type: "application/pdf" });
  assert.equal(validateUploadFile(validFile), null);

  const emptyFile = new File([], "empty.png", { type: "image/png" });
  assert.equal(validateUploadFile(emptyFile), "Please select a file to upload.");

  const largeBuffer = new Uint8Array(11 * 1024 * 1024);
  const oversizedFile = new File([largeBuffer], "big.jpg", { type: "image/jpeg" });
  assert.match(validateUploadFile(oversizedFile) || "", /exceeds maximum limit of 10 MB/);

  const invalidTypeFile = new File(["test"], "data.csv", { type: "text/csv" });
  assert.match(validateUploadFile(invalidTypeFile) || "", /Unsupported file format/);
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

test("Attachment Storage: Vercel Blob detection and environment helpers", () => {
  assert.equal(isBlobStorageKey("https://public.blob.vercel-storage.com/attachments/test.png"), true);
  assert.equal(isBlobStorageKey("http://localhost:3000/blob.png"), true);
  assert.equal(isBlobStorageKey("550e8400-e29b-41d4-a716-446655440000.png"), false);
  assert.equal(isBlobStorageKey("receipt.pdf"), false);

  const prevToken = process.env.BLOB_READ_WRITE_TOKEN;
  const prevProvider = process.env.ATTACHMENT_STORAGE_PROVIDER;
  const prevVercel = process.env.VERCEL;
  try {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.ATTACHMENT_STORAGE_PROVIDER;
    assert.equal(isVercelBlobConfigured(), false);

    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    assert.equal(isVercelBlobConfigured(), true);

    process.env.ATTACHMENT_STORAGE_PROVIDER = "local";
    assert.equal(isVercelBlobConfigured(), false);

    delete process.env.ATTACHMENT_STORAGE_PROVIDER;
    process.env.VERCEL = "1";
    assert.ok(getDefaultUploadsRoot().length > 0);

    assert.equal(getBlobAccess(), "private");
    process.env.BLOB_ACCESS = "public";
    assert.equal(getBlobAccess(), "public");
    process.env.BLOB_ACCESS = "private";
    assert.equal(getBlobAccess(), "private");
    delete process.env.BLOB_ACCESS;
  } finally {
    delete process.env.BLOB_ACCESS;
    if (prevToken !== undefined) process.env.BLOB_READ_WRITE_TOKEN = prevToken;
    else delete process.env.BLOB_READ_WRITE_TOKEN;
    if (prevProvider !== undefined) process.env.ATTACHMENT_STORAGE_PROVIDER = prevProvider;
    else delete process.env.ATTACHMENT_STORAGE_PROVIDER;
    if (prevVercel !== undefined) process.env.VERCEL = prevVercel;
    else delete process.env.VERCEL;
  }
});

test("Attachment Storage: Blob storage keys protection and trash lifecycle", async () => {
  const sandboxUploads = path.join(__dirname, "temp_storage_blob_test");
  if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  const blobUrl = "https://public.blob.vercel-storage.com/attachments/sample-123.png";

  const db: StorageDatabase = {
    attachment: {
      findMany: async () => [
        { id: "att-blob-1", storageKey: blobUrl, transactionId: "tx-blob-1", cashTransferId: null },
      ],
    },
  };

  const store = new AttachmentStorageService(sandboxUploads, db, false);

  try {
    // resolveActivePath must reject cloud URLs
    assert.throws(
      () => store.resolveActivePath(blobUrl),
      (err: unknown) => err instanceof ValidationError && /Cannot resolve local filesystem path/i.test(err.message)
    );

    // moveToTrash creates a blob trash manifest without touching local disk files
    const trashKey = await store.moveToTrash(blobUrl, {
      attachmentId: "att-blob-1",
      transactionId: "tx-blob-1",
    });
    assert.ok(trashKey.startsWith("blob-trash_"));

    const manifestPath = path.join(store.getTrashDir(), `${trashKey}.json`);
    assert.equal(fs.existsSync(manifestPath), true, "Blob trash manifest must be written");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { originalStorageKey: string };
    assert.equal(manifest.originalStorageKey, blobUrl);

    // restoreFromTrash removes manifest
    await store.restoreFromTrash(trashKey, blobUrl);
    assert.equal(fs.existsSync(manifestPath), false, "Blob trash manifest must be unlinked on restore");

    // planReconciliation does NOT flag blob storage keys as missingDbFiles
    const plan = await store.planReconciliation(0);
    assert.equal(plan.missingDbFiles.length, 0, "Cloud blob keys must not be flagged as missing on disk");
  } finally {
    if (fs.existsSync(sandboxUploads)) fs.rmSync(sandboxUploads, { recursive: true, force: true });
  }
});

test("Attachment Direct Upload: Direct blob keys are identified and metadata is validated", () => {
  const cloudKey = "https://public.blob.vercel-storage.com/attachments/uploaded-file.pdf";
  assert.equal(isBlobStorageKey(cloudKey), true);
  assert.equal(isBlobStorageKey("local-file-key.pdf"), false);

  assert.equal(validateAttachmentMetadata("uploaded-file.pdf", "application/pdf", 1024), null);
  assert.match(
    validateAttachmentMetadata("uploaded-file.pdf", "application/pdf", 12 * 1024 * 1024) || "",
    /under 10 MB/
  );
});

const mockUser: SessionUser = {
  id: "user-1",
  username: "test_user",
  fullName: "Test User",
  role: Role.TREASURER,
  organizationId: "org-alpha",
  organizationName: "Org Alpha",
  active: true,
  mustChangePassword: false,
};

test("Attachment Security: Rejects arbitrary third-party storage URLs", async () => {
  await assert.rejects(
    async () => {
      await verifyAndSecureAttachmentStorage(
        {
          storageKey: "https://evil.com/attachments/org-alpha/malware.pdf",
          originalName: "malware.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
        mockUser
      );
    },
    (err: unknown) =>
      err instanceof ValidationError && /untrusted storage host/i.test(err.message)
  );
});

test("Attachment Security: Rejects cross-organization attachment URLs", async () => {
  await assert.rejects(
    async () => {
      await verifyAndSecureAttachmentStorage(
        {
          storageKey:
            "https://test.public.blob.vercel-storage.com/attachments/other-org-beta/receipt.pdf",
          originalName: "receipt.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        },
        mockUser
      );
    },
    (err: unknown) =>
      err instanceof AccessDeniedError && /does not belong to your organization/i.test(err.message)
  );
});

test("Attachment Security: Rejects spoofed file content signature on staged files", async () => {
  const uploadsRoot = getDefaultUploadsRoot();
  const stagingDir = path.join(uploadsRoot, "staging");
  if (!fs.existsSync(stagingDir)) fs.mkdirSync(stagingDir, { recursive: true });

  const spoofedFileName = `spoofed-${Date.now()}.pdf`;
  const spoofedFilePath = path.join(stagingDir, spoofedFileName);
  fs.writeFileSync(spoofedFilePath, Buffer.from("NOT_A_REAL_PDF_FILE"));

  try {
    await assert.rejects(
      async () => {
        await verifyAndSecureAttachmentStorage(
          {
            storageKey: spoofedFilePath,
            originalName: "spoofed.pdf",
            mimeType: "application/pdf",
            sizeBytes: 19,
          },
          mockUser
        );
      },
      (err: unknown) =>
        err instanceof ValidationError && /signature does not match/i.test(err.message)
    );
  } finally {
    if (fs.existsSync(spoofedFilePath)) fs.unlinkSync(spoofedFilePath);
  }
});

test("Attachment Security: Accepts valid staged PDF with valid magic bytes", async () => {
  const uploadsRoot = getDefaultUploadsRoot();
  const stagingDir = path.join(uploadsRoot, "staging");
  if (!fs.existsSync(stagingDir)) fs.mkdirSync(stagingDir, { recursive: true });

  const validFileName = `valid-${Date.now()}.pdf`;
  const validFilePath = path.join(stagingDir, validFileName);
  const validPdfHeader = Buffer.from("%PDF-1.7 valid content for testing");
  fs.writeFileSync(validFilePath, validPdfHeader);

  try {
    const verified = await verifyAndSecureAttachmentStorage(
      {
        storageKey: validFilePath,
        originalName: "valid.pdf",
        mimeType: "application/pdf",
        sizeBytes: validPdfHeader.length,
      },
      mockUser
    );
    assert.equal(verified.originalName, "valid.pdf");
    assert.equal(verified.sizeBytes, validPdfHeader.length);
    assert.equal(verified.mimeType, "application/pdf");
  } finally {
    if (fs.existsSync(validFilePath)) fs.unlinkSync(validFilePath);
  }
});
