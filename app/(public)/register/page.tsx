import { getSessionResult, getPostLoginDestination } from "@/lib/auth/session";
import { RegisterForm } from "@/components/register-form";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { PublicShell } from "@/components/ui/public-shell";

export default async function RegisterPage() {
  const sessionResult = await getSessionResult();
  if (sessionResult) redirect(getPostLoginDestination(sessionResult.user));

  const organizations = await prisma.organization.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <PublicShell
      title="Create a view-only account"
      subtitle="Officer and Member accounts can review organization summaries and official reports."
      width="lg"
    >
      <RegisterForm organizations={organizations} />
    </PublicShell>
  );
}
