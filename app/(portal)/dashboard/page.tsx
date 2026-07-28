import { requireUser } from "@/lib/auth/require-auth";
import { isManagementRole } from "@/lib/auth/rbac";
import { getActiveTermForCurrentUser, getSemesterLabel } from "@/lib/data/terms";
import { getDashboardBalances } from "@/lib/data/transactions";
import { formatPesoFromCents } from "@/lib/data/money";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireUser();

  if (user.role === Role.OSA) {
    redirect("/osa");
  }

  const isManagement = isManagementRole(user.role);
  const activeTerm = await getActiveTermForCurrentUser();
  const balances = await getDashboardBalances();

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
            Role: <span className="font-semibold text-[#004aad]">{user.role}</span> &bull; Organization:{" "}
            <span className="font-semibold text-slate-800">{user.organizationName || "N/A"}</span>
          </p>
        </div>

        <div className="flex items-center space-x-3">
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

      {/* Active Academic Term Context */}
      {activeTerm ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-[#004aad] text-white px-6 py-4 flex items-center justify-between">
            <div>
              <span className="bg-[#f9d818] text-[#004aad] text-xs font-extrabold px-2.5 py-0.5 rounded uppercase tracking-wider">
                Active Academic Term
              </span>
              <h2 className="text-lg font-extrabold mt-1.5">
                {activeTerm.academicYear} &mdash; {getSemesterLabel(activeTerm.semester)}
              </h2>
            </div>
          </div>
          <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Opening Cash on Hand
              </div>
              <div className="text-xl font-extrabold text-slate-900 font-mono">
                {formatPesoFromCents(activeTerm.openingCashOnHandCents)}
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Opening Cash in Bank
              </div>
              <div className="text-xl font-extrabold text-slate-900 font-mono">
                {formatPesoFromCents(activeTerm.openingCashInBankCents)}
              </div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Balance Forwarded
              </div>
              <div className="text-xl font-extrabold text-[#004aad] font-mono">
                {formatPesoFromCents(activeTerm.balanceForwardedCents)}
              </div>
            </div>
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

      {activeTerm && balances && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
            <h2 className="font-bold text-slate-900">Financial Summary</h2>
          </div>
          <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Total Income</div>
              <div className="text-lg font-extrabold text-emerald-700 font-mono">{formatPesoFromCents(balances.totalIncomeCents)}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3 border border-red-100">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Total Expense</div>
              <div className="text-lg font-extrabold text-red-700 font-mono">{formatPesoFromCents(balances.totalExpenseCents)}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Remaining Balance</div>
              <div className="text-lg font-extrabold text-slate-900 font-mono">{formatPesoFromCents(balances.remainingCents)}</div>
            </div>
            {isManagement && (
              <div className="flex items-center justify-center">
                <Link href="/ledger" className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-4 py-2 rounded-lg text-xs shadow transition">
                  Open Digital Ledger
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
