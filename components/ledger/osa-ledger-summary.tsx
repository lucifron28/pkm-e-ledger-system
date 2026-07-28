"use client";

import { useRouter } from "next/navigation";
import type { OsaLedgerSummaryDto } from "@/lib/data/osa";
import type { Semester } from "@prisma/client";
import { formatPesoFromCents } from "@/lib/data/money";
import Link from "next/link";

interface OrgOption {
  id: string;
  name: string;
  slug: string;
}

interface TermOption {
  id: string;
  academicYear: string;
  semester: Semester;
  active: boolean;
}

interface OsaOrganizationSelectViewProps {
  organizations: OrgOption[];
  state: "missing" | "invalid";
}

export function OsaOrganizationSelectView({
  organizations,
  state,
}: OsaOrganizationSelectViewProps) {
  const router = useRouter();

  function handleOrgChange(slug: string) {
    if (slug) {
      router.push(`/ledger?org=${encodeURIComponent(slug)}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="bg-[#004aad] text-white text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
            Summarized Ledger Oversight
          </span>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
            {state === "invalid" ? "Invalid or Inactive Organization" : "Select an Organization"}
          </h1>
          <p className="text-sm text-slate-600 font-medium mt-1">
            {state === "invalid"
              ? "The specified organization parameter is invalid or inactive. Select an active organization below."
              : "Please select an active student organization to inspect its financial ledger summary."}
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-4 max-w-xl">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
          Active Student Organizations ({organizations.length}):
        </label>
        <select
          value=""
          onChange={(e) => handleOrgChange(e.target.value)}
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        >
          <option value="">-- Select Organization --</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.slug}>
              {o.name} ({o.slug})
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">
          Selecting an organization will update the URL parameter and load its summarized financial data.
        </p>
      </div>
    </div>
  );
}

interface OsaLedgerSummaryViewProps {
  summary: OsaLedgerSummaryDto | null;
  organizations: OrgOption[];
  terms: TermOption[];
  currentOrgSlug: string;
  currentTermId: string | null;
}

export function OsaLedgerSummaryView({
  summary,
  organizations,
  terms,
  currentOrgSlug,
  currentTermId,
}: OsaLedgerSummaryViewProps) {
  const router = useRouter();

  function handleOrgChange(slug: string) {
    if (slug) {
      router.push(`/ledger?org=${encodeURIComponent(slug)}`);
    } else {
      router.push("/ledger");
    }
  }

  function handleTermChange(termId: string) {
    const selected = terms.find((t) => t.id === termId);
    if (selected) {
      router.push(
        `/ledger?org=${encodeURIComponent(currentOrgSlug)}&academicYear=${encodeURIComponent(selected.academicYear)}&semester=${encodeURIComponent(selected.semester)}`
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
          {/* Org Selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 whitespace-nowrap">
              Organization:
            </label>
            <select
              value={currentOrgSlug}
              onChange={(e) => handleOrgChange(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#004aad]"
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.slug}>
                  {o.name} ({o.slug})
                </option>
              ))}
            </select>
          </div>

          {/* Term Selector */}
          {terms.length > 0 && currentTermId && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 whitespace-nowrap">
                Term:
              </label>
              <select
                value={currentTermId}
                onChange={(e) => handleTermChange(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#004aad]"
              >
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.academicYear} &mdash; {t.semester === "FIRST_SEMESTER" ? "1st Sem" : t.semester === "SECOND_SEMESTER" ? "2nd Sem" : "Summer"} {t.active ? "(Active)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {summary && (
          <Link
            href={`/reports?org=${encodeURIComponent(summary.organizationSlug)}&academicYear=${encodeURIComponent(summary.academicYear)}&semester=${encodeURIComponent(summary.semester)}`}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-lg text-xs shadow transition whitespace-nowrap"
          >
            View Full Report Package
          </Link>
        )}
      </div>

      {!summary ? (
        <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-8 rounded-xl text-center space-y-3">
          <h2 className="text-lg font-bold text-amber-900">No Ledger Data Available</h2>
          <p className="text-sm text-amber-700">No active or historical term summary found for this organization.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Organization & Term Header */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="bg-[#004aad] text-white text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                Summarized Ledger Oversight
              </span>
              <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
                {summary.organizationName}
              </h1>
              <p className="text-sm text-slate-600 font-medium">
                {summary.academicYear} &bull; {summary.semesterLabel} {summary.active ? "(Active Term)" : ""}
              </p>
            </div>

            <div className="text-xs text-slate-500 text-left sm:text-right font-semibold">
              <div>Last Financial Activity:</div>
              <div className="text-slate-900 font-bold">
                {summary.lastActivityDate
                  ? summary.lastActivityDate.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
                  : "No activity"}
              </div>
            </div>
          </div>

          {/* Summarized Balances Grid */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="font-extrabold text-slate-900 text-base">Account Balances Summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border">
                <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">Cash on Hand</div>
                <div className="font-mono font-bold text-slate-900 text-base">{formatPesoFromCents(summary.endingCashOnHandCents)}</div>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border">
                <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">Cash in Bank</div>
                <div className="font-mono font-bold text-slate-900 text-base">{formatPesoFromCents(summary.endingCashInBankCents)}</div>
              </div>
              <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">Total Income</div>
                <div className="font-mono font-bold text-emerald-700 text-base">{formatPesoFromCents(summary.totalIncomeCents)}</div>
              </div>
              <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">Total Expense</div>
                <div className="font-mono font-bold text-red-700 text-base">{formatPesoFromCents(summary.totalExpenseCents)}</div>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">Remaining</div>
                <div className="font-mono font-bold text-[#004aad] text-base">{formatPesoFromCents(summary.remainingCents)}</div>
              </div>
            </div>
          </div>

          {/* Grouped Category Subtotals Tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Income Categories */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-100 flex items-center justify-between">
                <h3 className="font-extrabold text-emerald-900 text-sm uppercase tracking-wider">
                  Income Collections Subtotals
                </h3>
                <span className="font-mono font-bold text-emerald-800 text-xs">
                  {formatPesoFromCents(summary.totalIncomeCents)}
                </span>
              </div>
              {summary.incomeCategoryTotals.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs italic">
                  No income collections recorded for this term.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Category Name</th>
                      <th className="px-4 py-2.5 text-right">Subtotal Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.incomeCategoryTotals.map((cat) => (
                      <tr key={cat.categoryId} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{cat.categoryName}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">
                          {formatPesoFromCents(cat.totalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Expense Categories */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center justify-between">
                <h3 className="font-extrabold text-red-900 text-sm uppercase tracking-wider">
                  Operating Expenses Subtotals
                </h3>
                <span className="font-mono font-bold text-red-800 text-xs">
                  {formatPesoFromCents(summary.totalExpenseCents)}
                </span>
              </div>
              {summary.expenseCategoryTotals.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs italic">
                  No operating expenses recorded for this term.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Category Name</th>
                      <th className="px-4 py-2.5 text-right">Subtotal Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.expenseCategoryTotals.map((cat) => (
                      <tr key={cat.categoryId} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{cat.categoryName}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-red-700">
                          {formatPesoFromCents(cat.totalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
