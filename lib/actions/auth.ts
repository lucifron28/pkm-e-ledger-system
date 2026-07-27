"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { verifyPassword } from "../auth/password";
import { getPostLoginDestination, SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "../auth/session";
import { createAuditLog } from "../data/audit-log";
import { AuditAction } from "@prisma/client";

// Pre-computed bcrypt cost-12 hash for timing-attack mitigation on nonexistent users
const DUMMY_HASH = "$2b$12$ALGYeXDyE.e2q5tUN1rc3O3rr2cAuW9PZ9PRsG9KQNA2gbnDFzgDa";

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Username is required."),
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

  const username = validation.data.username;
  const password = validation.data.password;

  let redirectDestination: string | null = null;
  let rawToken: string | null = null;

  try {
    const user = await prisma.user.findUnique({
      where: { username },
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

      redirectDestination = getPostLoginDestination({
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization?.name || null,
        active: user.active,
        mustChangePassword: user.mustChangePassword,
      });

      // Generate session token and hash
      rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

      // Create session record and audit entry in one atomic transaction
      await prisma.$transaction(async (tx) => {
        await tx.session.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
            lastUsedAt: new Date(),
          },
        });

        await createAuditLog({
          userId: user.id,
          organizationId: user.organizationId,
          role: user.role,
          action: AuditAction.LOGGED_IN,
          metadata: { redirectDestination },
          tx,
        });
      });

      // Set cookie after transaction succeeds
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });
    } else {
      await verifyPassword("dummy_password_long_enough", DUMMY_HASH);
      return { error: "Invalid username or password." };
    }
  } catch (error) {
    console.error("Login error:", error);
    return { error: "An unexpected error occurred. Please try again." };
  }

  if (rawToken && redirectDestination) {
    redirect(redirectDestination);
  }

  return null;
}
