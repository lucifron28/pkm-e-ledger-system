import { requireOsaUser } from "@/lib/auth/require-auth";
import { listOsaOrganizationsOverview } from "@/lib/data/osa";
import { formatPesoFromCents } from "@/lib/data/money";
import Link from "next/link";

export default async function OsaOverviewPage() {
  const user = await requireOsaUser();
  const overviewList = await listOsaOrganizationsOverview();

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-block bg-yellow-100 text-yellow-900 text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded mb-2">
            OSA Multi-Organization Oversight
          </span>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Office of Student Affairs Monitoring Overview
          </h1>
          <p className="text-sm text-slate-600">
            Authenticated User: <span className="font-bold text-[#004aad]">{user.fullName}</span> ({user.username})
          </p>
        </div>

        <Link
          href="/account"
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs border border-slate-300 transition text-center"
        >
          Manage Account
        </Link>
      </div>

      {/* Organizations Overview Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold text-slate-900 text-lg">
            Active Recognized Student Organizations ({overviewList.length})
          </h2>
          <span className="text-xs text-slate-500 font-semibold">
            Real-time financial status monitoring
          </span>
        </div>

        {overviewList.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
            No active student organizations found in the system.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {overviewList.map((org) => (
              <div
                key={org.organizationId}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Org Card Header */}
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="bg-[#004aad] text-white text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                      {org.organizationSlug}
                    </span>
                    <h3 className="text-xl font-extrabold text-slate-900 mt-1">
                      {org.organizationName}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/ledger?org=${encodeURIComponent(org.organizationSlug)}`}
                      className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs shadow transition"
                    >
                      Summarized Ledger
                    </Link>
                    <Link
                      href={`/reports?org=${encodeURIComponent(org.organizationSlug)}`}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs shadow transition"
                    >
                      View Reports
                    </Link>
                  </div>
                </div>

                {/* Org Card Body */}
                <div className="p-6">
                  {org.hasActiveTerm ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs text-slate-600 font-semibold border-b pb-3">
                        <div>
                          Active Term:{" "}
                          <span className="font-bold text-slate-900">
                            {org.academicYear} &bull; {org.semesterLabel}
                          </span>
                        </div>
                        <div>
                          Last Financial Activity:{" "}
                          <span className="font-bold text-slate-800">
                            {org.lastActivityDate
                              ? org.lastActivityDate.toLocaleDateString("en-PH", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })
                              : "No transactions recorded yet"}
                          </span>
                        </div>
                      </div>

                      {/* 6 Financial Metric Pills */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                          <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">
                            Balance Forwarded
                          </div>
                          <div className="font-mono font-bold text-slate-800 text-sm">
                            {formatPesoFromCents(org.balanceForwardedCents)}
                          </div>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                          <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">
                            Cash on Hand
                          </div>
                          <div className="font-mono font-bold text-slate-800 text-sm">
                            {formatPesoFromCents(org.endingCashOnHandCents)}
                          </div>
                        </div>

                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                          <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">
                            Cash in Bank
                          </div>
                          <div className="font-mono font-bold text-[#004aad] text-sm">
                            {formatPesoFromCents(org.endingCashInBankCents)}
                          </div>
                        </div>

                        <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                          <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">
                            Total Income
                          </div>
                          <div className="font-mono font-bold text-emerald-700 text-sm">
                            {formatPesoFromCents(org.totalIncomeCents)}
                          </div>
                        </div>

                        <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                          <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">
                            Total Expense
                          </div>
                          <div className="font-mono font-bold text-red-700 text-sm">
                            {formatPesoFromCents(org.totalExpenseCents)}
                          </div>
                        </div>

                        <div className="bg-slate-900 text-white p-3 rounded-lg">
                          <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-1">
                            Remaining Balance
                          </div>
                          <div className="font-mono font-bold text-[#f9d818] text-sm">
                            {formatPesoFromCents(org.remainingCents)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center text-xs font-semibold text-amber-800">
                      No active academic term has been set for {org.organizationName}.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
