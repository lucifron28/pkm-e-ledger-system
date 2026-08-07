"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { hashPassword, verifyPassword } from "../auth/password";
import { getSessionResult } from "../auth/session";
import { createSystemAuditLog } from "../data/audit-log";
import { AuditAction, Role } from "@prisma/client";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
  confirmNewPassword: z.string().min(8, "Confirm new password is required."),
});

export type ChangePasswordState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
} | null;

export async function changePasswordAction(
  prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const sessionResult = await getSessionResult();
  if (!sessionResult) {
    redirect("/login");
  }

  const { user, session } = sessionResult;

  const rawData = {
    currentPassword: formData.get("currentPassword")?.toString() || "",
    newPassword: formData.get("newPassword")?.toString() || "",
    confirmNewPassword: formData.get("confirmNewPassword")?.toString() || "",
  };

  const validation = passwordSchema.safeParse(rawData);

  if (!validation.success) {
    return {
      error: "Please fix the validation errors below.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { currentPassword, newPassword, confirmNewPassword } = validation.data;

  // New passwords match check
  if (newPassword !== confirmNewPassword) {
    return {
      error: "New passwords do not match.",
      fieldErrors: {
        confirmNewPassword: ["New passwords do not match."],
      },
    };
  }

  try {
    // Retrieve latest user password hash from DB
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!dbUser) {
      return { error: "User account not found." };
    }

    // Verify current password with bcrypt
    const isCurrentValid = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!isCurrentValid) {
      return {
        error: "Current password is incorrect.",
        fieldErrors: {
          currentPassword: ["Current password is incorrect."],
        },
      };
    }

    // Reject password reuse
    const isSamePassword = await verifyPassword(newPassword, dbUser.passwordHash);
    if (isSamePassword) {
      return {
        error: "New password cannot be the same as your current password.",
        fieldErrors: {
          newPassword: ["New password cannot be the same as your current password."],
        },
      };
    }

    // Hash new password with bcrypt cost factor 12
    const newPasswordHash = await hashPassword(newPassword);

    // Update user record, create audit entry, and revoke other sessions atomically
    await prisma.$transaction(async (tx) => {
      const updateResult = await tx.user.updateMany({
        where: {
          id: user.id,
          passwordHash: dbUser.passwordHash,
        },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false,
        },
      });

      if (updateResult.count === 0) {
        throw new Error("Your password was modified in another session. Please reload and try again.");
      }

      await createSystemAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.CHANGED_PASSWORD,
        tx,
      });

      await tx.session.updateMany({
        where: {
          userId: user.id,
          id: { not: session.id },
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    });
  } catch (error) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    console.error("Change password error:", error);
    return { error: "An unexpected error occurred while updating password. Please try again." };
  }

  const destination = user.role === Role.OSA ? "/osa" : "/dashboard";
  redirect(destination);
}
