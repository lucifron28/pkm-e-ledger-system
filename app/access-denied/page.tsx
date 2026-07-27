import Link from "next/link";
import { getSession } from "@/lib/auth/session";

export default async function AccessDeniedPage() {
  const user = await getSession();

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 text-red-600 font-extrabold rounded-full flex items-center justify-center mx-auto text-2xl shadow">
          ✕
        </div>

        <h1 className="text-2xl font-extrabold text-slate-900">Access Denied</h1>

        <p className="text-sm text-slate-600">
          You do not have permission to access the requested page or action.
        </p>

        <div className="pt-2">
          <Link
            href={user ? (user.role === "OSA" ? "/osa" : "/dashboard") : "/login"}
            className="inline-block bg-[#004aad] hover:bg-blue-800 text-white font-bold px-6 py-2.5 rounded-lg shadow text-sm transition"
          >
            Return to Authorized Home
          </Link>
        </div>
      </div>
    </div>
  );
}
