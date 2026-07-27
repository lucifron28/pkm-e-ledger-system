"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, Semester, AuditAction } from "@prisma/client";
import { prisma } from "../db/prisma";
import { requireManagementUser } from "../auth/require-auth";
import { createAuditLog } from "../data/audit-log";
import {
  parsePesoToCents,
  PesoParseError,
  calculateBalanceForwarded,
} from "../data/money";
import { calculateAccountBalances, hasNegativeAccountBalance } from "../domain/financial";
import {
  validateAcademicYear,
  getActiveTermForCurrentUser,
  getTermByIdForCurrentUser,
} from "../data/terms";

function parseBalanceField(value: string, fieldName: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${fieldName} is required.`);
  }
  try {
    return parsePesoToCents(trimmed);
  } catch (error) {
    if (error instanceof PesoParseError) {
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

export type TermActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

const createTermSchema = z.object({
  academicYear: z.string().min(1, "Academic year is required."),
  semester: z.nativeEnum(Semester, { message: "Invalid semester selected." }),
  openingCashOnHand: z.string(),
  openingCashInBank: z.string(),
  activate: z.string().optional(),
});

export async function createAcademicTermAction(
  prevState: TermActionState,
  formData: FormData
): Promise<TermActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return { error: "You are not assigned to an organization." };
  }

  const rawData = {
    academicYear: formData.get("academicYear")?.toString() || "",
    semester: formData.get("semester")?.toString() || "",
    openingCashOnHand: formData.get("openingCashOnHand")?.toString() || "",
    openingCashInBank: formData.get("openingCashInBank")?.toString() || "",
    activate: formData.get("activate")?.toString() || undefined,
  };

  const validation = createTermSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: "Please fix the validation errors below.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { academicYear, semester, openingCashOnHand, openingCashInBank, activate } =
    validation.data;

  const yearError = validateAcademicYear(academicYear);
  if (yearError) {
    return {
      error: yearError,
      fieldErrors: { academicYear: [yearError] },
    };
  }

  const validatedAcademicYear = academicYear.trim();

  let cashOnHandCents: number;
  let cashInBankCents: number;
  try {
    cashOnHandCents = parseBalanceField(openingCashOnHand, "Opening Cash on Hand");
    cashInBankCents = parseBalanceField(openingCashInBank, "Opening Cash in Bank");
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: error.message };
    }
    throw error;
  }

  // Determine if new term should be active
  const existingActive = await getActiveTermForCurrentUser();
  let shouldActivate = false;
  if (!existingActive) {
    shouldActivate = true;
  } else if (activate === "true") {
    shouldActivate = true;
  }

  const balanceForwarded = calculateBalanceForwarded(cashOnHandCents, cashInBankCents);

  try {
    await prisma.$transaction(async (tx) => {
      if (shouldActivate) {
        await tx.academicTerm.updateMany({
          where: { organizationId: user.organizationId!, active: true },
          data: { active: false },
        });
      }

      const term = await tx.academicTerm.create({
        data: {
          organizationId: user.organizationId!,
          academicYear: validatedAcademicYear,
          semester,
          openingCashOnHandCents: cashOnHandCents,
          openingCashInBankCents: cashInBankCents,
          active: shouldActivate,
        },
      });

      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.CHANGED_OPENING_BALANCE,
        entityType: "AcademicTerm",
        entityId: term.id,
        metadata: {
          academicYear: validatedAcademicYear,
          semester,
          previousCashOnHandCents: 0,
          newCashOnHandCents: cashOnHandCents,
          previousCashInBankCents: 0,
          newCashInBankCents: cashInBankCents,
          previousBalanceForwardedCents: 0,
          newBalanceForwardedCents: balanceForwarded,
          operation: "CREATE",
        },
        tx,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        error: "This academic term already exists.",
        fieldErrors: { academicYear: ["This academic term already exists."] },
      };
    }
    console.error("Create term error:", error);
    return { error: "Failed to create academic term. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings/term");
  redirect("/settings/term");
}

const activateTermSchema = z.object({
  termId: z.string().min(1, "Term ID is required."),
});

export async function activateAcademicTermAction(
  prevState: TermActionState,
  formData: FormData
): Promise<TermActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return { error: "You are not assigned to an organization." };
  }

  const rawData = {
    termId: formData.get("termId")?.toString() || "",
  };

  const validation = activateTermSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: "Please fix the validation errors below.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { termId } = validation.data;

  const term = await getTermByIdForCurrentUser(termId);
  if (!term) {
    return { error: "Academic term not found." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.academicTerm.updateMany({
        where: { organizationId: user.organizationId!, active: true },
        data: { active: false },
      });

      await tx.academicTerm.update({
        where: { id: termId },
        data: { active: true },
      });
    });
  } catch (error) {
    console.error("Activate term error:", error);
    return { error: "Failed to activate academic term. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings/term");
  redirect("/settings/term");
}

const updateBalancesSchema = z.object({
  termId: z.string().min(1, "Term ID is required."),
  openingCashOnHand: z.string(),
  openingCashInBank: z.string(),
});

export async function updateOpeningBalancesAction(
  prevState: TermActionState,
  formData: FormData
): Promise<TermActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return { error: "You are not assigned to an organization." };
  }

  const rawData = {
    termId: formData.get("termId")?.toString() || "",
    openingCashOnHand: formData.get("openingCashOnHand")?.toString() || "",
    openingCashInBank: formData.get("openingCashInBank")?.toString() || "",
  };

  const validation = updateBalancesSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: "Please fix the validation errors below.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { termId, openingCashOnHand, openingCashInBank } = validation.data;

  let cashOnHandCents: number;
  let cashInBankCents: number;
  try {
    cashOnHandCents = parseBalanceField(openingCashOnHand, "Opening Cash on Hand");
    cashInBankCents = parseBalanceField(openingCashInBank, "Opening Cash in Bank");
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: error.message };
    }
    throw error;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.academicTerm.findFirst({
        where: { id: termId, organizationId: user.organizationId! },
      });
      if (!existing) throw new ValidationError("Academic term not found.");

      const rows = await tx.transaction.findMany({
        where: { organizationId: user.organizationId!, termId: existing.id, deletedAt: null },
        select: { type: true, amountCents: true, cashAccount: true },
      });
      const projected = calculateAccountBalances(
        cashOnHandCents,
        cashInBankCents,
        rows
      );
      if (hasNegativeAccountBalance(projected)) {
        throw new ValidationError("Opening balance update would create a negative account balance.");
      }

      await tx.academicTerm.update({
        where: { id: termId },
        data: {
          openingCashOnHandCents: cashOnHandCents,
          openingCashInBankCents: cashInBankCents,
        },
      });

      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.CHANGED_OPENING_BALANCE,
        entityType: "AcademicTerm",
        entityId: termId,
        metadata: {
          academicYear: existing.academicYear,
          semester: existing.semester,
          previousCashOnHandCents: existing.openingCashOnHandCents,
          newCashOnHandCents: cashOnHandCents,
          previousCashInBankCents: existing.openingCashInBankCents,
          newCashInBankCents: cashInBankCents,
          previousBalanceForwardedCents: calculateBalanceForwarded(
            existing.openingCashOnHandCents,
            existing.openingCashInBankCents
          ),
          newBalanceForwardedCents: calculateBalanceForwarded(
            cashOnHandCents,
            cashInBankCents
          ),
          operation: "UPDATE",
        },
        tx,
      });
    });
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    console.error("Update balances error:", error);
    return { error: "Failed to update opening balances. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings/term");
  redirect("/settings/term");
}
