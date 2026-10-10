import { prisma } from "../db/prisma";
import crypto from "crypto";
import { defaultAttachmentStorageService } from "../infrastructure/storage/attachment-store";
import type { StagedUploadResult } from "../infrastructure/storage/attachment-store";
import {
  consumeUploadAuthorization,
  verifyAndSecureAttachmentStorage,
} from "../infrastructure/storage/attachment-verification";
import type { VerifiedAttachmentStorageResult } from "../infrastructure/storage/attachment-verification";
import {
  claimCommandReceipt,
  processIdempotentCommand,
  releaseCommandReceipt,
} from "./idempotency";
import { withTransientRetry } from "../infrastructure/db/retry";
import { AuditAction, CashAccount, CashTransfer } from "@prisma/client";
import type { SessionUser } from "../auth/session";
import { isManagementRole } from "../auth/rbac";
import {
  AccessDeniedError,
  ConcurrentModificationError,
  InsufficientFundsError,
  RecordNotFoundError,
  ValidationError,
} from "../domain/errors";
import { validateMoneyAmount } from "../domain/money";
import { validateAttachmentPayload } from "../domain/attachments";
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
  termId: string;
  transferDate: Date;
  fromAccount: CashAccount;
  toAccount: CashAccount;
  amountCents: number;
  documentNumber?: string | null;
  description: string;
  referenceDescription: string;
  eventActivityName?: string | null;
  idempotencyKey: string;
  attachment: {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    buffer?: Uint8Array | Buffer;
    storageKey?: string;
  };
}

export interface TransferServiceDependencies {
  storageService?: typeof defaultAttachmentStorageService;
}

export async function createCashTransferService(
  user: SessionUser,
  input: CreateTransferInput,
  dependencies: TransferServiceDependencies = {}
): Promise<CashTransferDto> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    throw new AccessDeniedError("Only authorized management roles can record cash transfers.");
  }

  if (input.fromAccount === input.toAccount) {
    throw new ValidationError("Transfer source and destination accounts must be different.");
  }

  validateMoneyAmount(input.amountCents, false, "Transfer amount");
  let fileHash: string;
  let verifiedUpload: VerifiedAttachmentStorageResult | null = null;
  const isPreUploaded = Boolean(input.attachment.storageKey);

  if (input.attachment.storageKey) {
    verifiedUpload = await verifyAndSecureAttachmentStorage(
      {
        storageKey: input.attachment.storageKey,
        originalName: input.attachment.originalName,
        mimeType: input.attachment.mimeType,
        sizeBytes: input.attachment.sizeBytes,
      },
      user
    );
    input.attachment.originalName = verifiedUpload.originalName;
    input.attachment.mimeType = verifiedUpload.mimeType;
    input.attachment.sizeBytes = verifiedUpload.sizeBytes;
    fileHash = crypto.createHash("sha256").update(verifiedUpload.storageKey).digest("hex");
  } else if (input.attachment.buffer) {
    const attachmentError = validateAttachmentPayload(
      input.attachment.originalName,
      input.attachment.mimeType,
      input.attachment.buffer,
      input.attachment.sizeBytes
    );
    if (attachmentError) throw new ValidationError(attachmentError);
    fileHash = crypto.createHash("sha256").update(input.attachment.buffer).digest("hex");
  } else {
    throw new ValidationError("Attachment file or storage key is required.");
  }

  const payload = {
    termId: input.termId,
    transferDate: input.transferDate.toISOString(),
    fromAccount: input.fromAccount,
    toAccount: input.toAccount,
    amountCents: input.amountCents,
    documentNumber: input.documentNumber || null,
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

  const receipt = await claimCommandReceipt<CashTransferDto>(
    user.id,
    user.organizationId,
    "CREATE_CASH_TRANSFER",
    input.idempotencyKey,
    payload
  );
  if (receipt.status === "COMPLETED") {
    return receipt.result;
  }

  const claim = receipt.claim;
  const storageService = dependencies.storageService || defaultAttachmentStorageService;
  let staged: StagedUploadResult | null = null;
  let committedName: string | null = input.attachment.storageKey || null;
  try {
    if (!isPreUploaded && !committedName && input.attachment.buffer) {
      staged = await storageService.stageUpload(
        input.attachment.buffer,
        input.attachment.originalName,
        input.attachment.mimeType
      );
      const committed = await storageService.commitUpload(staged.stageId, staged.extension);
      committedName = committed.storageKey;
    }
    const outcome = await withTransientRetry(() =>
      processIdempotentCommand<CashTransferDto>(
        user.id,
        user.organizationId!,
        "CREATE_CASH_TRANSFER",
        input.idempotencyKey,
        payload,
        async (tx) => {
          const term = await tx.academicTerm.findFirst({
            where: { id: input.termId, organizationId: user.organizationId!, active: true },
          });
          if (!term) {
            throw new ValidationError("The selected academic term is no longer active. Reload the ledger before recording this entry.");
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

          if (verifiedUpload?.isLocalStaged && verifiedUpload.stageId && verifiedUpload.extension) {
            const committed = await storageService.commitUpload(verifiedUpload.stageId, verifiedUpload.extension);
            committedName = committed.storageKey;
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

          const attachment = await tx.attachment.create({
            data: {
              cashTransferId: created.id,
              uploadedById: user.id,
              originalName: input.attachment.originalName,
              storageKey: committedName!,
              mimeType: input.attachment.mimeType,
              sizeBytes: input.attachment.sizeBytes,
            },
          });
          if (verifiedUpload?.uploadId) {
            await consumeUploadAuthorization(tx, user.id, verifiedUpload.uploadId, attachment.id);
          }

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
              documentNumber: created.documentNumber,
              description: created.description,
              referenceDescription: created.referenceDescription,
              eventActivityName: created.eventActivityName,
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
            metadata: { cashTransferId: created.id, originalName: input.attachment.originalName, sizeBytes: input.attachment.sizeBytes },
            tx,
          });

          const dto = toCashTransferDto(created);
          return { result: dto, resultEntityType: "CashTransfer", resultEntityId: created.id };
        },
        { claimToken: claim.claimToken }
      )
    );

    if (outcome.disposition === "CACHED" && committedName && !isPreUploaded) {
      await storageService.deleteActiveFile(committedName).catch(() => undefined);
    }

    return outcome.result;
  } catch (error) {
    if (staged && !committedName) {
      await storageService.discardStagedUpload(staged.stageId, staged.extension).catch(() => undefined);
    }
    if (committedName && !isPreUploaded) {
      let lookupState: "LOOKUP_SUCCEEDED_REFERENCED" | "LOOKUP_SUCCEEDED_UNREFERENCED" | "LOOKUP_FAILED" = "LOOKUP_FAILED";
      try {
        const ref = await prisma.attachment.findFirst({
          where: { storageKey: committedName },
          select: { id: true },
        });
        lookupState = ref ? "LOOKUP_SUCCEEDED_REFERENCED" : "LOOKUP_SUCCEEDED_UNREFERENCED";
      } catch (lookupErr) {
        console.warn("[CashTransfer] Attachment ownership lookup failed; retaining active file for reconciliation:", lookupErr);
        lookupState = "LOOKUP_FAILED";
      }
      if (lookupState === "LOOKUP_SUCCEEDED_UNREFERENCED") {
        await storageService.deleteActiveFile(committedName).catch(() => undefined);
      }
    }
    await releaseCommandReceipt(claim).catch(() => undefined);
    throw error;
  }
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

  return withTransientRetry(() =>
    processIdempotentCommand(
      user.id,
      user.organizationId!,
      "EDIT_CASH_TRANSFER",
      input.idempotencyKey,
      payload,
      async (tx) => {
        const existing = await tx.cashTransfer.findFirst({
          where: { id: input.id, organizationId: user.organizationId!, deletedAt: null },
        });
        if (!existing) {
          throw new RecordNotFoundError("Cash transfer not found or access denied.");
        }
        if (existing.version !== input.expectedVersion) {
          throw new ConcurrentModificationError("This transfer was modified by another user. Reload and review latest version.");
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
          throw new ConcurrentModificationError();
        }

        const updated = await tx.cashTransfer.findUnique({
          where: { id: input.id },
          include: { recordedBy: { select: { fullName: true } } },
        });

        if (!updated) {
          throw new RecordNotFoundError("Cash transfer update failed.");
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
              id: existing.id,
              organizationId: existing.organizationId,
              termId: existing.termId,
              transferDate: existing.transferDate.toISOString(),
              fromAccount: existing.fromAccount,
              toAccount: existing.toAccount,
              amountCents: existing.amountCents,
              documentNumber: existing.documentNumber,
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
              transferDate: updated.transferDate.toISOString(),
              fromAccount: updated.fromAccount,
              toAccount: updated.toAccount,
              amountCents: updated.amountCents,
              documentNumber: updated.documentNumber,
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

        const dto = toCashTransferDto(updated);
        return { result: dto, resultEntityType: "CashTransfer", resultEntityId: updated.id };
      }
    )
  ).then((outcome) => outcome.result);
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

  return withTransientRetry(() =>
    processIdempotentCommand(
      user.id,
      user.organizationId!,
      "DELETE_CASH_TRANSFER",
      input.idempotencyKey,
      payload,
      async (tx) => {
        const existing = await tx.cashTransfer.findFirst({
          where: { id: input.id, organizationId: user.organizationId!, deletedAt: null },
        });
        if (!existing) {
          throw new RecordNotFoundError("Cash transfer not found or already deleted.");
        }
        if (existing.version !== input.expectedVersion) {
          throw new ConcurrentModificationError("This transfer was modified by another user. Reload and review latest version.");
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
          throw new ConcurrentModificationError();
        }

        await createAuditLog({
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role,
          action: AuditAction.DELETED_CASH_TRANSFER,
          entityType: "CashTransfer",
          entityId: existing.id,
          metadata: {
            deleteReason: reason,
            before: {
              id: existing.id,
              organizationId: existing.organizationId,
              termId: existing.termId,
              transferDate: existing.transferDate.toISOString(),
              fromAccount: existing.fromAccount,
              toAccount: existing.toAccount,
              amountCents: existing.amountCents,
              documentNumber: existing.documentNumber,
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

        return { result: undefined as void, resultEntityType: "CashTransfer", resultEntityId: existing.id };
      }
    )
  ).then((outcome) => outcome.result);
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
