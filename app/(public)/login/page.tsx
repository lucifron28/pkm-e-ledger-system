import { getSessionResult, getPostLoginDestination } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";
import { redirect } from "next/navigation";
import Link from "next/link";

interface LoginPageProps {
  searchParams: Promise<{ registered?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const sessionResult = await getSessionResult();
  if (sessionResult) {
    redirect(getPostLoginDestination(sessionResult.user));
  }

  const params = await searchParams;
  const showRegisteredMessage = params.registered === "1";

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <Link href="/" className="inline-flex items-center space-x-2">
          <span className="bg-[#f9d818] text-[#004aad] font-extrabold w-10 h-10 rounded-lg flex items-center justify-center text-lg shadow-inner">
            PKM
          </span>
          <span className="font-extrabold text-2xl text-[#004aad]">e-Ledger System</span>
        </Link>
        <h2 className="text-sm font-semibold text-slate-600">
          Pambayang Kolehiyo ng Mauban — Student Organization Portal
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl border border-slate-200 sm:rounded-xl sm:px-10">
          <LoginForm registeredMessage={showRegisteredMessage} />
        </div>

        <div className="mt-6 text-center text-xs text-slate-500">
          <p>Office of Student Affairs (OSA) • Financial Record-Keeping System</p>
        </div>
      </div>
    </div>
  );
}
