import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAttachmentFile,
  validateFileMagicBytes,
  validateAndReadAttachmentFile,
} from "../../lib/domain/attachments";

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
