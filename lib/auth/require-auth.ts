import "server-only";
import { redirect } from "next/navigation";
import { getSession, SessionUser } from "./session";
import { Role } from "@prisma/client";
import {
  MANAGEMENT_ROLES,
  TRANSPARENCY_ROLES,
  MONITORING_ROLES,
} from "./rbac";

/**
 * Requires an authenticated user with an active session.
 * Redirects to /login if unauthenticated.
 * Redirects to /change-password if user must change password (unless skipPasswordCheck = true).
 */
export async function requireUser(skipPasswordCheck = false): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword && !skipPasswordCheck) {
    redirect("/change-password");
  }

  return user;
}

/**
 * Requires an authenticated user with a Management role (Treasurer, Adviser, Audit).
 */
export async function requireManagementUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!MANAGEMENT_ROLES.includes(user.role)) {
    redirect("/access-denied");
  }
  return user;
}

/**
 * Requires an authenticated user with a Transparency role (Officer, Member).
 */
export async function requireTransparencyUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!TRANSPARENCY_ROLES.includes(user.role)) {
    redirect("/access-denied");
  }
  return user;
}

/**
 * Requires an authenticated user with an OSA Monitoring role.
 */
export async function requireOsaUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!MONITORING_ROLES.includes(user.role)) {
    redirect("/access-denied");
  }
  return user;
}

/**
 * Ensures the authenticated user belongs to the specified organization, or is an OSA monitoring user.
 */
export async function requireOrganizationUser(organizationId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === Role.OSA) {
    return user;
  }

  if (user.organizationId !== organizationId) {
    redirect("/access-denied");
  }

  return user;
}

/**
 * Requires an authenticated user with one of the allowed roles.
 */
export async function requireRole(allowedRoles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!allowedRoles.includes(user.role)) {
    redirect("/access-denied");
  }
  return user;
}

/**
 * Requires an authenticated user satisfying the custom permission check.
 */
export async function requirePermission(
  permissionCheck: (role: Role) => boolean
): Promise<SessionUser> {
  const user = await requireUser();
  if (!permissionCheck(user.role)) {
    redirect("/access-denied");
  }
  return user;
}
