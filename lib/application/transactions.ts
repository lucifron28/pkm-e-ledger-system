import crypto from "crypto";
import { prisma } from "../db/prisma";
import { defaultAttachmentStorageService } from "../infrastructure/storage/attachment-store";
import {
  claimCommandReceipt,
  processIdempotentCommand,
  releaseCommandReceipt,
} from "./idempotency";
import { withTransientRetry } from "../infrastructure/db/retry";
import { CashAccount, TransactionType } from "@prisma/client";
import { SessionUser } from "../auth/session";
import { isManagementRole } from "../auth/rbac";
import {
  AccessDeniedError,
  ConcurrentModificationError,
  RecordNotFoundError,
  ValidationError,
} from "../domain/errors";
import { validateMoneyAmount } from "../domain/money";
import { validateAttachmentPayload } from "../domain/attachments";
import {
  assertSufficientFunds,
  projectMutationBalances,
} from "../domain/financial";
import { createAuditLog } from "../data/audit-log";
import { AuditAction } from "@prisma/client";

export interface TransactionDto {
  id: string;
  organizationId: string;
  termId: string;
  type: TransactionType;
  documentNumber: string | null;
  transactionDate: Date;
  amountCents: number;
  cashAccount: CashAccount;
  categoryId: string;
  categoryName: string;
  counterpartyName: string | null;
  description: string;
  referenceDescription: string;
  eventActivityName: string | null;
  recordedByUserId: string;
  recordedByName: string;
  version: number;
  createdAt: Date;
}

export interface CreateTransactionInput {
  termId: string;
  type: TransactionType;
  transactionDate: Date;
  amountCents: number;
  cashAccount: CashAccount;
  categoryId: string;
  documentNumber?: string | null;
  counterpartyName?: string | null;
  description: string;
  referenceDescription: string;
  eventActivityName?: string | null;
  idempotencyKey: string;
  attachment: {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    buffer: Uint8Array | Buffer;
  };
}

export interface TransactionServiceDependencies {
  storageService?: typeof defaultAttachmentStorageService;
}

export async function createTransactionService(
  user: SessionUser,
  input: CreateTransactionInput,
  dependencies: TransactionServiceDependencies = {}
): Promise<TransactionDto> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    throw new AccessDeniedError("Only authorized management roles can record transactions.");
  }

  validateMoneyAmount(input.amountCents, false, "Transaction amount");
  const attachmentError = validateAttachmentPayload(
    input.attachment.originalName,
    input.attachment.mimeType,
    input.attachment.buffer,
    input.attachment.sizeBytes
  );
  if (attachmentError) throw new ValidationError(attachmentError);
  const fileHash = crypto.createHash("sha256").update(input.attachment.buffer).digest("hex");

  const payloadForHash = {
    termId: input.termId,
    type: input.type,
    transactionDate: input.transactionDate.toISOString(),
    amountCents: input.amountCents,
    cashAccount: input.cashAccount,
    categoryId: input.categoryId,
    documentNumber: input.documentNumber || null,
    counterpartyName: input.counterpartyName,
    description: input.description,
    referenceDescription: input.referenceDescription,
    eventActivityName: input.eventActivityName || null,
    attachment: {
      originalName: input.attachment.originalName,
      mimeType: input.attachment.mimeType,
      sizeBytes: input.attachment.sizeBytes,
      fileHash,
    },
  };

  const receipt = await claimCommandReceipt<TransactionDto>(
    user.id,
    user.organizationId,
    "CREATE_TRANSACTION",
    input.idempotencyKey,
    payloadForHash
  );
  if (receipt.status === "COMPLETED") {
    return receipt.result;
  }

  const claim = receipt.claim;
  const storageService = dependencies.storageService || defaultAttachmentStorageService;
  let staged: Awaited<ReturnType<typeof storageService.stageUpload>> | null = null;
  let committedName: string | null = null;
  try {
    staged = await storageService.stageUpload(
      input.attachment.buffer,
      input.attachment.originalName,
      input.attachment.mimeType
    );
    const committed = await storageService.commitUpload(staged.stageId, staged.extension);
    committedName = committed.storageKey;

    const outcome = await withTransientRetry(() =>
      processIdempotentCommand<TransactionDto>(
        user.id,
        user.organizationId!,
        "CREATE_TRANSACTION",
        input.idempotencyKey,
        payloadForHash,
        async (tx) => {
          const term = await tx.academicTerm.findFirst({
            where: { id: input.termId, organizationId: user.organizationId!, active: true },
          });
          if (!term) {
            throw new ValidationError("The selected academic term is no longer active. Reload the ledger before recording this entry.");
          }

          const category = await tx.transactionCategory.findFirst({
            where: { id: input.categoryId, type: input.type, active: true },
          });
          if (!category) {
            throw new ValidationError("Invalid or inactive category for this transaction type.");
          }

          const activeTransactions = await tx.transaction.findMany({
            where: { organizationId: user.organizationId!, termId: term.id, deletedAt: null },
            select: { id: true, type: true, amountCents: true, cashAccount: true },
          });

          const activeTransfers = await tx.cashTransfer.findMany({
            where: { organizationId: user.organizationId!, termId: term.id, deletedAt: null },
            select: { id: true, amountCents: true, fromAccount: true, toAccount: true },
          });

          const projected = projectMutationBalances(
            term.openingCashOnHandCents,
            term.openingCashInBankCents,
            activeTransactions,
            {
              type: "CREATE_TRANSACTION",
              row: {
                type: input.type,
                amountCents: input.amountCents,
                cashAccount: input.cashAccount,
              },
            },
            activeTransfers
          );

          assertSufficientFunds(projected);

          const transaction = await tx.transaction.create({
            data: {
              organizationId: user.organizationId!,
              termId: term.id,
              type: input.type,
              transactionDate: input.transactionDate,
              amountCents: input.amountCents,
              cashAccount: input.cashAccount,
              categoryId: category.id,
              documentNumber: input.documentNumber?.trim() || null,
              counterpartyName: input.counterpartyName?.trim() || null,
              description: input.description.trim(),
              referenceDescription: input.referenceDescription.trim(),
              eventActivityName: input.eventActivityName?.trim() || null,
              recordedByUserId: user.id,
              idempotencyKey: input.idempotencyKey,
            },
            include: {
              category: { select: { name: true } },
              recordedBy: { select: { fullName: true } },
            },
          });

          const attachment = await tx.attachment.create({
            data: {
              transactionId: transaction.id,
              uploadedById: user.id,
              originalName: input.attachment.originalName,
              storageKey: committed.storageKey,
              mimeType: input.attachment.mimeType,
              sizeBytes: input.attachment.sizeBytes,
            },
          });

          await createAuditLog({
            userId: user.id,
            organizationId: user.organizationId,
            role: user.role,
            action: input.type === TransactionType.INCOME ? AuditAction.ADDED_INCOME : AuditAction.ADDED_EXPENSE,
            entityType: "Transaction",
            entityId: transaction.id,
            metadata: {
              type: transaction.type,
              cashAccount: transaction.cashAccount,
              amountCents: input.amountCents,
              categoryId: category.id,
              categoryName: category.name,
              documentNumber: transaction.documentNumber,
              counterpartyName: transaction.counterpartyName,
              description: transaction.description,
              referenceDescription: transaction.referenceDescription,
              eventActivityName: transaction.eventActivityName,
            },
            tx,
          });

          await createAuditLog({
            userId: user.id,
            organizationId: user.organizationId,
            role: user.role,
            action: AuditAction.UPLOADED_ATTACHMENT,
            entityType: "Attachment",
            entityId: attachment.id,
            metadata: { transactionId: transaction.id, originalName: input.attachment.originalName, sizeBytes: input.attachment.sizeBytes },
            tx,
          });

          const dto: TransactionDto = {
            id: transaction.id,
            organizationId: transaction.organizationId,
            termId: transaction.termId,
            type: transaction.type,
            documentNumber: transaction.documentNumber,
            transactionDate: transaction.transactionDate,
            amountCents: transaction.amountCents,
            cashAccount: transaction.cashAccount,
            categoryId: transaction.categoryId,
            categoryName: transaction.category.name,
            counterpartyName: transaction.counterpartyName,
            description: transaction.description,
            referenceDescription: transaction.referenceDescription,
            eventActivityName: transaction.eventActivityName,
            recordedByUserId: transaction.recordedByUserId,
            recordedByName: transaction.recordedBy.fullName,
            version: transaction.version,
            createdAt: transaction.createdAt,
          };

          return { result: dto, resultEntityType: "Transaction", resultEntityId: transaction.id };
        },
        { claimToken: claim.claimToken }
      )
    );

    if (outcome.disposition === "CACHED" && committedName) {
      // Another claimant completed this command; this caller's committed file
      // is unreferenced and must be removed. When EXECUTED, retain the file
      // without a second ownership query. Failures here keep the file for
      // reconciliation rather than risk deleting a referenced file.
      await storageService.deleteActiveFile(committedName).catch(() => undefined);
    }

    return outcome.result;
  } catch (error) {
    if (staged && !committedName) {
      await storageService.discardStagedUpload(staged.stageId, staged.extension).catch(() => undefined);
    }
    if (committedName) {
      const isReferenced = await prisma.attachment.findFirst({
        where: { storageKey: committedName },
        select: { id: true },
      }).catch(() => null);
      if (!isReferenced) {
        await storageService.deleteActiveFile(committedName).catch(() => undefined);
      }
    }
    await releaseCommandReceipt(claim).catch(() => undefined);
    throw error;
  }
}

export interface EditTransactionInput {
  id: string;
  expectedVersion: number;
  type: TransactionType;
  transactionDate: Date;
  amountCents: number;
  cashAccount: CashAccount;
  categoryId: string;
  documentNumber?: string | null;
  counterpartyName: string;
  description: string;
  referenceDescription: string;
  eventActivityName?: string | null;
  idempotencyKey: string;
}

export async function editTransactionService(
  user: SessionUser,
  input: EditTransactionInput
): Promise<TransactionDto> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    throw new AccessDeniedError("Only authorized management roles can edit transactions.");
  }

  validateMoneyAmount(input.amountCents, false, "Transaction amount");

  const payload = {
    id: input.id,
    expectedVersion: input.expectedVersion,
    type: input.type,
    transactionDate: input.transactionDate.toISOString(),
    amountCents: input.amountCents,
    cashAccount: input.cashAccount,
    categoryId: input.categoryId,
    documentNumber: input.documentNumber || null,
    counterpartyName: input.counterpartyName,
    description: input.description,
    referenceDescription: input.referenceDescription,
    eventActivityName: input.eventActivityName || null,
  };

  return withTransientRetry(() =>
    processIdempotentCommand<TransactionDto>(
      user.id,
      user.organizationId!,
      "EDIT_TRANSACTION",
      input.idempotencyKey,
      payload,
      async (tx) => {
        const existing = await tx.transaction.findFirst({
          where: { id: input.id, organizationId: user.organizationId!, deletedAt: null },
          include: { category: { select: { name: true } } },
        });

        if (!existing) {
          throw new RecordNotFoundError("Transaction not found or access denied.");
        }

        if (existing.version !== input.expectedVersion) {
          throw new ConcurrentModificationError();
        }

        const term = await tx.academicTerm.findFirst({
          where: { id: existing.termId, organizationId: user.organizationId! },
        });
        if (!term) {
          throw new ValidationError("Academic term for this transaction was not found.");
        }

        const category = await tx.transactionCategory.findFirst({
          where: { id: input.categoryId },
        });
        if (!category || category.type !== input.type) {
          throw new ValidationError("Invalid category for this transaction type.");
        }
        if (input.categoryId !== existing.categoryId && !category.active) {
          throw new ValidationError("Selected category is inactive. Please choose an active category.");
        }

        const activeTransactions = await tx.transaction.findMany({
          where: { organizationId: user.organizationId!, termId: term.id, deletedAt: null },
          select: { id: true, type: true, amountCents: true, cashAccount: true },
        });

        const activeTransfers = await tx.cashTransfer.findMany({
          where: { organizationId: user.organizationId!, termId: term.id, deletedAt: null },
          select: { id: true, amountCents: true, fromAccount: true, toAccount: true },
        });

        const projected = projectMutationBalances(
          term.openingCashOnHandCents,
          term.openingCashInBankCents,
          activeTransactions,
          {
            type: "EDIT_TRANSACTION",
            existingId: existing.id,
            newRow: {
              type: input.type,
              amountCents: input.amountCents,
              cashAccount: input.cashAccount,
            },
          },
          activeTransfers
        );

        assertSufficientFunds(projected);

        const updatedResult = await tx.transaction.updateMany({
          where: {
            id: input.id,
            organizationId: user.organizationId!,
            deletedAt: null,
            version: input.expectedVersion,
          },
          data: {
            type: input.type,
            transactionDate: input.transactionDate,
            amountCents: input.amountCents,
            cashAccount: input.cashAccount,
            categoryId: category.id,
            documentNumber: input.documentNumber?.trim() || null,
            counterpartyName: input.counterpartyName.trim(),
            description: input.description.trim(),
            referenceDescription: input.referenceDescription.trim(),
            eventActivityName: input.eventActivityName?.trim() || null,
            updatedByUserId: user.id,
            version: { increment: 1 },
          },
        });

        if (updatedResult.count === 0) {
          throw new ConcurrentModificationError();
        }

        const updated = await tx.transaction.findUnique({
          where: { id: input.id },
          include: {
            category: { select: { name: true } },
            recordedBy: { select: { fullName: true } },
          },
        });

        if (!updated) {
          throw new RecordNotFoundError("Transaction update failed.");
        }

        await createAuditLog({
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role,
          action: AuditAction.EDITED_TRANSACTION,
          entityType: "Transaction",
          entityId: updated.id,
          metadata: {
            before: {
              id: existing.id,
              organizationId: existing.organizationId,
              termId: existing.termId,
              type: existing.type,
              transactionDate: existing.transactionDate.toISOString(),
              cashAccount: existing.cashAccount,
              amountCents: existing.amountCents,
              categoryId: existing.categoryId,
              categoryName: existing.category.name,
              documentNumber: existing.documentNumber,
              counterpartyName: existing.counterpartyName,
              description: existing.description,
              referenceDescription: existing.referenceDescription,
              eventActivityName: existing.eventActivityName,
              recordedByUserId: existing.recordedByUserId,
              createdAt: existing.createdAt.toISOString(),
              version: existing.version,
            },
            after: {
              id: updated.id,
              organizationId: updated.organizationId,
              termId: updated.termId,
              type: updated.type,
              transactionDate: updated.transactionDate.toISOString(),
              cashAccount: updated.cashAccount,
              amountCents: updated.amountCents,
              categoryId: updated.categoryId,
              categoryName: updated.category.name,
              documentNumber: updated.documentNumber,
              counterpartyName: updated.counterpartyName,
              description: updated.description,
              referenceDescription: updated.referenceDescription,
              eventActivityName: updated.eventActivityName,
              recordedByUserId: updated.recordedByUserId,
              createdAt: updated.createdAt.toISOString(),
              version: updated.version,
            },
          },
          tx,
        });

        const dto: TransactionDto = {
          id: updated.id,
          organizationId: updated.organizationId,
          termId: updated.termId,
          type: updated.type,
          documentNumber: updated.documentNumber,
          transactionDate: updated.transactionDate,
          amountCents: updated.amountCents,
          cashAccount: updated.cashAccount,
          categoryId: updated.categoryId,
          categoryName: updated.category.name,
          counterpartyName: updated.counterpartyName,
          description: updated.description,
          referenceDescription: updated.referenceDescription,
          eventActivityName: updated.eventActivityName,
          recordedByUserId: updated.recordedByUserId,
          recordedByName: updated.recordedBy.fullName,
          version: updated.version,
          createdAt: updated.createdAt,
        };

        return { result: dto, resultEntityType: "Transaction", resultEntityId: updated.id };
      }
    )
  ).then((outcome) => outcome.result);
}

export interface DeleteTransactionInput {
  id: string;
  expectedVersion: number;
  deleteReason: string;
  idempotencyKey: string;
}

export async function deleteTransactionService(
  user: SessionUser,
  input: DeleteTransactionInput
): Promise<void> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    throw new AccessDeniedError("Only authorized management roles can delete transactions.");
  }

  const reason = input.deleteReason.trim();
  if (!reason) {
    throw new ValidationError("A deletion reason is required.");
  }

  const payload = {
    id: input.id,
    expectedVersion: input.expectedVersion,
    deleteReason: reason,
  };

  return withTransientRetry(() =>
    processIdempotentCommand(
      user.id,
      user.organizationId!,
      "DELETE_TRANSACTION",
      input.idempotencyKey,
      payload,
      async (tx) => {
        const existing = await tx.transaction.findFirst({
          where: { id: input.id, organizationId: user.organizationId!, deletedAt: null },
          include: { category: { select: { name: true } } },
        });

        if (!existing) {
          throw new RecordNotFoundError("Transaction not found or already deleted.");
        }

        if (existing.version !== input.expectedVersion) {
          throw new ConcurrentModificationError();
        }

        const term = await tx.academicTerm.findFirst({
          where: { id: existing.termId, organizationId: user.organizationId! },
        });
        if (!term) {
          throw new ValidationError("Academic term for this transaction was not found.");
        }

        const activeTransactions = await tx.transaction.findMany({
          where: { organizationId: user.organizationId!, termId: term.id, deletedAt: null },
          select: { id: true, type: true, amountCents: true, cashAccount: true },
        });

        const activeTransfers = await tx.cashTransfer.findMany({
          where: { organizationId: user.organizationId!, termId: term.id, deletedAt: null },
          select: { id: true, amountCents: true, fromAccount: true, toAccount: true },
        });

        const projected = projectMutationBalances(
          term.openingCashOnHandCents,
          term.openingCashInBankCents,
          activeTransactions,
          {
            type: "DELETE_TRANSACTION",
            existingId: existing.id,
          },
          activeTransfers
        );

        assertSufficientFunds(projected);

        const updatedResult = await tx.transaction.updateMany({
          where: {
            id: input.id,
            organizationId: user.organizationId!,
            deletedAt: null,
            version: input.expectedVersion,
          },
          data: {
            deletedAt: new Date(),
            deleteReason: reason,
            deletedByUserId: user.id,
            version: { increment: 1 },
          },
        });

        if (updatedResult.count === 0) {
          throw new ConcurrentModificationError();
        }

        await createAuditLog({
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role,
          action: AuditAction.DELETED_TRANSACTION,
          entityType: "Transaction",
          entityId: existing.id,
          metadata: {
            deleteReason: reason,
            before: {
              id: existing.id,
              organizationId: existing.organizationId,
              termId: existing.termId,
              type: existing.type,
              transactionDate: existing.transactionDate.toISOString(),
              cashAccount: existing.cashAccount,
              amountCents: existing.amountCents,
              categoryId: existing.categoryId,
              categoryName: existing.category.name,
              documentNumber: existing.documentNumber,
              counterpartyName: existing.counterpartyName,
              description: existing.description,
              referenceDescription: existing.referenceDescription,
              eventActivityName: existing.eventActivityName,
              recordedByUserId: existing.recordedByUserId,
              createdAt: existing.createdAt.toISOString(),
              version: existing.version,
            },
          },
          tx,
        });

        return { result: undefined as void, resultEntityType: "Transaction", resultEntityId: existing.id };
      }
    )
  ).then((outcome) => outcome.result);
}
