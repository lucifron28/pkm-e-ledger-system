"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { verifyPassword } from "../auth/password";
import { createSession } from "../auth/session";
import { createAuditLog } from "../data/audit-log";
import { AuditAction, Role } from "@prisma/client";

// Pre-computed bcrypt hash to mitigate timing attacks on nonexistent users
const DUMMY_HASH = "$2a$12$eYd4g7k9m2c3b5s6t8v9ux.y.z.A.B.C.D.E.F.G.H.I.J.K.L.M.N";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
});

export type LoginState = {
  error?: string;
  fieldErrors?: {
    username?: string[];
    password?: string[];
  };
  success?: boolean;
} | null;

export async function loginAction(
  prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const rawUsername = formData.get("username")?.toString() || "";
  const rawPassword = formData.get("password")?.toString() || "";

  const validation = loginSchema.safeParse({
    username: rawUsername,
    password: rawPassword,
  });

  if (!validation.success) {
    return {
      error: "Please fill in all required fields.",
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  const normalizedUsername = validation.data.username.trim().toLowerCase();
  const password = validation.data.password;

  let redirectDestination: string | null = null;
  let authenticatedUserId: string | null = null;

  try {
    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            active: true,
          },
        },
      },
    });

    if (user) {
      if (!user.active) {
        return { error: "This account is inactive." };
      }

      if (user.organizationId && user.organization && !user.organization.active) {
        return { error: "This account's organization is inactive." };
      }

      const isValidPassword = await verifyPassword(password, user.passwordHash);

      if (!isValidPassword) {
        return { error: "Invalid username or password." };
      }

      authenticatedUserId = user.id;

      // Determine role redirect
      if (user.mustChangePassword) {
        redirectDestination = "/change-password";
      } else if (user.role === Role.OSA) {
        redirectDestination = "/osa";
      } else {
        redirectDestination = "/dashboard";
      }

      // Record audit log
      await createAuditLog({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        action: AuditAction.LOGGED_IN,
        metadata: { redirectDestination },
      });
    } else {
      // Prevent timing attacks
      await verifyPassword("dummy_password", DUMMY_HASH);
      return { error: "Invalid username or password." };
    }
  } catch (error) {
    console.error("Login error:", error);
    return { error: "An unexpected error occurred. Please try again." };
  }

  if (authenticatedUserId && redirectDestination) {
    await createSession(authenticatedUserId);
    redirect(redirectDestination);
  }

  return null;
}
