"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Semester } from "@prisma/client";
import { requireManagementUser } from "../auth/require-auth";
import { parsePesoToCents, PesoParseError } from "../domain/money";
import { validateAcademicYear } from "../domain/term-labels";
import {
  createAcademicTermService,
  activateAcademicTermService,
  updateOpeningBalancesService,
} from "../application/terms";
import { DomainError } from "../domain/errors";

export type TermActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

function parseBalanceField(value: string, fieldName: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new DomainError(`${fieldName} is required.`);
  }
  try {
    return parsePesoToCents(trimmed);
  } catch (error) {
    if (error instanceof PesoParseError) {
      throw new DomainError(error.message);
    }
    throw error;
  }
}

const createTermSchema = z.object({
  academicYear: z.string().min(1, "Academic year is required."),
  semester: z.nativeEnum(Semester, { message: "Invalid semester selected." }),
  openingCashOnHand: z.string(),
  openingCashInBank: z.string(),
  activate: z.string().optional(),
  idempotencyKey: z.string().trim().min(1, "Idempotency key is required."),
});

export async function createAcademicTermAction(
  _prevState: TermActionState,
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
    idempotencyKey: formData.get("idempotencyKey")?.toString() || "",
  };

  const validation = createTermSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: "Please fix the validation errors below.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { academicYear, semester, openingCashOnHand, openingCashInBank, activate, idempotencyKey } =
    validation.data;

  const yearError = validateAcademicYear(academicYear);
  if (yearError) {
    return {
      error: yearError,
      fieldErrors: { academicYear: [yearError] },
    };
  }

  let openingCashOnHandCents: number;
  let openingCashInBankCents: number;
  try {
    openingCashOnHandCents = parseBalanceField(openingCashOnHand, "Opening Cash on Hand");
    openingCashInBankCents = parseBalanceField(openingCashInBank, "Opening Cash in Bank");
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  try {
    await createAcademicTermService(user, {
      academicYear,
      semester,
      openingCashOnHandCents,
      openingCashInBankCents,
      activate: activate === "true",
      idempotencyKey,
    });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    console.error("Create term error:", error);
    return { error: "Failed to create academic term. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings/term");
  redirect("/settings/term");
}

const activateTermSchema = z.object({
  termId: z.string().min(1, "Term ID is required."),
  idempotencyKey: z.string().trim().min(1, "Idempotency key is required."),
});

export async function activateAcademicTermAction(
  _prevState: TermActionState,
  formData: FormData
): Promise<TermActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return { error: "You are not assigned to an organization." };
  }

  const rawData = {
    termId: formData.get("termId")?.toString() || "",
    idempotencyKey: formData.get("idempotencyKey")?.toString() || "",
  };

  const validation = activateTermSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: "Please fix the validation errors below.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  try {
    await activateAcademicTermService(user, {
      termId: validation.data.termId,
      idempotencyKey: validation.data.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
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
  version: z.string().trim().min(1, "Version is required.").refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1, "Version must be a positive integer."),
  idempotencyKey: z.string().trim().min(1, "Idempotency key is required."),
});

export async function updateOpeningBalancesAction(
  _prevState: TermActionState,
  formData: FormData
): Promise<TermActionState> {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return { error: "You are not assigned to an organization." };
  }

  const rawVersion = formData.get("version")?.toString();
  if (!rawVersion || !rawVersion.trim()) {
    return { error: "Missing or malformed term version." };
  }

  const rawData = {
    termId: formData.get("termId")?.toString() || "",
    openingCashOnHand: formData.get("openingCashOnHand")?.toString() || "",
    openingCashInBank: formData.get("openingCashInBank")?.toString() || "",
    version: rawVersion.trim(),
    idempotencyKey: formData.get("idempotencyKey")?.toString() || "",
  };

  const validation = updateBalancesSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      error: "Please fix the validation errors below.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { termId, openingCashOnHand, openingCashInBank, version, idempotencyKey } = validation.data;

  let openingCashOnHandCents: number;
  let openingCashInBankCents: number;
  try {
    openingCashOnHandCents = parseBalanceField(openingCashOnHand, "Opening Cash on Hand");
    openingCashInBankCents = parseBalanceField(openingCashInBank, "Opening Cash in Bank");
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  try {
    const expectedVersion = parseInt(version, 10);
    await updateOpeningBalancesService(user, {
      termId,
      expectedVersion,
      openingCashOnHandCents,
      openingCashInBankCents,
      idempotencyKey,
    });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    console.error("Update balances error:", error);
    return { error: "Failed to update opening balances. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings/term");
  redirect("/settings/term");
}
