"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "../db/prisma";
import { getSessionResult, SESSION_COOKIE_NAME } from "../auth/session";
import { createAuditLog } from "../data/audit-log";
import { AuditAction } from "@prisma/client";

export async function logoutAction(): Promise<never> {
  const cookieStore = await cookies();
  const sessionResult = await getSessionResult();

  if (sessionResult) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.session.update({
          where: { id: sessionResult.session.id },
          data: { revokedAt: new Date() },
        });

        await createAuditLog({
          userId: sessionResult.user.id,
          organizationId: sessionResult.user.organizationId,
          role: sessionResult.user.role,
          action: AuditAction.LOGGED_OUT,
          entityType: "Session",
          entityId: sessionResult.session.id,
          tx,
        });
      });
    } catch (error) {
      console.error("Failed to revoke session during logout:", error);
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
