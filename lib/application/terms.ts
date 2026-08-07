import { AcademicTerm, Semester } from "@prisma/client";
import { SessionUser } from "../auth/session";
import { isManagementRole } from "../auth/rbac";
import {
  AccessDeniedError,
  ConcurrentModificationError,
  RecordNotFoundError,
  ValidationError,
} from "../domain/errors";
import {
  calculateBalanceForwarded,
  validateMoneyAmount,
} from "../domain/money";
import { normalizeAcademicYear } from "../domain/term-labels";
import { createAuditLog } from "../data/audit-log";
import { AuditAction } from "@prisma/client";

import { processIdempotentCommand } from "./idempotency";
import { withTransientRetry } from "../infrastructure/db/retry";
import { projectMutationBalances, hasNegativeAccountBalance } from "../domain/financial";

export interface CreateTermInput {
  academicYear: string;
  semester: Semester;
  openingCashOnHandCents: number;
  openingCashInBankCents: number;
  activate?: boolean;
  idempotencyKey: string;
}

export async function createAcademicTermService(
  user: SessionUser,
  input: CreateTermInput
): Promise<AcademicTerm> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    throw new AccessDeniedError("Only authorized management roles can manage academic terms.");
  }

  const canonicalYear = normalizeAcademicYear(input.academicYear);
  validateMoneyAmount(input.openingCashOnHandCents, true, "Opening Cash on Hand");
  validateMoneyAmount(input.openingCashInBankCents, true, "Opening Cash in Bank");

  const payload = {
    academicYear: canonicalYear,
    semester: input.semester,
    openingCashOnHandCents: input.openingCashOnHandCents,
    openingCashInBankCents: input.openingCashInBankCents,
    activate: Boolean(input.activate),
  };

  return withTransientRetry(() =>
    processIdempotentCommand(
      user.id,
      user.organizationId!,
      "CREATE_ACADEMIC_TERM",
      input.idempotencyKey,
      payload,
      async (tx) => {
        const existingActive = await tx.academicTerm.findFirst({
          where: { organizationId: user.organizationId!, active: true },
        });

        const shouldActivate = !existingActive || input.activate === true;

        if (shouldActivate) {
          await tx.academicTerm.updateMany({
            where: { organizationId: user.organizationId!, active: true },
            data: { active: false },
          });
        }

        const term = await tx.academicTerm.create({
          data: {
            organizationId: user.organizationId!,
            academicYear: canonicalYear,
            semester: input.semester,
            openingCashOnHandCents: input.openingCashOnHandCents,
            openingCashInBankCents: input.openingCashInBankCents,
            active: shouldActivate,
          },
        });

        const balanceForwarded = calculateBalanceForwarded(
          input.openingCashOnHandCents,
          input.openingCashInBankCents
        );

        await createAuditLog({
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role,
          action: AuditAction.CHANGED_OPENING_BALANCE,
          entityType: "AcademicTerm",
          entityId: term.id,
          metadata: {
            academicYear: canonicalYear,
            semester: input.semester,
            previousCashOnHandCents: 0,
            newCashOnHandCents: input.openingCashOnHandCents,
            previousCashInBankCents: 0,
            newCashInBankCents: input.openingCashInBankCents,
            previousBalanceForwardedCents: 0,
            newBalanceForwardedCents: balanceForwarded,
            operation: "CREATE",
          },
          tx,
        });

        return { result: term, resultEntityType: "AcademicTerm", resultEntityId: term.id };
      }
    )
  ).then((outcome) => outcome.result);
}

export interface ActivateTermInput {
  termId: string;
  idempotencyKey: string;
}

export async function activateAcademicTermService(
  user: SessionUser,
  input: ActivateTermInput
): Promise<AcademicTerm> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    throw new AccessDeniedError("Only authorized management roles can activate academic terms.");
  }

  return withTransientRetry(() =>
    processIdempotentCommand(
      user.id,
      user.organizationId!,
      "ACTIVATE_ACADEMIC_TERM",
      input.idempotencyKey,
      { termId: input.termId },
      async (tx) => {
        const targetTerm = await tx.academicTerm.findFirst({
          where: { id: input.termId, organizationId: user.organizationId! },
        });
        if (!targetTerm) {
          throw new RecordNotFoundError("Academic term not found or access denied.");
        }

        const previousActiveTerm = await tx.academicTerm.findFirst({
          where: {
            organizationId: user.organizationId!,
            active: true,
            id: { not: targetTerm.id },
          },
          select: { id: true },
        });

        await tx.academicTerm.updateMany({
          where: { organizationId: user.organizationId!, active: true },
          data: { active: false },
        });

        const activated = await tx.academicTerm.update({
          where: { id: input.termId },
          data: { active: true },
        });

        await createAuditLog({
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role,
          action: AuditAction.ACTIVATED_ACADEMIC_TERM,
          entityType: "AcademicTerm",
          entityId: activated.id,
          metadata: {
            academicYear: activated.academicYear,
            semester: activated.semester,
            previousActiveTermId: previousActiveTerm?.id || null,
          },
          tx,
        });

        return { result: activated, resultEntityType: "AcademicTerm", resultEntityId: activated.id };
      }
    )
  ).then((outcome) => outcome.result);
}

export interface UpdateOpeningBalancesInput {
  termId: string;
  expectedVersion: number;
  openingCashOnHandCents: number;
  openingCashInBankCents: number;
  idempotencyKey: string;
}

export async function updateOpeningBalancesService(
  user: SessionUser,
  input: UpdateOpeningBalancesInput
): Promise<AcademicTerm> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    throw new AccessDeniedError("Only authorized management roles can update opening balances.");
  }

  validateMoneyAmount(input.openingCashOnHandCents, true, "Opening Cash on Hand");
  validateMoneyAmount(input.openingCashInBankCents, true, "Opening Cash in Bank");

  const payload = {
    termId: input.termId,
    expectedVersion: input.expectedVersion,
    openingCashOnHandCents: input.openingCashOnHandCents,
    openingCashInBankCents: input.openingCashInBankCents,
  };

  return withTransientRetry(() =>
    processIdempotentCommand(
      user.id,
      user.organizationId!,
      "UPDATE_OPENING_BALANCES",
      input.idempotencyKey,
      payload,
      async (tx) => {
        const existing = await tx.academicTerm.findFirst({
          where: { id: input.termId, organizationId: user.organizationId! },
        });
        if (!existing) throw new RecordNotFoundError("Academic term not found.");

        if (existing.version !== input.expectedVersion) {
          throw new ConcurrentModificationError("Academic term was modified by another user.");
        }

        const activeTransactions = await tx.transaction.findMany({
          where: { organizationId: user.organizationId!, termId: existing.id, deletedAt: null },
          select: { id: true, type: true, amountCents: true, cashAccount: true },
        });

        const activeTransfers = await tx.cashTransfer.findMany({
          where: { organizationId: user.organizationId!, termId: existing.id, deletedAt: null },
          select: { id: true, amountCents: true, fromAccount: true, toAccount: true },
        });

        const projected = projectMutationBalances(
          existing.openingCashOnHandCents,
          existing.openingCashInBankCents,
          activeTransactions,
          {
            type: "SET_OPENING",
            openingCashOnHandCents: input.openingCashOnHandCents,
            openingCashInBankCents: input.openingCashInBankCents,
          },
          activeTransfers
        );

        if (hasNegativeAccountBalance(projected)) {
          throw new ValidationError("Opening balance update would create a negative account balance.");
        }

        const updatedResult = await tx.academicTerm.updateMany({
          where: { id: input.termId, organizationId: user.organizationId!, version: input.expectedVersion },
          data: {
            openingCashOnHandCents: input.openingCashOnHandCents,
            openingCashInBankCents: input.openingCashInBankCents,
            version: { increment: 1 },
          },
        });

        if (updatedResult.count === 0) {
          throw new ConcurrentModificationError();
        }

        const updated = await tx.academicTerm.findUnique({
          where: { id: input.termId },
        });

        if (!updated) {
          throw new RecordNotFoundError("Academic term update failed.");
        }

        await createAuditLog({
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role,
          action: AuditAction.CHANGED_OPENING_BALANCE,
          entityType: "AcademicTerm",
          entityId: input.termId,
          metadata: {
            academicYear: existing.academicYear,
            semester: existing.semester,
            previousCashOnHandCents: existing.openingCashOnHandCents,
            newCashOnHandCents: input.openingCashOnHandCents,
            previousCashInBankCents: existing.openingCashInBankCents,
            newCashInBankCents: input.openingCashInBankCents,
            previousBalanceForwardedCents: calculateBalanceForwarded(
              existing.openingCashOnHandCents,
              existing.openingCashInBankCents
            ),
            newBalanceForwardedCents: calculateBalanceForwarded(
              input.openingCashOnHandCents,
              input.openingCashInBankCents
            ),
            operation: "UPDATE",
          },
          tx,
        });

        return { result: updated, resultEntityType: "AcademicTerm", resultEntityId: updated.id };
      }
    )
  ).then((outcome) => outcome.result);
}
