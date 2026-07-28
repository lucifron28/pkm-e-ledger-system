import { requireUser } from "@/lib/auth/require-auth";
import { isManagementRole } from "@/lib/auth/rbac";
import { getActiveTermForCurrentUser, getSemesterLabel } from "@/lib/data/terms";
import {
  getDashboardBalances,
  listCategoriesForType,
  listLedgerTransactions,
  listTermsForLedger,
} from "@/lib/data/transactions";
import {
  getOsaLedgerSummary,
  listOsaOrganizationsOverview,
  listTermsForOsaOrganization,
  validateOsaOrganization,
} from "@/lib/data/osa";
import type { TransactionFilters } from "@/lib/data/transactions";
import { formatPesoFromCents } from "@/lib/data/money";
import { Role, Semester, TransactionType, CashAccount } from "@prisma/client";
import { redirect } from "next/navigation";
import { CreateTransactionForm } from "./create-transaction-form";
import { EditTransactionForm } from "./edit-transaction-form";
import { DeleteTransactionForm } from "./delete-transaction-form";
import { LedgerFilters } from "./ledger-filters";
import { AttachmentManager } from "./attachment-manager";
import {
  OsaLedgerSummaryView,
  OsaOrganizationSelectView,
} from "@/components/ledger/osa-ledger-summary";
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

  let orgRaw: string | undefined = undefined;
  if (typeof params.org === "string" && params.org.trim().length > 0) {
    orgRaw = params.org.trim();
  }

  // OSA Summarized Ledger View
  if (user.role === Role.OSA) {
    const orgsOverview = await listOsaOrganizationsOverview();
    const organizations = orgsOverview.map((o) => ({
      id: o.organizationId,
      name: o.organizationName,
      slug: o.organizationSlug,
    }));

    if (!orgRaw) {
      return (
        <OsaOrganizationSelectView
          organizations={organizations}
          state="missing"
        />
      );
    }

    const validatedOrg = await validateOsaOrganization(orgRaw);
    if (!validatedOrg) {
      return (
        <OsaOrganizationSelectView
          organizations={organizations}
          state="invalid"
        />
      );
    }

    const terms = await listTermsForOsaOrganization(validatedOrg.slug);
    const summary = await getOsaLedgerSummary(validatedOrg.slug, ayRaw, semRaw);

    return (
      <OsaLedgerSummaryView
        summary={summary}
        organizations={organizations}
        terms={terms}
        currentOrgSlug={validatedOrg.slug}
        currentTermId={summary?.termId || null}
      />
    );
  }

  // Management Detailed Ledger View (Treasurer, Adviser, Audit)
  if (!user.organizationId || !isManagementRole(user.role)) {
    redirect("/access-denied");
  }

  const activeTerm = await getActiveTermForCurrentUser();
  if (!activeTerm) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Digital Ledger</h1>
        <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-8 rounded-xl text-center space-y-3">
          <h2 className="text-lg font-bold text-amber-900">No Active Academic Term</h2>
          <p className="text-sm text-amber-700">Configure an active term before recording transactions.</p>
          <Link href="/settings/term" className="inline-block bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow transition text-sm">
            Set Up Academic Term
          </Link>
        </div>
      </div>
    );
  }

  const filters: TransactionFilters = {};
  const typeRaw = params.type as string | undefined;
  if (typeRaw && Object.values(TransactionType).includes(typeRaw as TransactionType)) {
    filters.type = typeRaw as TransactionType;
  }
  if (params.categoryId) filters.categoryId = params.categoryId as string;
  if (ayRaw) filters.academicYear = ayRaw;
  if (semRaw) filters.semester = semRaw;
  if (params.cashAccount && Object.values(CashAccount).includes(params.cashAccount as CashAccount)) {
    filters.cashAccount = params.cashAccount as CashAccount;
  }
  if (params.month) filters.month = params.month as string;
  if (params.event) filters.eventActivityName = params.event as string;
  if (params.dateFrom) filters.dateFrom = params.dateFrom as string;
  if (params.dateTo) filters.dateTo = params.dateTo as string;
  if (params.search) filters.search = params.search as string;

  const [balances, transactions, incomeCategories, expenseCategories, ledgerTerms] = await Promise.all([
    getDashboardBalances(),
    listLedgerTransactions(filters),
    listCategoriesForType(TransactionType.INCOME),
    listCategoriesForType(TransactionType.EXPENSE),
    listTermsForLedger(),
  ]);

  if (!balances) {
    return <div className="p-6 text-sm text-slate-600">Active-term balances unavailable.</div>;
  }

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
            Active Term Balances
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
        filters={filters}
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
                  <th className="px-4 py-3 text-left whitespace-nowrap">Academic Year</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Semester</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Type</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Category</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Payor / Payee</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Description</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Reference</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Attachment</th>
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
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{tx.academicYear}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{getSemesterLabel(tx.semester)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${tx.type === "INCOME" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                        {tx.type === "INCOME" ? "Income" : "Expense"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{tx.categoryName}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{tx.counterpartyName || "—"}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-slate-700">{tx.description}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-slate-700">{tx.referenceDescription}</td>
                    <td className="px-4 py-3"><AttachmentManager transactionId={tx.id} attachments={tx.attachments} /></td>
                    <td className="px-4 py-3 max-w-xs truncate text-slate-700">{tx.eventActivityName || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {tx.cashAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                      {formatPesoFromCents(tx.amountCents)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {tx.recordedByFullName}<div className="text-xs text-slate-500">{tx.recordedByUsername}</div>
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
                        <DeleteTransactionForm id={tx.id} />
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
