import { requireUser } from "@/lib/auth/require-auth";
import { isManagementRole } from "@/lib/auth/rbac";
import { getSemesterLabel, listTermsForCurrentUser } from "@/lib/data/terms";
import { getDashboardBalancesForUser } from "@/lib/data/transactions";
import { formatPesoFromCents } from "@/lib/data/money";
import { Role, Semester } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DashboardTermSelector } from "@/components/dashboard/dashboard-term-selector";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  if (user.role === Role.OSA) {
    redirect("/osa");
  }

  const params = await searchParams;

  let ayRaw: string | undefined = undefined;
  if (typeof params.academicYear === "string" && params.academicYear.trim().length > 0) {
    ayRaw = params.academicYear.trim();
  }

  let semRaw: Semester | undefined = undefined;
  if (
    typeof params.semester === "string" &&
    Object.values(Semester).includes(params.semester.trim() as Semester)
  ) {
    semRaw = params.semester.trim() as Semester;
  }

  const isManagement = isManagementRole(user.role);
  const terms = await listTermsForCurrentUser();
  const dashboardData = await getDashboardBalancesForUser(ayRaw, semRaw);

  const activeTerm = dashboardData?.term;
  const balances = dashboardData?.balances;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-block bg-blue-100 text-[#004aad] text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded mb-2">
            Authenticated Portal
          </span>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Welcome back, {user.fullName}!
          </h1>
          <p className="text-sm text-slate-600">
            Role: <span className="font-semibold text-[#004aad]">{user.role}</span> &bull; Organization:{" "}
            <span className="font-semibold text-slate-800">{user.organizationName || "N/A"}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {terms.length > 0 && activeTerm && (
            <DashboardTermSelector terms={terms} currentTermId={activeTerm.id} />
          )}

          {isManagement && (
            <Link
              href="/settings/term"
              className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-4 py-2 rounded-lg text-xs shadow transition"
            >
              Term Settings
            </Link>
          )}

          <Link
            href="/account"
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs border border-slate-300 transition"
          >
            Manage Account
          </Link>
        </div>
      </div>

      {/* Active / Historical Academic Term Banner */}
      {activeTerm ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-[#004aad] text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="bg-[#f9d818] text-[#004aad] text-xs font-extrabold px-2.5 py-0.5 rounded uppercase tracking-wider">
                {activeTerm.active ? "Active Academic Term" : "Historical Academic Term"}
              </span>
              <h2 className="text-lg font-extrabold mt-1.5">
                {activeTerm.academicYear} &mdash; {getSemesterLabel(activeTerm.semester)}
              </h2>
            </div>

            <Link
              href={`/reports?academicYear=${encodeURIComponent(activeTerm.academicYear)}&semester=${encodeURIComponent(activeTerm.semester)}`}
              className="bg-white text-[#004aad] hover:bg-blue-50 font-bold px-4 py-2 rounded-lg text-xs shadow transition text-center"
            >
              View Report Package
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-8 rounded-xl text-center space-y-3">
          {isManagement ? (
            <>
              <h2 className="text-lg font-bold text-amber-900">
                No Active Academic Term Configured
              </h2>
              <p className="text-sm text-amber-700 max-w-xl mx-auto">
                You need to create and set an active academic term before recording financial transactions.
              </p>
              <Link
                href="/settings/term"
                className="inline-block bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow transition text-sm"
              >
                Set Up Academic Term
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-amber-900">
                No Active Academic Term
              </h2>
              <p className="text-sm text-amber-700 max-w-xl mx-auto">
                No active academic term has been configured for your organization. Please contact your Treasurer or Adviser.
              </p>
            </>
          )}
        </div>
      )}

      {/* Six Financial Summary Cards */}
      {activeTerm && balances && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-slate-900 text-lg">Organization Financial Summary</h2>
            <span className="text-xs text-slate-500 font-semibold">
              {activeTerm.academicYear} &bull; {getSemesterLabel(activeTerm.semester)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Card 1: Cash on Hand */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
                <span>1. Cash on Hand</span>
                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">Asset</span>
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {formatPesoFromCents(balances.cashOnHandCents)}
              </div>
              <p className="text-xs text-slate-500">Physical cash stored on hand</p>
            </div>

            {/* Card 2: Cash in Bank */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
                <span>2. Cash in Bank</span>
                <span className="bg-blue-50 text-[#004aad] px-2 py-0.5 rounded font-bold">Bank Account</span>
              </div>
              <div className="text-2xl font-black text-[#004aad] font-mono">
                {formatPesoFromCents(balances.cashInBankCents)}
              </div>
              <p className="text-xs text-slate-500">Verified bank depository funds</p>
            </div>

            {/* Card 3: Total Income */}
            <div className="bg-white rounded-xl p-5 border border-emerald-200 shadow-sm flex flex-col justify-between space-y-2 bg-emerald-50/30">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-800">
                <span>3. Total Income</span>
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">Collections</span>
              </div>
              <div className="text-2xl font-black text-emerald-700 font-mono">
                {formatPesoFromCents(balances.totalIncomeCents)}
              </div>
              <p className="text-xs text-slate-500">Total verified collections for term</p>
            </div>

            {/* Card 4: Total Expenses */}
            <div className="bg-white rounded-xl p-5 border border-red-200 shadow-sm flex flex-col justify-between space-y-2 bg-red-50/30">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-red-800">
                <span>4. Total Expenses</span>
                <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded font-bold">Disbursements</span>
              </div>
              <div className="text-2xl font-black text-red-700 font-mono">
                {formatPesoFromCents(balances.totalExpenseCents)}
              </div>
              <p className="text-xs text-slate-500">Operating expenditures for term</p>
            </div>

            {/* Card 5: Net Remaining Balance */}
            <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-900 shadow-md flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                <span>5. Net Remaining Balance</span>
                <span className="bg-[#f9d818] text-[#004aad] px-2 py-0.5 rounded font-extrabold">Net Fund</span>
              </div>
              <div className="text-2xl font-black text-[#f9d818] font-mono">
                {formatPesoFromCents(balances.remainingCents)}
              </div>
              <p className="text-xs text-slate-400">Opening + Income - Expenses</p>
            </div>

            {/* Card 6: Balance Forwarded */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
                <span>6. Balance Forwarded</span>
                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">Opening Fund</span>
              </div>
              <div className="text-2xl font-black text-slate-800 font-mono">
                {formatPesoFromCents(activeTerm.balanceForwardedCents)}
              </div>
              <p className="text-xs text-slate-500">Carried forward from previous term</p>
            </div>
          </div>

          {isManagement && (
            <div className="pt-2 flex justify-end">
              <Link
                href="/ledger"
                className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow transition text-sm flex items-center gap-2"
              >
                <span>Manage Digital Ledger</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
