"use server";

import { redirect } from "next/navigation";
import { deleteSession, getSessionResult } from "../auth/session";
import { createAuditLog } from "../data/audit-log";
import { AuditAction } from "@prisma/client";

export async function logoutAction(): Promise<never> {
  const sessionResult = await getSessionResult();

  if (sessionResult) {
    const { user } = sessionResult;
    await createAuditLog({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      action: AuditAction.LOGGED_OUT,
    });
  }

  await deleteSession();
  redirect("/login");
}
