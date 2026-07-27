"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireManagementUser } from "../auth/require-auth";
import { createAuditLog } from "../data/audit-log";
import { parsePesoToCents, PesoParseError } from "../data/money";
import {
  _getAvailableBalance,
} from "../data/transactions";
import { getTransactionForEdit } from "../data/transactions";
import {
  TransactionType,
  CashAccount,
  AuditAction,
} from "@prisma/client";

function parseAmountField(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new ValidationError("Amount is required.");
  if (trimmed.startsWith("-"))
    throw new ValidationError("Amount must be positive.");
  try {
    const cents = parsePesoToCents(trimmed);
    if (cents <= 0) throw new ValidationError("Amount must be positive.");
    return cents;
  } catch (error) {
    if (error instanceof PesoParseError || error instanceof ValidationError) {
      throw new ValidationError(error.message);
    }
    throw error;
  }
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

type TxActionState = { error?: string; fieldErrors?: Record<string, string[]> } | null;

const transactionSchema = z.object({
  type: z.nativeEnum(TransactionType, { message: "Transaction type is required." }),
  transactionDate: z.string().min(1, "Transaction date is required."),
  amount: z.string(),
  cashAccount: z.nativeEnum(CashAccount, { message: "Cash account is required." }),
  categoryId: z.string().min(1, "Category is required."),
  documentNumber: z.string().optional(),
  counterpartyName: z.string().optional(),
  description: z.string().min(1, "Description is required."),
  referenceDescription: z.string().min(1, "Reference description is required."),
  eventActivityName: z.string().optional(),
});

export async function createTransactionAction(
  prevState: TxActionState,
  formData: FormData
): Promise<TxActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return { error: "You are not assigned to an organization." };
  }

  const rawData = {
    type: formData.get("type")?.toString() || "",
    transactionDate: formData.get("transactionDate")?.toString() || "",
    amount: formData.get("amount")?.toString() || "",
    cashAccount: formData.get("cashAccount")?.toString() || "",
    categoryId: formData.get("categoryId")?.toString() || "",
    documentNumber: formData.get("documentNumber")?.toString() || "",
    counterpartyName: formData.get("counterpartyName")?.toString() || "",
    description: formData.get("description")?.toString() || "",
    referenceDescription: formData.get("referenceDescription")?.toString() || "",
    eventActivityName: formData.get("eventActivityName")?.toString() || "",
  };

  const validation = transactionSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: "Please fix the validation errors below.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const d = validation.data;

  const activeTerm = await prisma.academicTerm.findFirst({
    where: { organizationId: user.organizationId, active: true },
  });
  if (!activeTerm) {
    return { error: "No active academic term configured." };
  }

  const category = await prisma.transactionCategory.findUnique({
    where: { id: d.categoryId },
  });
  if (!category || !category.active || category.type !== d.type) {
    return { error: "Invalid or inactive category for this transaction type." };
  }

  let amountCents: number;
  try {
    amountCents = parseAmountField(d.amount);
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    throw error;
  }

  if (d.type === TransactionType.EXPENSE) {
    const available = await _getAvailableBalance(
      user.organizationId,
      activeTerm.id,
      d.cashAccount
    );
    if (available < amountCents) {
      const accountLabel = d.cashAccount === CashAccount.CASH_ON_HAND ? "Cash on Hand" : "Cash in Bank";
      return { error: `Insufficient funds in ${accountLabel} balance.` };
    }
  }

  const transactionDate = new Date(d.transactionDate + "T00:00:00.000Z");
  const auditAction =
    d.type === TransactionType.INCOME ? AuditAction.ADDED_INCOME : AuditAction.ADDED_EXPENSE;

  try {
    await prisma.$transaction(async (tx) => {
      const t = await tx.transaction.create({
        data: {
          organizationId: user.organizationId!,
          termId: activeTerm.id,
          type: d.type,
          transactionDate,
          amountCents,
          cashAccount: d.cashAccount,
          categoryId: d.categoryId,
          documentNumber: d.documentNumber || null,
          counterpartyName: d.counterpartyName || null,
          description: d.description,
          referenceDescription: d.referenceDescription,
          eventActivityName: d.eventActivityName || null,
          recordedByUserId: user.id,
        },
      });

      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: auditAction,
        entityType: "Transaction",
        entityId: t.id,
        metadata: {
          type: d.type,
          cashAccount: d.cashAccount,
          amountCents,
        },
        tx,
      });
    });
  } catch (error) {
    console.error("Create transaction error:", error);
    return { error: "Failed to record transaction. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  redirect("/ledger");
}

const editTransactionSchema = transactionSchema.extend({
  id: z.string().min(1),
});

export async function editTransactionAction(
  prevState: TxActionState,
  formData: FormData
): Promise<TxActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return { error: "You are not assigned to an organization." };
  }

  const rawData = {
    id: formData.get("id")?.toString() || "",
    type: formData.get("type")?.toString() || "",
    transactionDate: formData.get("transactionDate")?.toString() || "",
    amount: formData.get("amount")?.toString() || "",
    cashAccount: formData.get("cashAccount")?.toString() || "",
    categoryId: formData.get("categoryId")?.toString() || "",
    documentNumber: formData.get("documentNumber")?.toString() || "",
    counterpartyName: formData.get("counterpartyName")?.toString() || "",
    description: formData.get("description")?.toString() || "",
    referenceDescription: formData.get("referenceDescription")?.toString() || "",
    eventActivityName: formData.get("eventActivityName")?.toString() || "",
  };

  const validation = editTransactionSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: "Please fix the validation errors below.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const d = validation.data;

  const existing = await getTransactionForEdit(d.id);
  if (!existing) return { error: "Transaction not found." };
  if (existing.deletedAt) return { error: "Cannot edit a deleted transaction." };

  const activeTerm = await prisma.academicTerm.findFirst({
    where: { organizationId: user.organizationId, active: true },
  });
  if (!activeTerm) return { error: "No active academic term configured." };

  const category = await prisma.transactionCategory.findUnique({
    where: { id: d.categoryId },
  });
  if (!category || !category.active || category.type !== d.type) {
    return { error: "Invalid or inactive category for this transaction type." };
  }

  let amountCents: number;
  try {
    amountCents = parseAmountField(d.amount);
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    throw error;
  }

  const available = await _getAvailableBalance(
    user.organizationId,
    activeTerm.id,
    d.cashAccount,
    existing.id
  );

  if (d.type === TransactionType.EXPENSE && available < amountCents) {
    const accountLabel = d.cashAccount === CashAccount.CASH_ON_HAND ? "Cash on Hand" : "Cash in Bank";
    return { error: `Insufficient funds in ${accountLabel} balance.` };
  }

  if (
    d.type === TransactionType.EXPENSE &&
    existing.type === TransactionType.INCOME &&
    d.cashAccount !== existing.cashAccount
  ) {
    const oppositeAvailable = await _getAvailableBalance(
      user.organizationId,
      activeTerm.id,
      d.cashAccount,
      existing.id
    );
    if (oppositeAvailable < amountCents) {
      return { error: `Insufficient funds in target account balance.` };
    }
  }

  const transactionDate = new Date(d.transactionDate + "T00:00:00.000Z");

  try {
    await prisma.$transaction(async (tx) => {
      const before = {
        type: existing.type,
        amountCents: existing.amountCents,
        cashAccount: existing.cashAccount,
        categoryId: existing.categoryId,
      };

      await tx.transaction.update({
        where: { id: d.id },
        data: {
          type: d.type,
          transactionDate,
          amountCents,
          cashAccount: d.cashAccount,
          categoryId: d.categoryId,
          documentNumber: d.documentNumber || null,
          counterpartyName: d.counterpartyName || null,
          description: d.description,
          referenceDescription: d.referenceDescription,
          eventActivityName: d.eventActivityName || null,
          updatedByUserId: user.id,
        },
      });

      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.EDITED_TRANSACTION,
        entityType: "Transaction",
        entityId: d.id,
        metadata: { before, after: { type: d.type, amountCents, cashAccount: d.cashAccount } },
        tx,
      });
    });
  } catch (error) {
    console.error("Edit transaction error:", error);
    return { error: "Failed to edit transaction. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  redirect("/ledger");
}

const deleteTransactionSchema = z.object({
  id: z.string().min(1),
  deleteReason: z.string().min(1, "Deletion reason is required."),
});

export async function softDeleteTransactionAction(
  prevState: TxActionState,
  formData: FormData
): Promise<TxActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return { error: "You are not assigned to an organization." };
  }

  const rawData = {
    id: formData.get("id")?.toString() || "",
    deleteReason: formData.get("deleteReason")?.toString() || "",
  };

  const validation = deleteTransactionSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: "Please fix the validation errors below.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { id, deleteReason } = validation.data;

  const existing = await getTransactionForEdit(id);
  if (!existing) return { error: "Transaction not found." };
  if (existing.deletedAt) return { error: "Transaction is already deleted." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedByUserId: user.id,
          deleteReason,
        },
      });

      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.DELETED_TRANSACTION,
        entityType: "Transaction",
        entityId: id,
        metadata: {
          deleteReason,
          type: existing.type,
          amountCents: existing.amountCents,
          cashAccount: existing.cashAccount,
        },
        tx,
      });
    });
  } catch (error) {
    console.error("Soft delete transaction error:", error);
    return { error: "Failed to delete transaction. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/ledger");
  redirect("/ledger");
}
