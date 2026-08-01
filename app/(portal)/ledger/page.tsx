import { requireUser } from "@/lib/auth/require-auth";
import { getSemesterLabel } from "@/lib/data/terms";
import {
  getLedgerPageSnapshot,
} from "@/lib/data/transactions";
import {
  getOsaLedgerSummary,
  listOsaOrganizationsOverview,
  listTermsForOsaOrganization,
  validateOsaOrganization,
} from "@/lib/data/osa";
import { formatPesoFromCents } from "@/lib/data/money";
import { Role, TransactionType } from "@prisma/client";
import { redirect } from "next/navigation";
import { CreateTransactionForm } from "./create-transaction-form";
import { EditTransactionForm } from "./edit-transaction-form";
import { DeleteTransactionForm } from "./delete-transaction-form";
import { LedgerFilters } from "./ledger-filters";
import {
  OsaLedgerSummaryView,
  OsaOrganizationSelectView,
} from "@/components/ledger/osa-ledger-summary";
import { parseLedgerQueryParams } from "@/lib/domain/query";
import Link from "next/link";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  // Officers and Members MUST NOT access detailed ledger
  if (user.role === Role.OFFICER || user.role === Role.MEMBER) {
    redirect("/dashboard");
  }

  const rawParams = await searchParams;
  const parsedQuery = parseLedgerQueryParams(rawParams);

  // OSA Monitoring Flow
  if (user.role === Role.OSA) {
    const summaries = await listOsaOrganizationsOverview();
    const selectedOrgSlugOrId = typeof rawParams.org === "string" ? rawParams.org.trim() : undefined;

    if (!selectedOrgSlugOrId) {
      return <OsaOrganizationSelectView organizations={summaries} />;
    }

    const validOrg = await validateOsaOrganization(selectedOrgSlugOrId);
    if (!validOrg) {
      return <OsaOrganizationSelectView organizations={summaries} state="invalid" />;
    }

    const availableTerms = await listTermsForOsaOrganization(validOrg.id);
    const summary = await getOsaLedgerSummary(validOrg.id, parsedQuery.academicYear, parsedQuery.semester);
    const currentTermId = summary ? summary.termId : null;

    return (
      <OsaLedgerSummaryView
        summary={summary}
        organizations={summaries}
        terms={availableTerms}
        currentOrgSlug={validOrg.slug}
        currentTermId={currentTermId}
      />
    );
  }

  // Management Roles Detailed Ledger Flow
  const snapshot = await getLedgerPageSnapshot(user, rawParams);

  if (!snapshot.selectedTerm || !snapshot.balances) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-extrabold text-slate-900">Digital Ledger</h1>
        </div>
        <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-8 rounded-xl text-center space-y-3">
          <p className="text-amber-900 font-medium">No active academic term configured for {user.organizationName}.</p>
          <Link href="/settings/term" className="inline-block bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow transition text-sm">
            Set Up Academic Term
          </Link>
        </div>
      </div>
    );
  }

  const activeTerm = snapshot.selectedTerm;
  const balances = snapshot.balances;
  const transactions = snapshot.transactions;
  const incomeCategories = snapshot.categories.filter((c) => c.type === TransactionType.INCOME);
  const expenseCategories = snapshot.categories.filter((c) => c.type === TransactionType.EXPENSE);
  const ledgerTerms = snapshot.terms;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Digital Ledger</h1>
          <p className="text-sm text-slate-600">
            {activeTerm.academicYear} &mdash; {getSemesterLabel(activeTerm.semester)} &bull; {user.organizationName}
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-[#004aad] font-semibold hover:underline">
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Balance Summary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-[#004aad] text-white px-6 py-4">
          <span className="bg-[#f9d818] text-[#004aad] text-xs font-extrabold px-2.5 py-0.5 rounded uppercase tracking-wider">
            {activeTerm.active ? "Active Term Balances" : "Historical Term Balances"}
          </span>
        </div>
        <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="bg-slate-50 rounded-lg p-3 border">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Cash on Hand</div>
            <div className="text-lg font-extrabold text-slate-900 font-mono">{formatPesoFromCents(balances.cashOnHandCents)}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 border">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Cash in Bank</div>
            <div className="text-lg font-extrabold text-slate-900 font-mono">{formatPesoFromCents(balances.cashInBankCents)}</div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Total Income</div>
            <div className="text-lg font-extrabold text-emerald-700 font-mono">{formatPesoFromCents(balances.totalIncomeCents)}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3 border border-red-100">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Total Expense</div>
            <div className="text-lg font-extrabold text-red-700 font-mono">{formatPesoFromCents(balances.totalExpenseCents)}</div>
          </div>
          <div className="bg-[#004aad] text-white rounded-lg p-3 border border-[#004aad]">
            <div className="text-blue-100 font-bold uppercase tracking-wider text-[10px] mb-1">Remaining Balance</div>
            <div className="text-lg font-extrabold text-[#f9d818] font-mono">{formatPesoFromCents(balances.remainingCents)}</div>
          </div>
        </div>
      </div>

      {/* New Transaction Form */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <h2 className="font-bold text-slate-900 text-lg">New Transaction</h2>
        </div>
        <div className="p-6">
          <CreateTransactionForm
            incomeCategories={incomeCategories}
            expenseCategories={expenseCategories}
          />
        </div>
      </div>

      {/* Filters */}
      <LedgerFilters
        filters={parsedQuery}
        incomeCategories={incomeCategories}
        expenseCategories={expenseCategories}
        terms={ledgerTerms}
      />

      {/* Transactions Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 text-lg">
            Transactions ({transactions.length})
          </h2>
        </div>

        {transactions.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No transactions found. Use the form above to record your first entry.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <tr>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Type</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Category</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Payor / Payee</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Description</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Reference</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Event / Activity</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Account</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Amount</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Recorded By</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Date Recorded</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {tx.transactionDate.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${tx.type === "INCOME" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                        {tx.type === "INCOME" ? "Income" : "Expense"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{tx.categoryName}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{tx.counterpartyName || "—"}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-slate-700">{tx.description}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-slate-700">{tx.referenceDescription}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-slate-700">{tx.eventActivityName || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {tx.cashAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                      {formatPesoFromCents(tx.amountCents)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {tx.recordedByName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {tx.createdAt.toLocaleString("en-PH", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <EditTransactionForm
                          transaction={tx}
                          incomeCategories={incomeCategories}
                          expenseCategories={expenseCategories}
                        />
                        <DeleteTransactionForm id={tx.id} version={tx.version} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
