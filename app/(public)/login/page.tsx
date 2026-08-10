import { getSessionResult, getPostLoginDestination } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/ui/public-shell";

interface LoginPageProps {
  searchParams: Promise<{ registered?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const sessionResult = await getSessionResult();
  if (sessionResult) redirect(getPostLoginDestination(sessionResult.user));

  const params = await searchParams;
  const showRegisteredMessage = params.registered === "1";

  return (
    <PublicShell
      title="Sign in to your financial portal"
      subtitle="Review balances, record activity, and prepare official reports for your organization."
    >
      <LoginForm registeredMessage={showRegisteredMessage} />
    </PublicShell>
  );
}
