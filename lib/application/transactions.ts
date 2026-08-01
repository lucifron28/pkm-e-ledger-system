import { prisma } from "../db/prisma";
import crypto from "crypto";
import { defaultAttachmentStorageService } from "../infrastructure/storage/attachment-store";
import { processIdempotentCommand } from "./idempotency";
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
  attachment: {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    buffer: Uint8Array;
  };
}

export async function createTransactionService(
  user: SessionUser,
  input: CreateTransactionInput
): Promise<TransactionDto> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    throw new AccessDeniedError("Only authorized management roles can record transactions.");
  }

  validateMoneyAmount(input.amountCents, false, "Transaction amount");
  const fileHash = crypto.createHash("sha256").update(input.attachment.buffer).digest("hex");

  const payloadForHash = {
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

  // 1. Stage and commit attachment file
  const storageService = defaultAttachmentStorageService;
  const staged = await storageService.stageUpload(
    input.attachment.buffer,
    input.attachment.originalName,
    input.attachment.mimeType
  );

  let committedName: string | null = null;
  try {
    const committed = await storageService.commitUpload(staged.stageId, staged.extension);
    committedName = committed.storedName;

    const result = await processIdempotentCommand(
      user.id,
      user.organizationId!,
      "CREATE_TRANSACTION",
      input.idempotencyKey,
      payloadForHash,
      async (tx) => {
        return withTransientRetry(async () => {
          const term = await tx.academicTerm.findFirst({
            where: { organizationId: user.organizationId!, active: true },
          });
          if (!term) {
            throw new ValidationError("No active academic term configured for transactions.");
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
              counterpartyName: input.counterpartyName.trim(),
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
              storedName: committed.storedName,
              storagePath: committed.storedName,
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
            metadata: { type: transaction.type, cashAccount: transaction.cashAccount, amountCents: input.amountCents },
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
        });
      }
    );

    return result;
  } catch (error) {
    await storageService.discardStagedUpload(staged.stageId, staged.extension);
    if (committedName) {
      await storageService.deleteActiveFile(committedName);
    }
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

  return processIdempotentCommand(
    user.id,
    user.organizationId!,
    "EDIT_TRANSACTION",
    input.idempotencyKey,
    payload,
    async (tx) => {
      return withTransientRetry(async () => {
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
              type: existing.type,
              transactionDate: existing.transactionDate,
              amountCents: existing.amountCents,
              cashAccount: existing.cashAccount,
              categoryId: existing.categoryId,
              categoryName: existing.category.name,
              documentNumber: existing.documentNumber,
              counterpartyName: existing.counterpartyName,
              description: existing.description,
              referenceDescription: existing.referenceDescription,
              eventActivityName: existing.eventActivityName,
              version: existing.version,
            },
            after: {
              type: updated.type,
              transactionDate: updated.transactionDate,
              amountCents: updated.amountCents,
              cashAccount: updated.cashAccount,
              categoryId: updated.categoryId,
              categoryName: updated.category.name,
              documentNumber: updated.documentNumber,
              counterpartyName: updated.counterpartyName,
              description: updated.description,
              referenceDescription: updated.referenceDescription,
              eventActivityName: updated.eventActivityName,
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
      });
    }
  );
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

  return processIdempotentCommand(
    user.id,
    user.organizationId!,
    "DELETE_TRANSACTION",
    input.idempotencyKey,
    payload,
    async (tx) => {
      return withTransientRetry(async () => {
        const existing = await tx.transaction.findFirst({
          where: { id: input.id, organizationId: user.organizationId!, deletedAt: null },
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
            preDeletionRecord: {
              id: existing.id,
              type: existing.type,
              amountCents: existing.amountCents,
              cashAccount: existing.cashAccount,
              categoryId: existing.categoryId,
              documentNumber: existing.documentNumber,
              counterpartyName: existing.counterpartyName,
              description: existing.description,
              referenceDescription: existing.referenceDescription,
              eventActivityName: existing.eventActivityName,
              version: existing.version,
            },
            deleteReason: reason,
          },
          tx,
        });

        return { result: undefined as void, resultEntityType: "Transaction", resultEntityId: existing.id };
      });
    }
  );
}
