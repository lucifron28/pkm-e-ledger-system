"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { hashPassword } from "../auth/password";
import { createAuditLog } from "../data/audit-log";
import { AuditAction, Role } from "@prisma/client";

const PUBLIC_ALLOWED_ROLES: Role[] = [Role.OFFICER, Role.MEMBER];

const registerSchema = z.object({
  fullName: z.string().min(2, "Full Name must be at least 2 characters."),
  username: z.string().min(3, "Username must be at least 3 characters."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  confirmPassword: z.string().min(8, "Confirm Password is required."),
  organizationId: z.string().min(1, "Please select an organization."),
  requestedRole: z.nativeEnum(Role, { message: "Invalid role selected." }),
});

export type RegisterState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

export async function registerAction(
  prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const rawData = {
    fullName: formData.get("fullName")?.toString() || "",
    username: formData.get("username")?.toString() || "",
    password: formData.get("password")?.toString() || "",
    confirmPassword: formData.get("confirmPassword")?.toString() || "",
    organizationId: formData.get("organizationId")?.toString() || "",
    requestedRole: formData.get("requestedRole")?.toString() || "",
  };

  const validation = registerSchema.safeParse(rawData);

  if (!validation.success) {
    return {
      error: "Please fix the validation errors below.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const { fullName, username, password, confirmPassword, organizationId, requestedRole } =
    validation.data;

  // Server-side role whitelist security check
  if (!PUBLIC_ALLOWED_ROLES.includes(requestedRole)) {
    return {
      error: "Public registration is only allowed for Officer and Member roles.",
    };
  }

  // Password confirmation check
  if (password !== confirmPassword) {
    return {
      error: "Passwords do not match.",
      fieldErrors: {
        confirmPassword: ["Passwords do not match."],
      },
    };
  }

  const normalizedUsername = username.trim().toLowerCase();

  try {
    // Check username uniqueness
    const existingUser = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (existingUser) {
      return {
        error: "Username is already in use.",
        fieldErrors: {
          username: ["Username is already in use."],
        },
      };
    }

    // Verify target organization exists and is active
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization || !organization.active) {
      return {
        error: "Selected organization is not active or does not exist.",
      };
    }

    // Hash password with bcrypt cost factor 12
    const passwordHash = await hashPassword(password);

    // Create user record inside database transaction
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: fullName.trim(),
          username: normalizedUsername,
          passwordHash,
          role: requestedRole,
          organizationId: organization.id,
          active: true,
          mustChangePassword: false,
        },
      });

      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.REGISTERED_USER,
        metadata: { requestedRole },
        tx,
      });

      return user;
    });

    if (!newUser) {
      return { error: "Failed to register user account." };
    }
  } catch (error) {
    console.error("Registration error:", error);
    return { error: "An unexpected error occurred during registration. Please try again." };
  }

  redirect("/login?registered=1");
}
