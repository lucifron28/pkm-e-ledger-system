import { requireUser } from "@/lib/auth/require-auth";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireUser();

  if (user.role === Role.OSA) {
    redirect("/osa");
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-block bg-blue-100 text-[#004aad] text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded mb-2">
            Authenticated Portal
          </span>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Welcome back, {user.fullName}!
          </h1>
          <p className="text-sm text-slate-600">
            Role: <span className="font-semibold text-[#004aad]">{user.role}</span> • Organization:{" "}
            <span className="font-semibold text-slate-800">{user.organizationName || "N/A"}</span>
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/account"
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs border border-slate-300 transition"
          >
            Manage Account
          </Link>
        </div>
      </div>

      {/* Phase 2 Placeholder Banner */}
      <div className="bg-blue-50 border-2 border-dashed border-[#004aad]/30 p-8 rounded-xl text-center space-y-3">
        <div className="w-12 h-12 bg-[#004aad] text-[#f9d818] font-bold rounded-full flex items-center justify-center mx-auto text-xl shadow">
          ✓
        </div>
        <h2 className="text-lg font-bold text-[#004aad]">
          Authentication & Access Control Foundation Active
        </h2>
        <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
          Your database session, user authorization, and organization context have been validated. Financial summary cards, opening balance management, and transaction ledger entry modules will be connected in Phase 3 & Phase 4.
        </p>
      </div>
    </div>
  );
}
