import { requireUser } from "@/lib/auth/require-auth";
import { getSemesterLabel } from "@/lib/data/terms";
import { getLedgerPageSnapshot, LedgerEntry, CategoryDto } from "@/lib/data/transactions";
import { getOsaLedgerSummary, listOsaOrganizationsOverview, listTermsForOsaOrganization, validateOsaOrganization } from "@/lib/data/osa";
import { formatPesoFromCents } from "@/lib/data/money";
import { Role, TransactionType } from "@prisma/client";
import { redirect } from "next/navigation";
import { CreateTransactionForm } from "./create-transaction-form";
import { EditTransactionForm } from "./edit-transaction-form";
import { DeleteTransactionForm } from "./delete-transaction-form";
import { CreateCashTransferForm } from "./create-cash-transfer-form";
import { EditCashTransferForm } from "./edit-cash-transfer-form";
import { DeleteCashTransferForm } from "./delete-cash-transfer-form";
import { CashTransferDetailsModal } from "./cash-transfer-details-modal";
import { AttachmentManager } from "./attachment-manager";
import { LedgerFilters } from "./ledger-filters";
import { OsaLedgerSummaryView, OsaOrganizationSelectView } from "@/components/ledger/osa-ledger-summary";
import { parseLedgerQueryParams } from "@/lib/domain/query";
import Link from "next/link";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (user.role === Role.OFFICER || user.role === Role.MEMBER) redirect("/dashboard");

  const rawParams = await searchParams;
  const parsedQuery = parseLedgerQueryParams(rawParams);

  if (user.role === Role.OSA) {
    const summaries = await listOsaOrganizationsOverview();
    const selectedOrgSlugOrId = parsedQuery.org;
    const hasInvalidQuery = Object.entries(parsedQuery).some(
      ([key, value]) => key.startsWith("invalid") && value === true
    );
    if (hasInvalidQuery) {
      return <OsaOrganizationSelectView organizations={summaries} state="invalid" />;
    }
    if (!selectedOrgSlugOrId) return <OsaOrganizationSelectView organizations={summaries} />;
    const validOrg = await validateOsaOrganization(selectedOrgSlugOrId);
    if (!validOrg) return <OsaOrganizationSelectView organizations={summaries} state="invalid" />;
    const availableTerms = await listTermsForOsaOrganization(validOrg.id);
    const summary = await getOsaLedgerSummary(validOrg.id, parsedQuery.academicYear, parsedQuery.semester);
    return <OsaLedgerSummaryView summary={summary} organizations={summaries} terms={availableTerms} currentOrgSlug={validOrg.slug} currentTermId={summary?.termId || null} />;
  }

  const snapshot = await getLedgerPageSnapshot(user, rawParams);
  const incomeCategories = snapshot.categories.filter((category) => category.type === TransactionType.INCOME);
  const expenseCategories = snapshot.categories.filter((category) => category.type === TransactionType.EXPENSE);
  const activeTerm = snapshot.selectedTerm;

  if (Object.values(snapshot.queryValidity).some(Boolean)) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Ledger Entries</h1>
        <LedgerFilters filters={parsedQuery} incomeCategories={incomeCategories} expenseCategories={expenseCategories} terms={snapshot.terms} />
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 text-sm text-amber-900">
          Invalid ledger filter. Check term selection, date range, month, cursor, page size, or academic year, then try again.
        </div>
      </div>
    );
  }

  if (!activeTerm || !snapshot.balances) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Ledger Entries</h1>
        <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-8 rounded-xl text-center space-y-3">
          <p className="text-amber-900 font-medium">No academic term configured for {user.organizationName}.</p>
          <Link href="/settings/term" className="inline-block bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow text-sm">Set Up Academic Term</Link>
        </div>
      </div>
    );
  }

  const balances = snapshot.balances;
  const nextParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string" && key !== "cursor") nextParams.set(key, value);
  }
  if (snapshot.pagination.nextCursor) nextParams.set("cursor", snapshot.pagination.nextCursor);
  const nextPageUrl = snapshot.pagination.nextCursor ? `/ledger?${nextParams.toString()}` : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Ledger Entries</h1>
          <p className="text-sm text-slate-600">{activeTerm.academicYear} - {getSemesterLabel(activeTerm.semester)} - {user.organizationName}</p>
        </div>
        <Link href="/dashboard" className="text-sm text-[#004aad] font-semibold hover:underline">Back to Dashboard</Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-[#004aad] text-white px-6 py-4"><span className="bg-[#f9d818] text-[#004aad] text-xs font-extrabold px-2.5 py-0.5 rounded uppercase tracking-wider">{activeTerm.active ? "Active Term Balances" : "Historical Term Balances"}</span></div>
        <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-5 gap-4">
          <BalanceCard label="Cash on Hand" value={formatPesoFromCents(balances.cashOnHandCents)} />
          <BalanceCard label="Cash in Bank" value={formatPesoFromCents(balances.cashInBankCents)} />
          <BalanceCard label="Total Income" value={formatPesoFromCents(balances.totalIncomeCents)} tone="income" />
          <BalanceCard label="Total Expense" value={formatPesoFromCents(balances.totalExpenseCents)} tone="expense" />
          <BalanceCard label="Remaining Balance" value={formatPesoFromCents(balances.remainingCents)} tone="remaining" />
        </div>
      </div>

      {activeTerm.active ? (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"><div className="px-6 py-4 bg-slate-50 border-b border-slate-200"><h2 className="font-bold text-slate-900 text-lg">New Transaction</h2></div><div className="p-6"><CreateTransactionForm activeTermId={activeTerm.id} incomeCategories={incomeCategories} expenseCategories={expenseCategories} /></div></div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"><div className="px-6 py-4 bg-slate-50 border-b border-slate-200"><h2 className="font-bold text-slate-900 text-lg">New Cash Transfer</h2></div><div className="p-6"><CreateCashTransferForm activeTermId={activeTerm.id} /></div></div>
        </>
      ) : (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 text-center text-sm font-semibold text-amber-900">
          New entries may only be recorded in the active term.
        </div>
      )}

      <LedgerFilters filters={parsedQuery} incomeCategories={incomeCategories} expenseCategories={expenseCategories} terms={snapshot.terms} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between"><h2 className="font-bold text-slate-900 text-lg">Ledger Entries - showing {snapshot.pagination.countOnPage} on this page.</h2>{nextPageUrl && <Link href={nextPageUrl} className="text-sm text-[#004aad] font-bold hover:underline">Next page</Link>}</div>
        {snapshot.entries.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No ledger entries found for selected filters.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-bold"><tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Category / Movement</th><th className="px-4 py-3 text-left">Payor / Payee</th><th className="px-4 py-3 text-left">Particulars</th><th className="px-4 py-3 text-left">Reference</th><th className="px-4 py-3 text-left">Event / Activity</th><th className="px-4 py-3 text-left">Account</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-left">Attachment</th><th className="px-4 py-3 text-left">Recorded By</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{snapshot.entries.map((entry) => <LedgerRow key={`${entry.kind}-${entry.id}`} entry={entry} incomeCategories={incomeCategories} expenseCategories={expenseCategories} />)}</tbody></table></div>}
      </div>
    </div>
  );
}

function BalanceCard({ label, value, tone }: { label: string; value: string; tone?: "income" | "expense" | "remaining" }) {
  const classes = tone === "income" ? "bg-emerald-50 border-emerald-100 text-emerald-700" : tone === "expense" ? "bg-red-50 border-red-100 text-red-700" : tone === "remaining" ? "bg-[#004aad] border-[#004aad] text-[#f9d818]" : "bg-slate-50 border-slate-200 text-slate-900";
  return <div className={`rounded-lg p-3 border ${classes}`}><div className="text-xs font-bold uppercase tracking-wider mb-1 text-slate-500">{label}</div><div className="text-lg font-extrabold font-mono">{value}</div></div>;
}

function LedgerRow({ entry, incomeCategories, expenseCategories }: { entry: LedgerEntry; incomeCategories: CategoryDto[]; expenseCategories: CategoryDto[] }) {
  if (entry.kind === "TRANSACTION") {
    return <tr className="hover:bg-slate-50 align-top"><td className="px-4 py-3 whitespace-nowrap">{entry.transactionDate.toLocaleDateString("en-PH")}</td><td className="px-4 py-3 whitespace-nowrap font-bold">{entry.type === "INCOME" ? "Income" : "Expense"}</td><td className="px-4 py-3 whitespace-nowrap">{entry.categoryName}</td><td className="px-4 py-3 whitespace-nowrap">{entry.counterpartyName || "-"}</td><td className="px-4 py-3 max-w-xs truncate">{entry.description}</td><td className="px-4 py-3 max-w-xs truncate">{entry.referenceDescription}</td><td className="px-4 py-3 max-w-xs truncate">{entry.eventActivityName || "-"}</td><td className="px-4 py-3 whitespace-nowrap">{entry.cashAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank"}</td><td className="px-4 py-3 text-right whitespace-nowrap font-mono font-bold">{formatPesoFromCents(entry.amountCents)}</td><td className="px-4 py-3"><AttachmentManager transactionId={entry.id} attachments={entry.attachments} /></td><td className="px-4 py-3 whitespace-nowrap">{entry.recordedByName}</td><td className="px-4 py-3 text-right whitespace-nowrap"><div className="flex items-center justify-end gap-1.5"><EditTransactionForm transaction={entry} incomeCategories={incomeCategories} expenseCategories={expenseCategories} /><DeleteTransactionForm id={entry.id} version={entry.version} /></div></td></tr>;
  }
  return <tr className="hover:bg-slate-50 align-top"><td className="px-4 py-3 whitespace-nowrap">{entry.transferDate.toLocaleDateString("en-PH")}</td><td className="px-4 py-3 whitespace-nowrap font-bold">Transfer</td><td className="px-4 py-3 whitespace-nowrap">{entry.fromAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank"} -&gt; {entry.toAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank"}</td><td className="px-4 py-3 whitespace-nowrap">-</td><td className="px-4 py-3 max-w-xs truncate">{entry.description}</td><td className="px-4 py-3 max-w-xs truncate">{entry.referenceDescription}</td><td className="px-4 py-3 max-w-xs truncate">{entry.eventActivityName || "-"}</td><td className="px-4 py-3 whitespace-nowrap">{entry.fromAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank"}</td><td className="px-4 py-3 text-right whitespace-nowrap font-mono font-bold">{formatPesoFromCents(entry.amountCents)}</td><td className="px-4 py-3"><AttachmentManager cashTransferId={entry.id} attachments={entry.attachments} /></td><td className="px-4 py-3 whitespace-nowrap">{entry.recordedByName}</td><td className="px-4 py-3 text-right whitespace-nowrap"><div className="flex items-center justify-end gap-1.5"><CashTransferDetailsModal transfer={entry} /><EditCashTransferForm transfer={entry} /><DeleteCashTransferForm id={entry.id} version={entry.version} /></div></td></tr>;
}
