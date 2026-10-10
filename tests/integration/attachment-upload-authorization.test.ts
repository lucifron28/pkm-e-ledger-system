import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { PrismaClient, CashAccount, Role, TransactionType } from "@prisma/client";
import type { SessionUser } from "../../lib/auth/session";

const testDbPath = path.join(__dirname, "temp_attachment_upload_authorization.db");
const dbUrl = `file:${testDbPath}`;
const uploadsRoot = path.join(__dirname, "temp_attachment_upload_authorization_uploads");

let prisma: PrismaClient;
let actor: SessionUser & { organizationId: string };
let termId: string;
let categoryId: string;
let storage: typeof import("../../lib/infrastructure/storage/attachment-store").defaultAttachmentStorageService;
let recordAuthorization: typeof import("../../lib/infrastructure/storage/attachment-verification").recordUploadAuthorization;
let verifyUpload: typeof import("../../lib/infrastructure/storage/attachment-verification").verifyAndSecureAttachmentStorage;
let consumeAuthorization: typeof import("../../lib/infrastructure/storage/attachment-verification").consumeUploadAuthorization;
let createTransaction: typeof import("../../lib/application/transactions").createTransactionService;
let downloadAttachment: typeof import("../../app/api/attachments/[id]/route").handleAttachmentDownloadRequest;
let withTransientRetry: typeof import("../../lib/infrastructure/db/retry").withTransientRetry;

const previousEnv = {
  databaseUrl: process.env.DATABASE_URL,
  uploadsDir: process.env.UPLOADS_DIR,
  storageProvider: process.env.ATTACHMENT_STORAGE_PROVIDER,
  blobToken: process.env.BLOB_READ_WRITE_TOKEN,
  vercel: process.env.VERCEL,
};

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test.before(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.UPLOADS_DIR = uploadsRoot;
  process.env.ATTACHMENT_STORAGE_PROVIDER = "local";
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL;

  fs.rmSync(testDbPath, { force: true });
  fs.rmSync(uploadsRoot, { recursive: true, force: true });
  fs.mkdirSync(uploadsRoot, { recursive: true });

  execSync(
    `node scripts/migrate.js --deploy --db-url "${dbUrl}" --uploads-root "${uploadsRoot}"`,
    {
      cwd: path.join(__dirname, "../.."),
      env: { ...process.env, DATABASE_URL: dbUrl, UPLOADS_DIR: uploadsRoot },
      stdio: "ignore",
    }
  );

  delete (globalThis as { prisma?: unknown }).prisma;
  const dbModule = await import("../../lib/db/prisma");
  const storageModule = await import("../../lib/infrastructure/storage/attachment-store");
  const verificationModule = await import("../../lib/infrastructure/storage/attachment-verification");
  const transactionModule = await import("../../lib/application/transactions");
  const downloadModule = await import("../../app/api/attachments/[id]/route");
  const retryModule = await import("../../lib/infrastructure/db/retry");

  prisma = dbModule.prisma as unknown as PrismaClient;
  storage = storageModule.defaultAttachmentStorageService;
  recordAuthorization = verificationModule.recordUploadAuthorization;
  verifyUpload = verificationModule.verifyAndSecureAttachmentStorage;
  consumeAuthorization = verificationModule.consumeUploadAuthorization;
  createTransaction = transactionModule.createTransactionService;
  downloadAttachment = downloadModule.handleAttachmentDownloadRequest;
  withTransientRetry = retryModule.withTransientRetry;

  const organization = await prisma.organization.create({
    data: { name: "Isolated Upload Test Org", slug: "isolated-upload-test-org", active: true },
  });
  const user = await prisma.user.create({
    data: {
      fullName: "Isolated Test Treasurer",
      username: "isolated_upload_treasurer",
      passwordHash: "test-only-hash",
      role: Role.TREASURER,
      organizationId: organization.id,
      active: true,
    },
  });
  actor = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    organizationId: organization.id,
    organizationName: organization.name,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
  };

  const term = await prisma.academicTerm.create({
    data: {
      organizationId: organization.id,
      academicYear: "2026-2027",
      semester: "FIRST_SEMESTER",
      active: true,
      openingCashOnHandCents: 100_000,
      openingCashInBankCents: 100_000,
    },
  });
  termId = term.id;
  const category = await prisma.transactionCategory.create({
    data: { name: "Isolated Test Income", type: TransactionType.INCOME, active: true },
  });
  categoryId = category.id;
});

test.after(async () => {
  await prisma?.$disconnect();
  fs.rmSync(testDbPath, { force: true });
  fs.rmSync(`${testDbPath}-wal`, { force: true });
  fs.rmSync(`${testDbPath}-shm`, { force: true });
  fs.rmSync(uploadsRoot, { recursive: true, force: true });
  restoreEnv("DATABASE_URL", previousEnv.databaseUrl);
  restoreEnv("UPLOADS_DIR", previousEnv.uploadsDir);
  restoreEnv("ATTACHMENT_STORAGE_PROVIDER", previousEnv.storageProvider);
  restoreEnv("BLOB_READ_WRITE_TOKEN", previousEnv.blobToken);
  restoreEnv("VERCEL", previousEnv.vercel);
});

async function stageAuthorizedPdf(label: string, bytes = Buffer.from("%PDF-1.7 isolated upload")) {
  const staged = await storage.stageUpload(bytes, `${label}.pdf`, "application/pdf");
  const storageKey = `${staged.stageId}.${staged.extension}`;
  await recordAuthorization({
    uploadId: staged.stageId,
    userId: actor.id,
    organizationId: actor.organizationId,
    storageKey,
    originalName: `${label}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: bytes.length,
  });
  return { staged, storageKey, bytes };
}

test("Upload authorization binds exact reference, user, organization, and metadata", async () => {
  const { staged, storageKey, bytes } = await stageAuthorizedPdf("bound-reference");

  await assert.rejects(
    verifyUpload(
      {
        storageKey: `${staged.stageId}.png`,
        originalName: "bound-reference.png",
        mimeType: "image/png",
        sizeBytes: bytes.length,
      },
      actor
    ),
    /does not match its authorized upload reference/
  );
  await assert.rejects(
    verifyUpload(
      {
        storageKey,
        originalName: "substituted-name.pdf",
        mimeType: "application/pdf",
        sizeBytes: bytes.length,
      },
      actor
    ),
    /does not match its authorized upload reference/
  );
  await assert.rejects(
    verifyUpload(
      { storageKey, originalName: "bound-reference.pdf", mimeType: "application/pdf", sizeBytes: bytes.length },
      { ...actor, id: "different-user-id" }
    ),
    /Upload authorization not found/
  );
  await assert.rejects(
    verifyUpload(
      { storageKey, originalName: "bound-reference.pdf", mimeType: "application/pdf", sizeBytes: bytes.length },
      { ...actor, organizationId: "different-organization-id" }
    ),
    /different organization/
  );

  const pendingReceipt = await prisma.commandReceipt.findUniqueOrThrow({
    where: { actorUserId_idempotencyKey: { actorUserId: actor.id, idempotencyKey: `upload-auth-${staged.stageId}` } },
  });
  assert.equal(pendingReceipt.status, "PENDING", "Rejected substitutions must not consume authorization");

  const authorized = await verifyUpload(
    { storageKey, originalName: "bound-reference.pdf", mimeType: "application/pdf", sizeBytes: bytes.length },
    actor
  );
  assert.equal(authorized.storageKey, storageKey);
  assert.equal(authorized.isLocalStaged, true);
});

test("Completed upload authorization cannot be reset or replayed", async () => {
  const { staged, storageKey, bytes } = await stageAuthorizedPdf("replay-guard");
  const auth = await prisma.commandReceipt.findUniqueOrThrow({
    where: { actorUserId_idempotencyKey: { actorUserId: actor.id, idempotencyKey: `upload-auth-${staged.stageId}` } },
  });
  await prisma.$transaction((tx) => consumeAuthorization(tx, {
    userId: actor.id,
    organizationId: actor.organizationId,
    uploadId: staged.stageId,
    requestHash: auth.requestHash,
    attachmentId: "consumed-attachment",
  }));

  await assert.rejects(
    recordAuthorization({
      uploadId: staged.stageId,
      userId: actor.id,
      organizationId: actor.organizationId,
      storageKey,
      originalName: "replay-guard.pdf",
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
    }),
    /already used or does not match/
  );
  assert.equal((await prisma.commandReceipt.findUniqueOrThrow({ where: { id: auth.id } })).status, "COMPLETED");
  await assert.rejects(
    verifyUpload({ storageKey, originalName: "replay-guard.pdf", mimeType: "application/pdf", sizeBytes: bytes.length }, actor),
    /already been consumed/
  );
});
test("Expired upload authorization is rejected", async () => {
  const { staged, storageKey, bytes } = await stageAuthorizedPdf("expired-authorization");
  await prisma.commandReceipt.update({
    where: {
      actorUserId_idempotencyKey: {
        actorUserId: actor.id,
        idempotencyKey: `upload-auth-${staged.stageId}`,
      },
    },
    data: { leaseExpiresAt: new Date(Date.now() - 1000) },
  });
  await assert.rejects(
    verifyUpload(
      { storageKey, originalName: "expired-authorization.pdf", mimeType: "application/pdf", sizeBytes: bytes.length },
      actor
    ),
    /expired or not pending/
  );
  const expiredReceipt = await prisma.commandReceipt.findUniqueOrThrow({
    where: {
      actorUserId_idempotencyKey: {
        actorUserId: actor.id,
        idempotencyKey: `upload-auth-${staged.stageId}`,
      },
    },
  });
  await assert.rejects(
    prisma.$transaction((tx) => consumeAuthorization(tx, {
      userId: actor.id,
      organizationId: actor.organizationId,
      uploadId: staged.stageId,
      requestHash: expiredReceipt.requestHash,
      attachmentId: "expired-consumer",
    })),
    /expired, mismatched, or already consumed/
  );
});

test("Concurrent consumers atomically consume a pending upload authorization once", async () => {
  const { staged } = await stageAuthorizedPdf("concurrent-consume");
  const receipt = await prisma.commandReceipt.findUniqueOrThrow({
    where: { actorUserId_idempotencyKey: { actorUserId: actor.id, idempotencyKey: `upload-auth-${staged.stageId}` } },
  });

  const consume = (attachmentId: string) =>
    withTransientRetry(() => prisma.$transaction((tx) => consumeAuthorization(tx, {
      userId: actor.id,
      organizationId: actor.organizationId,
      uploadId: staged.stageId,
      requestHash: receipt.requestHash,
      attachmentId,
    })));

  const results = await Promise.allSettled([
    consume("attachment-consumer-a"),
    consume("attachment-consumer-b"),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const consumed = await prisma.commandReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
  assert.equal(consumed.status, "COMPLETED");
  assert.ok(
    ["attachment-consumer-a", "attachment-consumer-b"].includes(consumed.resultEntityId || ""),
    "Authorization must identify its single winning consumer"
  );
});

test("Local upload remains retryable after failed financial transaction, then records and downloads once", async () => {
  const { staged, storageKey, bytes } = await stageAuthorizedPdf("retryable-record");
  const invalidDescription = undefined as unknown as string;

  await assert.rejects(createTransaction(actor, {
    termId,
    type: TransactionType.INCOME,
    transactionDate: new Date(),
    amountCents: 250,
    cashAccount: CashAccount.CASH_ON_HAND,
    categoryId,
    counterpartyName: "Test Payer",
    description: invalidDescription,
    referenceDescription: "Test receipt",
    idempotencyKey: `failed-transaction-${staged.stageId}`,
    attachment: { storageKey, originalName: "retryable-record.pdf", mimeType: "application/pdf", sizeBytes: bytes.length },
  }));

  const activePath = storage.resolveActivePath(storageKey);
  assert.equal(fs.existsSync(activePath), true, "Local file remains usable after post-commit transaction rollback");
  assert.equal(
    (await prisma.commandReceipt.findUniqueOrThrow({
      where: { actorUserId_idempotencyKey: { actorUserId: actor.id, idempotencyKey: `upload-auth-${staged.stageId}` } },
    })).status,
    "PENDING",
    "Authorization rolls back with failed financial transaction"
  );

  const successfulInput = {
    termId,
    type: TransactionType.INCOME,
    transactionDate: new Date(),
    amountCents: 250,
    cashAccount: CashAccount.CASH_ON_HAND,
    categoryId,
    counterpartyName: "Test Payer",
    description: "Corrected description and retry",
    referenceDescription: "Test receipt",
    idempotencyKey: `successful-retry-${staged.stageId}`,
    attachment: { storageKey, originalName: "retryable-record.pdf", mimeType: "application/pdf", sizeBytes: bytes.length },
  };
  const created = await createTransaction(actor, successfulInput);
  const duplicate = await createTransaction(actor, successfulInput);
  assert.equal(duplicate.id, created.id, "Financial idempotency retry returns original record after upload authorization consumption");
  const attachment = await prisma.attachment.findFirstOrThrow({ where: { transactionId: created.id } });
  const response = await downloadAttachment(attachment.id, actor, uploadsRoot);
  assert.equal(response.status, 200);
  assert.equal(Buffer.from(await response.arrayBuffer()).equals(bytes), true);

  await prisma.transaction.delete({ where: { id: created.id } });
  await storage.deleteActiveFile(attachment.storageKey);
});
