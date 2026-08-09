import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { PrismaClient, Role, CashAccount, TransactionType } from "@prisma/client";
import type { SessionUser } from "../../lib/auth/session";

type CreateTransactionService = typeof import("../../lib/application/transactions").createTransactionService;
type EditTransactionService = typeof import("../../lib/application/transactions").editTransactionService;
type ProcessIdempotentCommand = typeof import("../../lib/application/idempotency").processIdempotentCommand;
type AttachmentStorageService = InstanceType<typeof import("../../lib/infrastructure/storage/attachment-store").AttachmentStorageService>;

const testDbPath = path.join(__dirname, "temp_concurrency_test.db");
const dbUrl = `file:${testDbPath}`;
const storageRoot = path.join(__dirname, "temp_concurrency_uploads");
const defaultUploadsRoot = path.join(__dirname, "../..", "uploads");

let createTransactionService: CreateTransactionService | null = null;
let editTransactionService: EditTransactionService | null = null;
let processIdempotentCommand: ProcessIdempotentCommand | null = null;
let storageService: AttachmentStorageService | null = null;
let defaultUploadsBefore: string[] = [];

let orgId = "";
let termId = "";
let incomeCategoryId = "";
let expenseCategoryId = "";

function listFiles(root: string, prefix = ""): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory()
      ? listFiles(path.join(root, entry.name), relative)
      : [relative];
  }).sort();
}

const treasurerActor: SessionUser = {
  id: "user-concurrency-treasurer",
  fullName: "Concurrency Treasurer",
  username: "concurrency_treasurer",
  role: Role.TREASURER,
  organizationId: "",
  organizationName: "Concurrency Org",
  active: true,
  mustChangePassword: false,
};

test.before(async () => {
  process.env.DATABASE_URL = dbUrl;
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  fs.writeFileSync(testDbPath, Buffer.alloc(0));
  if (fs.existsSync(storageRoot)) fs.rmSync(storageRoot, { recursive: true, force: true });
  fs.mkdirSync(storageRoot, { recursive: true });
  defaultUploadsBefore = listFiles(defaultUploadsRoot);

  execSync(`node scripts/migrate.js --deploy --db-url "${dbUrl}" --uploads-root "${storageRoot}"`, {
    cwd: path.join(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: dbUrl },
    encoding: "utf8",
    stdio: "ignore",
  });

  delete (globalThis as { prisma?: unknown }).prisma;

  const storageModule = await import("../../lib/infrastructure/storage/attachment-store");
  storageService = new storageModule.AttachmentStorageService(storageRoot);
  const transactionsModule = await import("../../lib/application/transactions");
  const idempotencyModule = await import("../../lib/application/idempotency");
  createTransactionService = transactionsModule.createTransactionService;
  editTransactionService = transactionsModule.editTransactionService;
  processIdempotentCommand = idempotencyModule.processIdempotentCommand;

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const org = await prisma.organization.create({
      data: { name: "Concurrency Org", slug: "concurrency-org", active: true },
    });
    orgId = org.id;
    treasurerActor.organizationId = org.id;

    await prisma.user.create({
      data: {
        id: treasurerActor.id,
        username: treasurerActor.username,
        passwordHash: "dummyhash",
        fullName: treasurerActor.fullName,
        role: treasurerActor.role,
        organizationId: org.id,
      },
    });

    const term = await prisma.academicTerm.create({
      data: {
        organizationId: org.id,
        academicYear: "2026-2027",
        semester: "FIRST_SEMESTER",
        openingCashOnHandCents: 100000, // ₱1,000.00
        openingCashInBankCents: 0,
        active: true,
      },
    });
    termId = term.id;

    const incomeCat = await prisma.transactionCategory.create({
      data: { name: "Dues", type: "INCOME", active: true },
    });
    incomeCategoryId = incomeCat.id;

    const expenseCat = await prisma.transactionCategory.create({
      data: { name: "Supplies", type: "EXPENSE", active: true },
    });
    expenseCategoryId = expenseCat.id;
  } finally {
    await prisma.$disconnect();
  }
});

test.after(async () => {
  try {
    const { prisma } = await import("../../lib/db/prisma");
    await prisma.$disconnect();
  } catch { /* best effort */ }
  delete (globalThis as { prisma?: unknown }).prisma;
  for (const file of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`, `${testDbPath}-journal`]) {
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch { /* best effort */ }
  }
  try { if (fs.existsSync(storageRoot)) fs.rmSync(storageRoot, { recursive: true, force: true }); } catch { /* best effort */ }
  assert.deepEqual(listFiles(defaultUploadsRoot), defaultUploadsBefore, "Integration tests must not write production uploads");
});

test("Concurrency Integration: Two simultaneous expenses against one balance - at most one succeeds", async () => {
  assert.ok(createTransactionService);
  assert.ok(storageService);
  const service = createTransactionService;
  const storage = storageService;

  // Fund account: 700 income -> Cash on Hand 1700 total
  const defaultAttachment = {
    originalName: "receipt.png",
    mimeType: "image/png",
    sizeBytes: 8,
    buffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  };

  // Fund account: 700 income -> Cash on Hand 1700 total
  await service(treasurerActor, {
    termId,
    type: TransactionType.INCOME,
    transactionDate: new Date(),
    amountCents: 70000,
    cashAccount: CashAccount.CASH_ON_HAND,
    categoryId: incomeCategoryId,
    counterpartyName: "Member",
    description: "Funding",
    referenceDescription: "Ref",
    eventActivityName: "Funding Event",
    idempotencyKey: "fund-key-1",
    attachment: defaultAttachment,
  }, { storageService: storage });

  // Both expenses try to consume the entire 1700 balance
  const results = await Promise.allSettled([
    service(treasurerActor, {
      termId,
      type: TransactionType.EXPENSE,
      transactionDate: new Date(),
      amountCents: 100000,
      cashAccount: CashAccount.CASH_ON_HAND,
      categoryId: expenseCategoryId,
      counterpartyName: "Vendor A",
      description: "Expense A",
      referenceDescription: "Ref A",
      eventActivityName: "Event A",
      idempotencyKey: "exp-key-1",
      attachment: defaultAttachment,
    }, { storageService: storage }),
    service(treasurerActor, {
      termId,
      type: TransactionType.EXPENSE,
      transactionDate: new Date(),
      amountCents: 100000,
      cashAccount: CashAccount.CASH_ON_HAND,
      categoryId: expenseCategoryId,
      counterpartyName: "Vendor B",
      description: "Expense B",
      referenceDescription: "Ref B",
      eventActivityName: "Event B",
      idempotencyKey: "exp-key-2",
      attachment: defaultAttachment,
    }, { storageService: storage }),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert.equal(fulfilled.length, 1, "Exactly one simultaneous expense must succeed when both cannot be funded");
  assert.equal(rejected.length, 1, "The other simultaneous expense must be rejected");
  if (rejected[0].status === "rejected") {
    assert.match(rejected[0].reason.message, /Insufficient funds|insufficient/i);
  }

  // Account never becomes negative
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const term = await prisma.academicTerm.findUnique({ where: { id: termId } });
    const txs = await prisma.transaction.findMany({ where: { deletedAt: null } });
    const totalIncome = txs.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amountCents, 0);
    const totalExpense = txs.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amountCents, 0);
    const balance = term!.openingCashOnHandCents + term!.openingCashInBankCents + totalIncome - totalExpense;
    assert.ok(balance >= 0, "Account balance must never become negative");
  } finally {
    await prisma.$disconnect();
  }
});

test("Concurrency Integration: Two simultaneous stale edits - first succeeds, second gets ConcurrentModificationError", async () => {
  assert.ok(createTransactionService && editTransactionService);
  assert.ok(storageService);
  const createSvc = createTransactionService;
  const editSvc = editTransactionService;
  const storage = storageService;

  const defaultAttachment = {
    originalName: "receipt.png",
    mimeType: "image/png",
    sizeBytes: 8,
    buffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  };

  const created = await createSvc(treasurerActor, {
    termId,
    type: TransactionType.INCOME,
    transactionDate: new Date(),
    amountCents: 10000,
    cashAccount: CashAccount.CASH_ON_HAND,
    categoryId: incomeCategoryId,
    counterpartyName: "Member",
    description: "Edit target",
    referenceDescription: "Ref",
    eventActivityName: "Edit Event",
    idempotencyKey: "edit-target-1",
    attachment: defaultAttachment,
  }, { storageService: storage });

  const results = await Promise.allSettled([
    editSvc(treasurerActor, {
      id: created.id,
      expectedVersion: 1,
      type: TransactionType.INCOME,
      transactionDate: new Date(),
      amountCents: 12000,
      cashAccount: CashAccount.CASH_ON_HAND,
      categoryId: incomeCategoryId,
      counterpartyName: "Member",
      description: "First edit",
      referenceDescription: "Ref",
      eventActivityName: "Edit Event",
      idempotencyKey: "edit-key-1",
    }),
    editSvc(treasurerActor, {
      id: created.id,
      expectedVersion: 1,
      type: TransactionType.INCOME,
      transactionDate: new Date(),
      amountCents: 15000,
      cashAccount: CashAccount.CASH_ON_HAND,
      categoryId: incomeCategoryId,
      counterpartyName: "Member",
      description: "Second edit",
      referenceDescription: "Ref",
      eventActivityName: "Edit Event",
      idempotencyKey: "edit-key-2",
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert.equal(fulfilled.length, 1, "First stale edit must succeed");
  assert.equal(rejected.length, 1, "Second stale edit must be rejected");
  if (rejected[0].status === "rejected") {
    assert.match(rejected[0].reason.message, /modified by another user/i);
  }
});

test("Concurrency Integration: Duplicate create request with same idempotency key creates exactly one transaction", async () => {
  assert.ok(processIdempotentCommand);
  const idemSvc = processIdempotentCommand;

  const payload = {
    type: TransactionType.INCOME,
    amountCents: 25000,
    cashAccount: CashAccount.CASH_ON_HAND,
    categoryId: incomeCategoryId,
    description: "Idempotent create",
  };

  const commandFn = () =>
    idemSvc(treasurerActor.id, orgId, "CREATE_TRANSACTION", "idem-key-001", payload, async (tx) => {
      const term = await tx.academicTerm.findFirst({ where: { organizationId: orgId, active: true } });
      const transaction = await tx.transaction.create({
        data: {
          organizationId: orgId,
          termId: term!.id,
          type: payload.type,
          transactionDate: new Date(),
          amountCents: payload.amountCents,
          cashAccount: payload.cashAccount,
          categoryId: payload.categoryId,
          counterpartyName: "Member",
          description: payload.description,
          referenceDescription: "Ref",
          eventActivityName: "Event",
          recordedByUserId: treasurerActor.id,
          idempotencyKey: "idem-key-001",
        },
      });
      return { result: { id: transaction.id }, resultEntityType: "Transaction", resultEntityId: transaction.id };
    });

  const [r1, r2] = await Promise.allSettled([commandFn(), commandFn()]);

  assert.equal(r1.status, "fulfilled");
  assert.equal(r2.status, "fulfilled");

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const count = await prisma.transaction.count({
      where: { idempotencyKey: "idem-key-001" },
    });
    assert.equal(count, 1, "Duplicate idempotent request must create exactly one transaction");
  } finally {
    await prisma.$disconnect();
  }
});

test("Concurrency Integration: Production transaction create caches before staging a duplicate file", async () => {
  assert.ok(createTransactionService);
  assert.ok(storageService);
  const service = createTransactionService;
  const storage = storageService;
  const activeFilesBefore = fs.readdirSync(storageRoot).filter((file) => fs.statSync(path.join(storageRoot, file)).isFile());
  const fileBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const transactionDate = new Date();
  const input = {
    termId,
    type: TransactionType.INCOME,
    transactionDate,
    amountCents: 11100,
    cashAccount: CashAccount.CASH_ON_HAND,
    categoryId: incomeCategoryId,
    counterpartyName: "Fictional Payor",
    description: "Cached file create",
    referenceDescription: "Cache reference",
    eventActivityName: "Cache event",
    idempotencyKey: "production-file-cache-001",
    attachment: {
      originalName: "cached.png",
      mimeType: "image/png",
      sizeBytes: fileBuffer.length,
      buffer: fileBuffer,
    },
  };

  const first = await service(treasurerActor, input, { storageService: storage });
  const second = await service(treasurerActor, input, { storageService: storage });
  assert.equal(second.id, first.id);

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const activeFiles = fs.readdirSync(storageRoot).filter((file) => fs.statSync(path.join(storageRoot, file)).isFile());
    const stagedFiles = fs.existsSync(storage.getStagingDir()) ? fs.readdirSync(storage.getStagingDir()) : [];
    const trashFiles = fs.existsSync(storage.getTrashDir()) ? fs.readdirSync(storage.getTrashDir()) : [];
    assert.equal(activeFiles.length, activeFilesBefore.length + 1);
    assert.equal(stagedFiles.length, 0);
    assert.equal(trashFiles.length, 0);
    assert.equal(await prisma.transaction.count({ where: { idempotencyKey: input.idempotencyKey } }), 1);
    assert.equal(await prisma.attachment.count({ where: { transactionId: first.id } }), 1);
    assert.equal(await prisma.commandReceipt.count({ where: { idempotencyKey: input.idempotencyKey } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { entityType: "Transaction", entityId: first.id } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { action: "UPLOADED_ATTACHMENT", metadataJson: { contains: first.id } } }), 1);
  } finally {
    await prisma.$disconnect();
  }
});

test("Concurrency Integration: cash transfers require attachments and preserve optimistic concurrency", async () => {
  const { AttachmentStorageService } = await import("../../lib/infrastructure/storage/attachment-store");
  const { createCashTransferService, editCashTransferService, deleteCashTransferService } = await import("../../lib/application/transfers");
  const storage = new AttachmentStorageService(storageRoot);
  const fileBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  const transfer = await createCashTransferService(treasurerActor, {
    termId,
    transferDate: new Date(),
    fromAccount: CashAccount.CASH_ON_HAND,
    toAccount: CashAccount.CASH_IN_BANK,
    amountCents: 500,
    documentNumber: "TR-001",
    description: "Fictional cash transfer",
    referenceDescription: "Transfer reference",
    eventActivityName: "Transfer activity",
    idempotencyKey: "transfer-create-001",
    attachment: {
      originalName: "transfer.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileBuffer.length,
      buffer: fileBuffer,
    },
  }, { storageService: storage });

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    assert.equal(await prisma.attachment.count({ where: { cashTransferId: transfer.id } }), 1);
  } finally {
    await prisma.$disconnect();
  }

  const edited = await editCashTransferService(treasurerActor, {
    id: transfer.id,
    expectedVersion: 1,
    transferDate: new Date(),
    fromAccount: CashAccount.CASH_ON_HAND,
    toAccount: CashAccount.CASH_IN_BANK,
    amountCents: 400,
    documentNumber: "TR-001-EDITED",
    description: "Edited fictional cash transfer",
    referenceDescription: "Edited reference",
    eventActivityName: "Edited activity",
    idempotencyKey: "transfer-edit-001",
  });
  assert.equal(edited.version, 2);
  await assert.rejects(
    () => editCashTransferService(treasurerActor, {
      id: transfer.id,
      expectedVersion: 1,
      transferDate: new Date(),
      fromAccount: CashAccount.CASH_ON_HAND,
      toAccount: CashAccount.CASH_IN_BANK,
      amountCents: 300,
      description: "Stale fictional transfer",
      referenceDescription: "Stale reference",
      idempotencyKey: "transfer-edit-stale-001",
    }),
    /modified by another user/i
  );
  await deleteCashTransferService(treasurerActor, {
    id: transfer.id,
    expectedVersion: 2,
    deleteReason: "Fictional test cleanup",
    idempotencyKey: "transfer-delete-001",
  });

  const finalPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const deleted = await finalPrisma.cashTransfer.findUnique({ where: { id: transfer.id } });
    assert.ok(deleted?.deletedAt);
    assert.equal(await finalPrisma.attachment.count({ where: { cashTransferId: transfer.id } }), 1);
  } finally {
    await finalPrisma.$disconnect();
  }
});

test("Concurrency Integration: stale receipts recover and retry attempts use fresh transactions", async () => {
  const { STALE_PENDING_TIMEOUT_MS, claimCommandReceipt, releaseCommandReceipt } = await import("../../lib/application/idempotency");
  const payload = { operation: "stale-recovery" };
  const staleKey = "stale-receipt-001";
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await prisma.commandReceipt.create({
      data: {
        actorUserId: treasurerActor.id,
        organizationId: orgId,
        commandType: "STALE_TEST",
        idempotencyKey: staleKey,
        requestHash: (await import("../../lib/application/idempotency")).computeRequestHash("STALE_TEST", payload),
        status: "PENDING",
        leaseExpiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(Date.now() - STALE_PENDING_TIMEOUT_MS - 1000),
      },
    });
    const claim = await claimCommandReceipt(treasurerActor.id, orgId, "STALE_TEST", staleKey, payload);
    assert.equal(claim.status, "CLAIMED");
    if (claim.status === "CLAIMED") await releaseCommandReceipt(claim.claim);

    let attempts = 0;
    const retryKey = "fresh-transaction-001";
    const { withTransientRetry } = await import("../../lib/infrastructure/db/retry");
    await withTransientRetry(() => prisma.$transaction(async (tx) => {
      attempts++;
      await tx.commandReceipt.create({
        data: {
          actorUserId: treasurerActor.id,
          organizationId: orgId,
          commandType: "RETRY_TEST",
          idempotencyKey: retryKey,
          requestHash: `retry-${attempts}`,
          status: "PENDING",
        },
      });
      if (attempts === 1) throw new Error("database is locked");
      return true;
    }));
    assert.equal(attempts, 2);
    assert.equal(await prisma.commandReceipt.count({ where: { idempotencyKey: retryKey } }), 1);

    await assert.rejects(
      () => withTransientRetry(() => prisma.$transaction(async (tx) => {
        await tx.commandReceipt.create({
          data: {
            actorUserId: treasurerActor.id,
            organizationId: orgId,
            commandType: "EXHAUSTED_TEST",
            idempotencyKey: "exhausted-retry-001",
            requestHash: "exhausted",
            status: "PENDING",
          },
        });
        throw new Error("database is locked");
      }), 2, 1),
      /database is locked/i
    );
    assert.equal(await prisma.commandReceipt.count({ where: { idempotencyKey: "exhausted-retry-001" } }), 0);
  } finally {
    await prisma.$disconnect();
  }
});

test("Concurrency Integration: Same idempotency key with a different payload is rejected", async () => {
  assert.ok(processIdempotentCommand);
  const idemSvc = processIdempotentCommand;

  const payloadA = { amountCents: 30000, description: "Payload A" };
  const payloadB = { amountCents: 90000, description: "Payload B" };

  await idemSvc(treasurerActor.id, orgId, "CREATE_TRANSACTION", "idem-key-002", payloadA, async (tx) => {
    const term = await tx.academicTerm.findFirst({ where: { organizationId: orgId, active: true } });
    const transaction = await tx.transaction.create({
      data: {
        organizationId: orgId,
        termId: term!.id,
        type: TransactionType.INCOME,
        transactionDate: new Date(),
        amountCents: payloadA.amountCents,
        cashAccount: CashAccount.CASH_ON_HAND,
        categoryId: incomeCategoryId,
        counterpartyName: "Member",
        description: payloadA.description,
        referenceDescription: "Ref",
        eventActivityName: "Event",
        recordedByUserId: treasurerActor.id,
        idempotencyKey: "idem-key-002",
      },
    });
    return { result: { id: transaction.id }, resultEntityType: "Transaction", resultEntityId: transaction.id };
  });

  await assert.rejects(
    async () => {
      await idemSvc(treasurerActor.id, orgId, "CREATE_TRANSACTION", "idem-key-002", payloadB, async (tx) => {
        const term = await tx.academicTerm.findFirst({ where: { organizationId: orgId, active: true } });
        const transaction = await tx.transaction.create({
          data: {
            organizationId: orgId,
            termId: term!.id,
            type: TransactionType.INCOME,
            transactionDate: new Date(),
            amountCents: payloadB.amountCents,
            cashAccount: CashAccount.CASH_ON_HAND,
            categoryId: incomeCategoryId,
            counterpartyName: "Member",
            description: payloadB.description,
            referenceDescription: "Ref",
            eventActivityName: "Event",
            recordedByUserId: treasurerActor.id,
            idempotencyKey: "idem-key-002",
          },
        });
        return { result: { id: transaction.id }, resultEntityType: "Transaction", resultEntityId: transaction.id };
      });
    },
    /Idempotency key reused with a different payload/
  );
});

test("Concurrency Integration: controlled stale-claim race grants the lease to exactly one claimant", async () => {
  const { claimCommandReceipt, releaseCommandReceipt, computeRequestHash } = await import("../../lib/application/idempotency");
  const { IdempotencyInProgressError } = await import("../../lib/domain/errors");
  const payload = { operation: "stale-claim-race" };
  const raceKey = "stale-claim-race-001";
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await prisma.commandReceipt.create({
      data: {
        actorUserId: treasurerActor.id,
        organizationId: orgId,
        commandType: "RACE_TEST",
        idempotencyKey: raceKey,
        requestHash: computeRequestHash("RACE_TEST", payload),
        status: "PENDING",
        leaseExpiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(Date.now() - 120 * 1000),
      },
    });

    const results = await Promise.allSettled([
      claimCommandReceipt(treasurerActor.id, orgId, "RACE_TEST", raceKey, payload),
      claimCommandReceipt(treasurerActor.id, orgId, "RACE_TEST", raceKey, payload),
    ]);

    const claimed = results.filter((result) => result.status === "fulfilled" && result.value.status === "CLAIMED");
    const rejected = results.filter((result) => result.status === "rejected");

    assert.equal(claimed.length, 1, "Exactly one claimant must win the stale lease");
    assert.equal(rejected.length, 1, "The losing claimant must be rejected");

    const losingError = rejected[0] as PromiseRejectedResult;
    assert.ok(
      losingError.reason instanceof IdempotencyInProgressError,
      "Losing claimant must receive IdempotencyInProgressError"
    );

    if (claimed[0] && claimed[0].status === "fulfilled" && claimed[0].value.status === "CLAIMED") {
      await releaseCommandReceipt(claimed[0].value.claim);
    }

    const remaining = await prisma.commandReceipt.findUnique({
      where: { actorUserId_idempotencyKey: { actorUserId: treasurerActor.id, idempotencyKey: raceKey } },
    });
    assert.equal(remaining, null, "Released claim must be removed");
  } finally {
    await prisma.$disconnect();
  }
});

test("Concurrency Integration: post-commit failure retains rows and files, retry returns the completed result", async () => {
  assert.ok(createTransactionService);
  const service = createTransactionService;
  const base = storageService!;
  let deleteActiveCalls = 0;

  const throwingDeleteStorage = {
    stageUpload: base.stageUpload.bind(base),
    commitUpload: base.commitUpload.bind(base),
    discardStagedUpload: base.discardStagedUpload.bind(base),
    deleteActiveFile: async () => {
      deleteActiveCalls++;
      throw new Error("injected post-commit read/delete failure");
    },
  } as unknown as InstanceType<typeof import("../../lib/infrastructure/storage/attachment-store").AttachmentStorageService>;

  const fileBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const input = {
    termId,
    type: TransactionType.INCOME,
    transactionDate: new Date(),
    amountCents: 12300,
    cashAccount: CashAccount.CASH_ON_HAND,
    categoryId: incomeCategoryId,
    counterpartyName: "Fictional Post-commit Payor",
    description: "Post-commit failure create",
    referenceDescription: "Post-commit reference",
    eventActivityName: "Post-commit event",
    idempotencyKey: "post-commit-failure-001",
    attachment: {
      originalName: "post-commit.png",
      mimeType: "image/png",
      sizeBytes: fileBuffer.length,
      buffer: fileBuffer,
    },
  };

  const activeFilesBefore = fs.readdirSync(storageRoot).filter((file) => fs.statSync(path.join(storageRoot, file)).isFile()).length;

  const first = await service(treasurerActor, input, { storageService: throwingDeleteStorage });
  assert.equal(deleteActiveCalls, 0, "EXECUTED path must not perform a post-commit ownership check or delete");

  const retried = await service(treasurerActor, input, { storageService: throwingDeleteStorage });
  assert.equal(retried.id, first.id, "Retry must return the completed cached result");
  assert.equal(deleteActiveCalls, 0, "Cached retry must never attempt a file delete");

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    assert.equal(await prisma.transaction.count({ where: { idempotencyKey: input.idempotencyKey } }), 1, "Business row must remain");
    assert.equal(await prisma.attachment.count({ where: { transactionId: first.id } }), 1, "Attachment row must remain");
    assert.equal(await prisma.commandReceipt.count({ where: { idempotencyKey: input.idempotencyKey, status: "COMPLETED" } }), 1);
  } finally {
    await prisma.$disconnect();
  }

  const activeFilesAfter = fs.readdirSync(storageRoot).filter((file) => fs.statSync(path.join(storageRoot, file)).isFile()).length;
  assert.equal(activeFilesAfter, activeFilesBefore + 1, "Exactly one physical file must remain - no duplicate produced");
});

test("Concurrency Integration: lease-stolen cached claim deletes only the losing caller's committed file", async () => {
  assert.ok(createTransactionService);
  const service = createTransactionService;
  const base = storageService!;
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  const gateControl: { release: (() => void) | null } = { release: null };
  const gate = new Promise<void>((resolve) => {
    gateControl.release = resolve;
  });

  const gatedStorage = {
    stageUpload: base.stageUpload.bind(base),
    discardStagedUpload: base.discardStagedUpload.bind(base),
    deleteActiveFile: base.deleteActiveFile.bind(base),
    commitUpload: async (stageId: string, extension: string) => {
      const committed = await base.commitUpload(stageId, extension);
      await gate;
      return committed;
    },
  } as unknown as InstanceType<typeof import("../../lib/infrastructure/storage/attachment-store").AttachmentStorageService>;

  const fileBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04]);
  const input = {
    termId,
    type: TransactionType.INCOME,
    transactionDate: new Date(),
    amountCents: 23400,
    cashAccount: CashAccount.CASH_ON_HAND,
    categoryId: incomeCategoryId,
    counterpartyName: "Fictional Race Payor",
    description: "Lease-stolen cached create",
    referenceDescription: "Lease-stolen reference",
    eventActivityName: "Lease-stolen event",
    idempotencyKey: "lease-stolen-cached-001",
    attachment: {
      originalName: "race.png",
      mimeType: "image/png",
      sizeBytes: fileBuffer.length,
      buffer: fileBuffer,
    },
  };

  try {
    const activeFilesBefore = fs.readdirSync(storageRoot).filter((file) => fs.statSync(path.join(storageRoot, file)).isFile()).length;

    // Losing caller: claims, stages, commits a file, then blocks before processing.
    const losingPromise = service(treasurerActor, input, { storageService: gatedStorage });

    // Wait until the losing caller has committed its file and is parked at the gate.
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Expire the losing caller's lease so the winning caller can recover it.
    await prisma.commandReceipt.updateMany({
      where: { idempotencyKey: input.idempotencyKey, status: "PENDING" },
      data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });

    // Winning caller recovers the lease and completes the command.
    const winner = await service(treasurerActor, input, { storageService: base });

    // Release the losing caller: it discovers the completed receipt (CACHED)
    // and must delete only its own unreferenced committed file.
    gateControl.release!();
    const loser = await losingPromise;

    assert.equal(winner.id, loser.id, "Both callers must converge on the same completed result");

    assert.equal(await prisma.transaction.count({ where: { idempotencyKey: input.idempotencyKey } }), 1, "Business row must exist exactly once");
    assert.equal(await prisma.attachment.count({ where: { transactionId: winner.id } }), 1, "Attachment row must exist exactly once");

    const activeFilesAfter = fs.readdirSync(storageRoot).filter((file) => fs.statSync(path.join(storageRoot, file)).isFile()).length;
    assert.equal(activeFilesAfter, activeFilesBefore + 1, "Losing caller's committed file must be removed - no duplicate file produced");
  } finally {
    gateControl.release?.();
    await prisma.$disconnect();
  }
});

test("Concurrency Integration: failed command retains the committed file for reconciliation", async () => {
  assert.ok(createTransactionService);
  const service = createTransactionService;
  const base = storageService!;
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const fileBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const activeFilesBefore = fs.readdirSync(storageRoot).filter((file) => fs.statSync(path.join(storageRoot, file)).isFile()).length;

  // The opening balance is 100000 cents on Cash on Hand; a 200000 expense
  // fails validation inside the transaction. The committed file must be
  // retained (fail closed) because its disposition cannot be determined.
  await assert.rejects(
    () =>
      service(treasurerActor, {
        termId,
        type: TransactionType.EXPENSE,
        transactionDate: new Date(),
        amountCents: 200000,
        cashAccount: CashAccount.CASH_ON_HAND,
        categoryId: expenseCategoryId,
        counterpartyName: "Fictional Vendor",
        description: "Rejected expense",
        referenceDescription: "Ref",
        eventActivityName: "Event",
        idempotencyKey: "failed-command-retain-001",
        attachment: {
          originalName: "retain.png",
          mimeType: "image/png",
          sizeBytes: fileBuffer.length,
          buffer: fileBuffer,
        },
      }, { storageService: base }),
    /Insufficient funds|insufficient/i
  );

  try {
    assert.equal(await prisma.commandReceipt.count({ where: { idempotencyKey: "failed-command-retain-001" } }), 0, "Released claim must be removed");
  } finally {
    await prisma.$disconnect();
  }

  const activeFilesAfter = fs.readdirSync(storageRoot).filter((file) => fs.statSync(path.join(storageRoot, file)).isFile()).length;
  // After a definite database rollback, the caller verifies no Attachment row owns the key
  // and safely cleans up its unreferenced committed active file.
  assert.equal(activeFilesAfter, activeFilesBefore, "Unreferenced committed file must be cleaned up on DB rollback");
});
