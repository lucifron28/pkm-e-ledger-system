import "server-only";
import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "../db/prisma";
import { Role } from "@prisma/client";

export interface SessionUser {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  organizationId: string | null;
  organizationName: string | null;
  active: boolean;
  mustChangePassword: boolean;
}

export interface SessionResult {
  session: {
    id: string;
    expiresAt: Date;
  };
  user: SessionUser;
}

export const SESSION_COOKIE_NAME = "pkm_session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days
const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 Minutes

/**
 * Validates the current session token from the browser cookie.
 * Rejects missing, invalid, expired, revoked, inactive users, or inactive organizations.
 * Updates lastUsedAt only if stale (>15 minutes).
 */
export async function getSessionResult(): Promise<SessionResult | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) {
    return null;
  }

  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  try {
    const dbSession = await prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            role: true,
            organizationId: true,
            active: true,
            mustChangePassword: true,
            organization: {
              select: {
                id: true,
                name: true,
                active: true,
              },
            },
          },
        },
      },
    });

    if (!dbSession) {
      return null;
    }

    // Reject revoked or expired sessions
    if (dbSession.revokedAt || dbSession.expiresAt < new Date()) {
      return null;
    }

    // Reject inactive users
    if (!dbSession.user.active) {
      return null;
    }

    // Reject users assigned to an inactive organization
    if (dbSession.user.organizationId && dbSession.user.organization && !dbSession.user.organization.active) {
      return null;
    }

    // Update lastUsedAt ONLY when stale (>15 minutes)
    const now = new Date();
    if (
      !dbSession.lastUsedAt ||
      now.getTime() - dbSession.lastUsedAt.getTime() > STALE_THRESHOLD_MS
    ) {
      await prisma.session.update({
        where: { id: dbSession.id },
        data: { lastUsedAt: now },
      });
    }

    return {
      session: {
        id: dbSession.id,
        expiresAt: dbSession.expiresAt,
      },
      user: {
        id: dbSession.user.id,
        fullName: dbSession.user.fullName,
        username: dbSession.user.username,
        role: dbSession.user.role,
        organizationId: dbSession.user.organizationId,
        organizationName: dbSession.user.organization?.name || null,
        active: dbSession.user.active,
        mustChangePassword: dbSession.user.mustChangePassword,
      },
    };
  } catch (error) {
    console.error("Session lookup error:", error);
    return null;
  }
}

/**
 * Returns the current authenticated user DTO or null.
 */
export async function getSession(): Promise<SessionUser | null> {
  const result = await getSessionResult();
  return result ? result.user : null;
}

/**
 * Returns the correct post-login destination for an authenticated user.
 */
export function getPostLoginDestination(user: SessionUser): string {
  if (user.mustChangePassword) return "/change-password";
  if (user.role === Role.OSA) return "/osa";
  return "/dashboard";
}
