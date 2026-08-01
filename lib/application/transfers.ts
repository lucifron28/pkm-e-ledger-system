import { prisma } from "../db/prisma";
import { processIdempotentCommand } from "./idempotency";
import { withTransientRetry } from "../infrastructure/db/retry";
import { AuditAction, CashAccount, CashTransfer } from "@prisma/client";
import { SessionUser } from "../auth/session";
import { isManagementRole } from "../auth/rbac";
import {
  AccessDeniedError,
  InsufficientFundsError,
  ValidationError,
} from "../domain/errors";
import { validateMoneyAmount } from "../domain/money";
import {
  projectMutationBalances,
  TransferRow,
} from "../domain/financial";
import { createAuditLog } from "../data/audit-log";

export interface CashTransferDto {
  id: string;
  organizationId: string;
  termId: string;
  transferDate: Date;
  fromAccount: CashAccount;
  toAccount: CashAccount;
  amountCents: number;
  documentNumber: string | null;
  description: string;
  referenceDescription: string;
  eventActivityName: string | null;
  recordedByUserId: string;
  recordedByName: string;
  version: number;
  createdAt: Date;
}

function toCashTransferDto(transfer: CashTransfer & { recordedBy?: { fullName: string } }): CashTransferDto {
  return {
    id: transfer.id,
    organizationId: transfer.organizationId,
    termId: transfer.termId,
    transferDate: transfer.transferDate,
    fromAccount: transfer.fromAccount,
    toAccount: transfer.toAccount,
    amountCents: transfer.amountCents,
    documentNumber: transfer.documentNumber,
    description: transfer.description,
    referenceDescription: transfer.referenceDescription,
    eventActivityName: transfer.eventActivityName,
    recordedByUserId: transfer.recordedByUserId,
    recordedByName: transfer.recordedBy?.fullName || "System User",
    version: transfer.version,
    createdAt: transfer.createdAt,
  };
}

export interface CreateTransferInput {
  transferDate: Date;
  fromAccount: CashAccount;
  toAccount: CashAccount;
  amountCents: number;
  documentNumber?: string | null;
  description: string;
  referenceDescription: string;
  eventActivityName?: string | null;
  idempotencyKey: string;
}

export async function createCashTransferService(
  user: SessionUser,
  input: CreateTransferInput
): Promise<CashTransferDto> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    throw new AccessDeniedError("Only authorized management roles can record cash transfers.");
  }

  if (input.fromAccount === input.toAccount) {
    throw new ValidationError("Transfer source and destination accounts must be different.");
  }

  validateMoneyAmount(input.amountCents, false, "Transfer amount");

  const payload = {
    transferDate: input.transferDate.toISOString(),
    fromAccount: input.fromAccount,
    toAccount: input.toAccount,
    amountCents: input.amountCents,
    documentNumber: input.documentNumber || null,
    description: input.description,
    referenceDescription: input.referenceDescription,
    eventActivityName: input.eventActivityName || null,
  };

  return processIdempotentCommand(
    user.id,
    user.organizationId!,
    "CREATE_CASH_TRANSFER",
    input.idempotencyKey,
    payload,
    async (tx) => {
      return withTransientRetry(async () => {
        const term = await tx.academicTerm.findFirst({
          where: { organizationId: user.organizationId!, active: true },
        });
        if (!term) {
          throw new ValidationError("No active academic term configured for cash transfers.");
        }

        const activeTransactions = await tx.transaction.findMany({
          where: { organizationId: user.organizationId!, termId: term.id, deletedAt: null },
          select: { id: true, type: true, amountCents: true, cashAccount: true },
        });

        const activeTransfers = await tx.cashTransfer.findMany({
          where: { organizationId: user.organizationId!, termId: term.id, deletedAt: null },
          select: { id: true, amountCents: true, fromAccount: true, toAccount: true },
        });

        const newTransferRow: TransferRow = {
          amountCents: input.amountCents,
          fromAccount: input.fromAccount,
          toAccount: input.toAccount,
        };

        const projected = projectMutationBalances(
          term.openingCashOnHandCents,
          term.openingCashInBankCents,
          activeTransactions,
          { type: "CREATE_TRANSFER", transfer: newTransferRow },
          activeTransfers
        );

        if (projected.cashOnHandCents < 0 || projected.cashInBankCents < 0) {
          throw new InsufficientFundsError("Cash transfer failed: Insufficient balance in source account.");
        }

        const created = await tx.cashTransfer.create({
          data: {
            organizationId: user.organizationId!,
            termId: term.id,
            transferDate: input.transferDate,
            fromAccount: input.fromAccount,
            toAccount: input.toAccount,
            amountCents: input.amountCents,
            documentNumber: input.documentNumber?.trim() || null,
            description: input.description.trim(),
            referenceDescription: input.referenceDescription.trim(),
            eventActivityName: input.eventActivityName?.trim() || null,
            recordedByUserId: user.id,
            idempotencyKey: input.idempotencyKey,
          },
          include: {
            recordedBy: { select: { fullName: true } },
          },
        });

        await createAuditLog({
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role,
          action: AuditAction.CREATED_CASH_TRANSFER,
          entityType: "CashTransfer",
          entityId: created.id,
          metadata: {
            amountCents: created.amountCents,
            fromAccount: created.fromAccount,
            toAccount: created.toAccount,
            description: created.description,
            referenceDescription: created.referenceDescription,
          },
          tx,
        });

        const dto = toCashTransferDto(created);
        return { result: dto, resultEntityType: "CashTransfer", resultEntityId: created.id };
      });
    }
  );
}

export interface EditTransferInput {
  id: string;
  expectedVersion: number;
  transferDate: Date;
  fromAccount: CashAccount;
  toAccount: CashAccount;
  amountCents: number;
  documentNumber?: string | null;
  description: string;
  referenceDescription: string;
  eventActivityName?: string | null;
  idempotencyKey: string;
}

export async function editCashTransferService(
  user: SessionUser,
  input: EditTransferInput
): Promise<CashTransferDto> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    throw new AccessDeniedError("Only authorized management roles can edit cash transfers.");
  }

  if (input.fromAccount === input.toAccount) {
    throw new ValidationError("Transfer source and destination accounts must be different.");
  }

  validateMoneyAmount(input.amountCents, false, "Transfer amount");

  const payload = {
    id: input.id,
    expectedVersion: input.expectedVersion,
    transferDate: input.transferDate.toISOString(),
    fromAccount: input.fromAccount,
    toAccount: input.toAccount,
    amountCents: input.amountCents,
    documentNumber: input.documentNumber || null,
    description: input.description,
    referenceDescription: input.referenceDescription,
    eventActivityName: input.eventActivityName || null,
  };

  return processIdempotentCommand(
    user.id,
    user.organizationId!,
    "EDIT_CASH_TRANSFER",
    input.idempotencyKey,
    payload,
    async (tx) => {
      return withTransientRetry(async () => {
        const existing = await tx.cashTransfer.findFirst({
          where: { id: input.id, organizationId: user.organizationId!, deletedAt: null },
        });
        if (!existing) {
          throw new ValidationError("Cash transfer not found or access denied.");
        }
        if (existing.version !== input.expectedVersion) {
          throw new ValidationError("This transfer was modified by another user. Reload and review latest version.");
        }

        const term = await tx.academicTerm.findFirst({
          where: { id: existing.termId, organizationId: user.organizationId! },
        });
        if (!term) {
          throw new ValidationError("Academic term for this transfer was not found.");
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
            type: "EDIT_TRANSFER",
            existingId: existing.id,
            newTransfer: {
              amountCents: input.amountCents,
              fromAccount: input.fromAccount,
              toAccount: input.toAccount,
            },
          },
          activeTransfers
        );

        if (projected.cashOnHandCents < 0 || projected.cashInBankCents < 0) {
          throw new InsufficientFundsError("Cash transfer edit failed: Insufficient balance in source account.");
        }

        const updatedResult = await tx.cashTransfer.updateMany({
          where: { id: input.id, organizationId: user.organizationId!, deletedAt: null, version: input.expectedVersion },
          data: {
            transferDate: input.transferDate,
            fromAccount: input.fromAccount,
            toAccount: input.toAccount,
            amountCents: input.amountCents,
            documentNumber: input.documentNumber?.trim() || null,
            description: input.description.trim(),
            referenceDescription: input.referenceDescription.trim(),
            eventActivityName: input.eventActivityName?.trim() || null,
            updatedByUserId: user.id,
            version: { increment: 1 },
          },
        });

        if (updatedResult.count === 0) {
          throw new ValidationError("Concurrent modification conflict.");
        }

        const updated = await tx.cashTransfer.findUnique({
          where: { id: input.id },
          include: { recordedBy: { select: { fullName: true } } },
        });

        if (!updated) {
          throw new ValidationError("Cash transfer update failed.");
        }

        await createAuditLog({
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role,
          action: AuditAction.EDITED_CASH_TRANSFER,
          entityType: "CashTransfer",
          entityId: updated.id,
          metadata: {
            before: {
              transferDate: existing.transferDate,
              fromAccount: existing.fromAccount,
              toAccount: existing.toAccount,
              amountCents: existing.amountCents,
              description: existing.description,
              referenceDescription: existing.referenceDescription,
              version: existing.version,
            },
            after: {
              transferDate: updated.transferDate,
              fromAccount: updated.fromAccount,
              toAccount: updated.toAccount,
              amountCents: updated.amountCents,
              description: updated.description,
              referenceDescription: updated.referenceDescription,
              version: updated.version,
            },
          },
          tx,
        });

        const dto = toCashTransferDto(updated);
        return { result: dto, resultEntityType: "CashTransfer", resultEntityId: updated.id };
      });
    }
  );
}

export interface DeleteTransferInput {
  id: string;
  expectedVersion: number;
  deleteReason: string;
  idempotencyKey: string;
}

export async function deleteCashTransferService(
  user: SessionUser,
  input: DeleteTransferInput
): Promise<void> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    throw new AccessDeniedError("Only authorized management roles can delete cash transfers.");
  }

  const reason = input.deleteReason.trim();
  if (!reason) {
    throw new ValidationError("A deletion reason is required for cash transfers.");
  }

  const payload = {
    id: input.id,
    expectedVersion: input.expectedVersion,
    deleteReason: reason,
  };

  return processIdempotentCommand(
    user.id,
    user.organizationId!,
    "DELETE_CASH_TRANSFER",
    input.idempotencyKey,
    payload,
    async (tx) => {
      return withTransientRetry(async () => {
        const existing = await tx.cashTransfer.findFirst({
          where: { id: input.id, organizationId: user.organizationId!, deletedAt: null },
        });
        if (!existing) {
          throw new ValidationError("Cash transfer not found or already deleted.");
        }
        if (existing.version !== input.expectedVersion) {
          throw new ValidationError("This transfer was modified by another user. Reload and review latest version.");
        }

        const term = await tx.academicTerm.findFirst({
          where: { id: existing.termId, organizationId: user.organizationId! },
        });
        if (!term) {
          throw new ValidationError("Academic term for this transfer was not found.");
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
            type: "DELETE_TRANSFER",
            existingId: existing.id,
          },
          activeTransfers
        );

        if (projected.cashOnHandCents < 0 || projected.cashInBankCents < 0) {
          throw new InsufficientFundsError("Cash transfer deletion failed: Insufficient balance in source account.");
        }

        const updatedResult = await tx.cashTransfer.updateMany({
          where: { id: input.id, organizationId: user.organizationId!, deletedAt: null, version: input.expectedVersion },
          data: {
            deletedAt: new Date(),
            deleteReason: reason,
            deletedByUserId: user.id,
            version: { increment: 1 },
          },
        });

        if (updatedResult.count === 0) {
          throw new ValidationError("Concurrent modification conflict.");
        }

        await createAuditLog({
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role,
          action: AuditAction.DELETED_CASH_TRANSFER,
          entityType: "CashTransfer",
          entityId: existing.id,
          metadata: {
            preDeletionRecord: {
              id: existing.id,
              transferDate: existing.transferDate,
              fromAccount: existing.fromAccount,
              toAccount: existing.toAccount,
              amountCents: existing.amountCents,
              description: existing.description,
              referenceDescription: existing.referenceDescription,
              version: existing.version,
            },
            deleteReason: reason,
          },
          tx,
        });

        return { result: undefined as void, resultEntityType: "CashTransfer", resultEntityId: existing.id };
      });
    }
  );
}

export async function listCashTransfersForUser(
  user: SessionUser,
  termId?: string
): Promise<CashTransferDto[]> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    return [];
  }

  let activeTermId = termId;
  if (!activeTermId) {
    const activeTerm = await prisma.academicTerm.findFirst({
      where: { organizationId: user.organizationId, active: true },
      select: { id: true },
    });
    if (!activeTerm) return [];
    activeTermId = activeTerm.id;
  }

  const transfers = await prisma.cashTransfer.findMany({
    where: {
      organizationId: user.organizationId,
      termId: activeTermId,
      deletedAt: null,
    },
    include: {
      recordedBy: { select: { fullName: true } },
    },
    orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
  });

  return transfers.map(toCashTransferDto);
}
