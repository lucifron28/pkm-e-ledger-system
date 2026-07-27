import { requireManagementUser } from "@/lib/auth/require-auth";
import {
  getActiveTermForCurrentUser,
  listTermsForCurrentUser,
  getSemesterLabel,
  type TermDto,
} from "@/lib/data/terms";
import { formatPesoFromCents, formatPesoInputFromCents } from "@/lib/data/money";
import { CreateTermForm } from "./create-term-form";
import { ActivateTermForm } from "./activate-term-form";
import { EditOpeningBalancesForm } from "./edit-opening-balances-form";
import Link from "next/link";

export default async function TermSettingsPage() {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Term Settings</h1>
          <p className="text-sm text-slate-600">
            Configure academic terms and opening balances.
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 text-center">
          <p className="font-semibold text-amber-800">
            You are not assigned to an active organization.
          </p>
        </div>
      </div>
    );
  }

  const [activeTerm, terms] = await Promise.all([
    getActiveTermForCurrentUser(),
    listTermsForCurrentUser(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Term Settings</h1>
          <p className="text-sm text-slate-600">
            Configure academic terms and opening balances for {user.organizationName}.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-[#004aad] font-semibold hover:underline"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {activeTerm && (
        <div className="bg-[#004aad] text-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-5 flex items-center justify-between">
            <div>
              <span className="bg-[#f9d818] text-[#004aad] text-xs font-extrabold px-2.5 py-0.5 rounded uppercase tracking-wider">
                Active Term
              </span>
              <h2 className="text-xl font-extrabold mt-2">
                {activeTerm.academicYear} — {getSemesterLabel(activeTerm.semester)}
              </h2>
            </div>
          </div>
          <div className="bg-blue-900/40 px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-blue-100 text-xs uppercase tracking-wider font-bold">
                Opening Cash on Hand
              </div>
              <div className="text-[#f9d818] font-extrabold text-lg">
                {formatPesoFromCents(activeTerm.openingCashOnHandCents)}
              </div>
            </div>
            <div>
              <div className="text-blue-100 text-xs uppercase tracking-wider font-bold">
                Opening Cash in Bank
              </div>
              <div className="text-[#f9d818] font-extrabold text-lg">
                {formatPesoFromCents(activeTerm.openingCashInBankCents)}
              </div>
            </div>
            <div>
              <div className="text-blue-100 text-xs uppercase tracking-wider font-bold">
                Balance Forwarded
              </div>
              <div className="text-[#f9d818] font-extrabold text-lg">
                {formatPesoFromCents(activeTerm.balanceForwardedCents)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <h2 className="font-bold text-slate-900 text-lg">Create Academic Term</h2>
        </div>
        <div className="p-6">
          <CreateTermForm hasActiveTerm={!!activeTerm} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <h2 className="font-bold text-slate-900 text-lg">
            All Academic Terms ({terms.length})
          </h2>
        </div>

        {terms.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No academic terms have been created yet. Use the form above to create your first term.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <tr>
                  <th className="px-6 py-3 text-left">Academic Year</th>
                  <th className="px-6 py-3 text-left">Semester</th>
                  <th className="px-6 py-3 text-right">C.O.H.</th>
                  <th className="px-6 py-3 text-right">C.I.B.</th>
                  <th className="px-6 py-3 text-right">Balance Forwarded</th>
                  <th className="px-6 py-3 text-center">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {terms.map((term) => (
                  <TermRow
                    key={term.id}
                    term={term}
                    isActive={activeTerm?.id === term.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TermRow({ term, isActive }: { term: TermDto; isActive: boolean }) {
  return (
    <tr className={isActive ? "bg-blue-50/40" : "hover:bg-slate-50"}>
      <td className="px-6 py-4 font-semibold text-slate-900">
        {term.academicYear}
      </td>
      <td className="px-6 py-4 text-slate-700">
        {getSemesterLabel(term.semester)}
      </td>
      <td className="px-6 py-4 text-right font-mono text-slate-800">
        {formatPesoFromCents(term.openingCashOnHandCents)}
      </td>
      <td className="px-6 py-4 text-right font-mono text-slate-800">
        {formatPesoFromCents(term.openingCashInBankCents)}
      </td>
      <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
        {formatPesoFromCents(term.balanceForwardedCents)}
      </td>
      <td className="px-6 py-4 text-center">
        {isActive ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
            Inactive
          </span>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          {!isActive && <ActivateTermForm termId={term.id} />}
          <EditOpeningBalancesForm
            termId={term.id}
            initialCashOnHand={formatPesoInputFromCents(
              term.openingCashOnHandCents
            )}
            initialCashInBank={formatPesoInputFromCents(
              term.openingCashInBankCents
            )}
          />
        </div>
      </td>
    </tr>
  );
}
