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
    tokenHash: string;
    expiresAt: Date;
  };
  user: SessionUser;
}

const SESSION_COOKIE_NAME = "pkm_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days
const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 Minutes

/**
 * Creates a database-backed session with a cryptographically secure 32-byte token.
 * Sets the raw token in an HttpOnly, SameSite=Lax cookie and stores only the SHA-256 hash in DB.
 */
export async function createSession(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      lastUsedAt: new Date(),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return rawToken;
}

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
        tokenHash: dbSession.tokenHash,
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
 * Revokes the current session in the database and clears the browser cookie.
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (rawToken) {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    try {
      await prisma.session.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch (error) {
      console.error("Error revoking session:", error);
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Revokes all active sessions for a user EXCEPT the specified current token hash.
 */
export async function revokeAllUserSessionsExceptCurrent(
  userId: string,
  currentTokenHash: string
): Promise<void> {
  await prisma.session.updateMany({
    where: {
      userId,
      tokenHash: { not: currentTokenHash },
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}
