"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, AuditAction } from "@prisma/client";
import { prisma } from "../db/prisma";
import { verifyPassword } from "../auth/password";
import { getSessionResult } from "../auth/session";
import { createAuditLog } from "../data/audit-log";
import { profileUpdateSchema } from "../domain/profile";

export type ProfileUpdateState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
} | null;

export async function updateProfileAction(
  prevState: ProfileUpdateState,
  formData: FormData
): Promise<ProfileUpdateState> {
  void prevState;

  const sessionResult = await getSessionResult();
  if (!sessionResult) {
    redirect("/login");
  }

  const rawData = {
    fullName: formData.get("fullName")?.toString() || "",
    username: formData.get("username")?.toString() || "",
    currentPassword: formData.get("currentPassword")?.toString() || "",
  };
  const validation = profileUpdateSchema.safeParse(rawData);

  if (!validation.success) {
    return {
      error: "Please fix the validation errors below.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { fullName, username, currentPassword } = validation.data;
  const currentUser = await prisma.user.findUnique({
    where: { id: sessionResult.user.id },
    select: {
      id: true,
      fullName: true,
      username: true,
      passwordHash: true,
      role: true,
      organizationId: true,
    },
  });

  if (!currentUser) {
    return { error: "Account not found. Please sign in again." };
  }

  const passwordMatches = await verifyPassword(currentPassword, currentUser.passwordHash);
  if (!passwordMatches) {
    return {
      error: "Current password is incorrect.",
      fieldErrors: { currentPassword: ["Current password is incorrect."] },
    };
  }

  if (fullName === currentUser.fullName && username === currentUser.username) {
    return { success: "No profile changes were made." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: currentUser.id },
        data: { fullName, username },
      });

      await createAuditLog({
        tx,
        throwOnError: true,
        userId: currentUser.id,
        organizationId: currentUser.organizationId,
        role: currentUser.role,
        action: AuditAction.UPDATED_PROFILE,
        entityType: "User",
        entityId: currentUser.id,
        metadata: {
          previousFullName: currentUser.fullName,
          newFullName: fullName,
          previousUsername: currentUser.username,
          newUsername: username,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        error: "Username is already in use.",
        fieldErrors: { username: ["Username is already in use."] },
      };
    }

    console.error("Profile update error:", error);
    return { error: "Failed to update profile. Please try again." };
  }

  revalidatePath("/account");
  return { success: "Profile updated." };
}
