import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isSeededDemoUsername } from "@/lib/domain/demo-accounts";
import type { DemoAccountExportRow } from "@/lib/domain/demo-accounts";

export async function listSeededDemoAccounts(): Promise<DemoAccountExportRow[]> {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: "demo_" } },
    select: {
      fullName: true,
      username: true,
      role: true,
      active: true,
      organization: { select: { name: true } },
    },
    orderBy: { username: "asc" },
  });

  return users
    .filter((user) => isSeededDemoUsername(user.username))
    .map((user) => ({
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      organizationName: user.organization?.name ?? null,
      active: user.active,
    }));
}
