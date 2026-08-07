import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { PrismaClient, Role, ExpenseReportBucket } from "@prisma/client";
import type { SessionUser } from "../../lib/auth/session";

// Production modules are NEVER statically imported here: they transitively
// import lib/db/prisma.ts, which instantiates the global Prisma singleton at
// import time. They are dynamically imported in test.before AFTER DATABASE_URL
// points at the isolated temporary database.
type AttachmentHandler = typeof import("../../app/api/attachments/[id]/route").handleAttachmentDownloadRequest;
type PdfHandler = typeof import("../../app/api/reports/[termId]/pdf/route").handleReportPdfExportRequest;
type ExcelHandler = typeof import("../../app/api/reports/[termId]/excel/route").handleReportExcelExportRequest;

const testDbPath = path.join(__dirname, "temp_security_routes_test.db");
const dbUrl = `file:${testDbPath}`;
const sandboxUploadsDir = path.join(__dirname, "temp_security_uploads");
const sampleFileName = "security_test_sample.png";
const sampleFilePath = path.join(sandboxUploadsDir, sampleFileName);

let handleAttachmentDownloadRequest: AttachmentHandler | null = null;
let handleReportPdfExportRequest: PdfHandler | null = null;
let handleReportExcelExportRequest: ExcelHandler | null = null;

let termAId = "";
let attAId = "";
let txAId = "";

const treasurerActor: SessionUser = {
  id: "user-treasurer-a",
  fullName: "Treasurer A",
  username: "treasurer_a",
  role: Role.TREASURER,
  organizationId: "",
  organizationName: "Org A",
  active: true,
  mustChangePassword: false,
};

const officerActor: SessionUser = {
  id: "user-officer-a",
  fullName: "Officer A",
  username: "officer_a",
  role: Role.OFFICER,
  organizationId: "",
  organizationName: "Org A",
  active: true,
  mustChangePassword: false,
};

const memberActor: SessionUser = {
  id: "user-member-a",
  fullName: "Member A",
  username: "member_a",
  role: Role.MEMBER,
  organizationId: "",
  organizationName: "Org A",
  active: true,
  mustChangePassword: false,
};

const treasurerBActor: SessionUser = {
  id: "user-treasurer-b",
  fullName: "Treasurer B",
  username: "treasurer_b",
  role: Role.TREASURER,
  organizationId: "",
  organizationName: "Org B",
  active: true,
  mustChangePassword: false,
};

const osaActor: SessionUser = {
  id: "user-osa",
  fullName: "OSA Monitor",
  username: "osa_user",
  role: Role.OSA,
  organizationId: null,
  organizationName: null,
  active: true,
  mustChangePassword: false,
};

test.before(async () => {
  // 1. Configure the isolated temporary database FIRST
  process.env.DATABASE_URL = dbUrl;

  // 2. Scaffold the isolated database with the real Prisma schema
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  fs.writeFileSync(testDbPath, Buffer.alloc(0));
  execSync(`node scripts/migrate.js --deploy --db-url "${dbUrl}" --uploads-root "${sandboxUploadsDir}"`, {
    cwd: path.join(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: dbUrl },
    encoding: "utf8",
    stdio: "ignore",
  });

  // 3. Clear any existing test-process global Prisma singleton
  delete (globalThis as { prisma?: unknown }).prisma;

  // 4. Dynamically import production handlers only after env + db are ready
  const attachmentModule = await import("../../app/api/attachments/[id]/route");
  const pdfModule = await import("../../app/api/reports/[termId]/pdf/route");
  const excelModule = await import("../../app/api/reports/[termId]/excel/route");
  handleAttachmentDownloadRequest = attachmentModule.handleAttachmentDownloadRequest;
  handleReportPdfExportRequest = pdfModule.handleReportPdfExportRequest;
  handleReportExcelExportRequest = excelModule.handleReportExcelExportRequest;

  if (!fs.existsSync(sandboxUploadsDir)) {
    fs.mkdirSync(sandboxUploadsDir, { recursive: true });
  }
  const pngBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
  fs.writeFileSync(sampleFilePath, pngBuffer);

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const orgA = await prisma.organization.create({ data: { name: "Org A", slug: "org-a", active: true } });
    const orgB = await prisma.organization.create({ data: { name: "Org B", slug: "org-b", active: true } });

    treasurerActor.organizationId = orgA.id;
    officerActor.organizationId = orgA.id;
    memberActor.organizationId = orgA.id;
    treasurerBActor.organizationId = orgB.id;

    await prisma.user.create({
      data: {
        id: treasurerActor.id,
        username: treasurerActor.username,
        passwordHash: "dummyhash",
        fullName: treasurerActor.fullName,
        role: treasurerActor.role,
        organizationId: orgA.id,
      },
    });

    const termA = await prisma.academicTerm.create({
      data: { organizationId: orgA.id, academicYear: "2025-2026", semester: "FIRST_SEMESTER", openingCashOnHandCents: 100000, openingCashInBankCents: 200000, active: true },
    });
    termAId = termA.id;

    const catInc = await prisma.transactionCategory.create({
      data: { name: "Membership Fees", type: "INCOME", reportBucket: ExpenseReportBucket.OTHERS, active: true },
    });

    const txA = await prisma.transaction.create({
      data: {
        organizationId: orgA.id,
        termId: termA.id,
        type: "INCOME",
        transactionDate: new Date(),
        amountCents: 50000,
        cashAccount: "CASH_ON_HAND",
        categoryId: catInc.id,
        counterpartyName: "Payor",
        description: "Entry",
        referenceDescription: "Ref",
        eventActivityName: "Event",
        recordedByUserId: treasurerActor.id,
      },
    });
    txAId = txA.id;

    const attA = await prisma.attachment.create({
      data: {
        transactionId: txA.id,
        uploadedById: treasurerActor.id,
        originalName: "receipt.png",
        storageKey: sampleFileName,
        mimeType: "image/png",
        sizeBytes: 10,
      },
    });
    attAId = attA.id;
  } finally {
    await prisma.$disconnect();
  }
});

test.after(async () => {
  // Disconnect the production Prisma singleton and clear it
  try {
    const { prisma } = await import("../../lib/db/prisma");
    await prisma.$disconnect();
  } catch { /* best effort */ }
  delete (globalThis as { prisma?: unknown }).prisma;

  // Clean temporary database, sidecars, and upload sandbox
  for (const file of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`, `${testDbPath}-journal`]) {
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch { /* best effort */ }
  }
  try { if (fs.existsSync(sandboxUploadsDir)) fs.rmSync(sandboxUploadsDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("Security Routes Integration: Production Prisma singleton uses the isolated temporary database", async () => {
  const { prisma } = await import("../../lib/db/prisma");
  try {
    const rows = (await prisma.$queryRawUnsafe("PRAGMA database_list;")) as Array<{ name: string; file: string | null }>;
    const mainRow = rows.find((r) => r.name === "main");
    assert.ok(mainRow, "PRAGMA database_list must contain a main database row");
    assert.ok(mainRow.file, "Main database row must report a file path");

    const activeFile = path.resolve(mainRow.file);
    assert.equal(activeFile, path.resolve(testDbPath), "Production Prisma singleton must target the temporary test database");
    assert.notEqual(activeFile, path.resolve(path.join(__dirname, "../..", "prisma", "dev.db")), "Production Prisma must not target the normal development database");
  } finally {
    await prisma.$disconnect();
  }
});

test("Security Routes Integration: Attachment download authorization and response headers", async () => {
  assert.ok(handleAttachmentDownloadRequest, "Handlers must be loaded by test.before");
  const handler = handleAttachmentDownloadRequest;

  const resOk = await handler(attAId, treasurerActor, sandboxUploadsDir);
  assert.equal(resOk.status, 200);
  assert.equal(resOk.headers.get("Content-Type"), "image/png");
  assert.equal(resOk.headers.get("Cache-Control"), "private, no-store");
  assert.equal(resOk.headers.get("X-Content-Type-Options"), "nosniff");

  const resOfficer = await handler(attAId, officerActor, sandboxUploadsDir);
  assert.equal(resOfficer.status, 403);

  const resMember = await handler(attAId, memberActor, sandboxUploadsDir);
  assert.equal(resMember.status, 403);

  const resOsa = await handler(attAId, osaActor, sandboxUploadsDir);
  assert.equal(resOsa.status, 403, "OSA role must be denied direct attachment download");

  const resOtherOrg = await handler(attAId, treasurerBActor, sandboxUploadsDir);
  assert.equal(resOtherOrg.status, 404);

  const resUnauth = await handler(attAId, null, sandboxUploadsDir);
  assert.equal(resUnauth.status, 401);
});

test("Security Routes Integration: Deleted-transaction attachment rejection", async () => {
  assert.ok(handleAttachmentDownloadRequest, "Handlers must be loaded by test.before");
  const handler = handleAttachmentDownloadRequest;

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await prisma.transaction.update({
      where: { id: txAId },
      data: { deletedAt: new Date(), deleteReason: "Test soft deletion" },
    });

    const resDeleted = await handler(attAId, treasurerActor, sandboxUploadsDir);
    assert.equal(resDeleted.status, 404, "Attachment for soft-deleted transaction must return 404 Attachment not found");
  } finally {
    await prisma.$disconnect();
  }
});

test("Security Routes Integration: PDF export authorization and response headers", async () => {
  assert.ok(handleReportPdfExportRequest, "Handlers must be loaded by test.before");
  const handler = handleReportPdfExportRequest;

  const resOk = await handler(termAId, treasurerActor);
  assert.equal(resOk.status, 200);
  assert.equal(resOk.headers.get("Content-Type"), "application/pdf");
  assert.equal(resOk.headers.get("Cache-Control"), "private, no-store");
  assert.equal(resOk.headers.get("X-Content-Type-Options"), "nosniff");

  const resOfficer = await handler(termAId, officerActor);
  assert.equal(resOfficer.status, 403);

  const resMember = await handler(termAId, memberActor);
  assert.equal(resMember.status, 403);

  const resOsa = await handler(termAId, osaActor);
  assert.equal(resOsa.status, 403, "OSA role must be denied PDF export endpoint");

  const resOtherOrg = await handler(termAId, treasurerBActor);
  assert.equal(resOtherOrg.status, 404);

  const resUnauth = await handler(termAId, null);
  assert.equal(resUnauth.status, 401);
});

test("Security Routes Integration: XLSX export authorization and response headers", async () => {
  assert.ok(handleReportExcelExportRequest, "Handlers must be loaded by test.before");
  const handler = handleReportExcelExportRequest;

  const resOk = await handler(termAId, treasurerActor);
  assert.equal(resOk.status, 200);
  assert.equal(resOk.headers.get("Content-Type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(resOk.headers.get("Cache-Control"), "private, no-store");
  assert.equal(resOk.headers.get("X-Content-Type-Options"), "nosniff");

  const resOfficer = await handler(termAId, officerActor);
  assert.equal(resOfficer.status, 403);

  const resMember = await handler(termAId, memberActor);
  assert.equal(resMember.status, 403);

  const resOsa = await handler(termAId, osaActor);
  assert.equal(resOsa.status, 403, "OSA role must be denied XLSX export endpoint");
});
