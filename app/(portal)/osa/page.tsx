import { requireOsaUser } from "@/lib/auth/require-auth";
import Link from "next/link";

export default async function OsaOverviewPage() {
  const user = await requireOsaUser();

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-block bg-yellow-100 text-amber-800 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded mb-2">
            OSA Monitoring Portal
          </span>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Office of Student Affairs — Multi-Organization Oversight
          </h1>
          <p className="text-sm text-slate-600">
            Account: <span className="font-semibold text-slate-800">{user.fullName} ({user.username})</span> • Access: Read-Only Cross-Organization Monitoring
          </p>
        </div>

        <Link
          href="/account"
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs border border-slate-300 transition"
        >
          Account Settings
        </Link>
      </div>

      {/* Phase 2 Placeholder Banner */}
      <div className="bg-amber-50 border-2 border-dashed border-amber-400 p-8 rounded-xl text-center space-y-3">
        <div className="w-12 h-12 bg-amber-500 text-white font-bold rounded-full flex items-center justify-center mx-auto text-xl shadow">
          OSA
        </div>
        <h2 className="text-lg font-bold text-amber-900">
          OSA Monitoring Access Foundation Active
        </h2>
        <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
          Your read-only monitoring credentials have been verified. The multi-organization switcher grid and cross-organization financial report review dashboards will be connected in Phase 6.
        </p>
      </div>
    </div>
  );
}
