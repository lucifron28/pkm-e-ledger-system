import { requireUser } from "@/lib/auth/require-auth";
import { getSemesterLabel } from "@/lib/data/terms";
import { getLedgerPageSnapshot, LedgerEntry, CategoryDto } from "@/lib/data/transactions";
import { getOsaLedgerSummary, listOsaOrganizationsOverview, listTermsForOsaOrganization, validateOsaOrganization } from "@/lib/data/osa";
import { formatPesoFromCents } from "@/lib/data/money";
import { formatFinancialDate, formatPhilippineDate } from "@/lib/date-format";
import { Role, TransactionType } from "@prisma/client";
import { redirect } from "next/navigation";
import { LedgerRecordingHub } from "@/components/ledger/ledger-recording-hub";
import { EditTransactionForm } from "./edit-transaction-form";
import { DeleteTransactionForm } from "./delete-transaction-form";
import { EditCashTransferForm } from "./edit-cash-transfer-form";
import { DeleteCashTransferForm } from "./delete-cash-transfer-form";
import { TransactionDetailsModal } from "./transaction-details-modal";
import { CashTransferDetailsModal } from "./cash-transfer-details-modal";
import { AttachmentManager } from "./attachment-manager";
import { LedgerFilters } from "./ledger-filters";
import { OsaLedgerSummaryView, OsaOrganizationSelectView } from "@/components/ledger/osa-ledger-summary";
import { buildLedgerFilterUrl, parseLedgerQueryParams } from "@/lib/domain/query";
import { ButtonLink, MetricCard, PageHeader, StatusPanel } from "@/components/ui/patterns";
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
        <PageHeader eyebrow="Financial control" title="Ledger entries" description="Review and filter recorded transactions for your organization." />
        <LedgerFilters filters={parsedQuery} incomeCategories={incomeCategories} expenseCategories={expenseCategories} terms={snapshot.terms} />
        <StatusPanel title="Invalid ledger filter"><p>Check term selection, date range, month, cursor, page size, or academic year, then try again.</p></StatusPanel>
      </div>
    );
  }

  if (!activeTerm || !snapshot.balances) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Financial control" title="Ledger entries" description="Review and filter recorded transactions for your organization." />
        <StatusPanel title="Academic term required" action={<ButtonLink href="/settings/term">Set up academic term</ButtonLink>}>
          <p>No academic term is configured for {user.organizationName}.</p>
        </StatusPanel>
      </div>
    );
  }

  const balances = snapshot.balances;

  const currentCursor = parsedQuery.cursor;
  const hasCursor = Boolean(currentCursor);

  const firstPageUrl = buildLedgerFilterUrl(parsedQuery, { cursor: undefined });

  const prevPageUrl = snapshot.pagination.previousCursor
    ? buildLedgerFilterUrl(parsedQuery, { cursor: snapshot.pagination.previousCursor })
    : null;

  const nextPageUrl = snapshot.pagination.nextCursor
    ? buildLedgerFilterUrl(parsedQuery, { cursor: snapshot.pagination.nextCursor })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financial control"
        title="Ledger entries"
        description={`${activeTerm.academicYear} - ${getSemesterLabel(activeTerm.semester)} - ${user.organizationName}`}
        backHref="/dashboard"
        backLabel="Back to dashboard"
        actions={<span className={`ui-status-chip ${activeTerm.active ? "ui-status-chip-success" : "ui-status-chip-neutral"}`}>{activeTerm.active ? "Active term" : "Historical term"}</span>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Cash on Hand" value={formatPesoFromCents(balances.cashOnHandCents)} help="Current account balance" />
        <MetricCard label="Cash in Bank" value={formatPesoFromCents(balances.cashInBankCents)} help="Current account balance" tone="brand" />
        <MetricCard label="Total Collections" value={formatPesoFromCents(balances.totalIncomeCents)} help="Active income" tone="success" />
        <MetricCard label="Total Expenses" value={formatPesoFromCents(balances.totalExpenseCents)} help="Active expenses" tone="danger" />
        <MetricCard label="Remaining Balance" value={formatPesoFromCents(balances.remainingCents)} help="Available after expenses" tone="dark" />
      </div>

      {activeTerm.active ? (
        <LedgerRecordingHub
          activeTermId={activeTerm.id}
          incomeCategories={incomeCategories}
          expenseCategories={expenseCategories}
        />
      ) : (
        <StatusPanel title="Read-only historical term">
          <p>New entries may only be recorded in the active term.</p>
        </StatusPanel>
      )}

      <LedgerFilters filters={parsedQuery} incomeCategories={incomeCategories} expenseCategories={expenseCategories} terms={snapshot.terms} />

      <div className="ui-panel">
        <div className="ui-panel-header">
          <h2 className="ui-panel-title">
            Ledger entries - showing {snapshot.pagination.countOnPage} on this page.
          </h2>
          <div className="flex items-center gap-3 text-xs font-bold">
            {hasCursor && (
              <Link href={firstPageUrl} className="text-[#004aad] hover:underline">
                &laquo; First Page
              </Link>
            )}
            {prevPageUrl && (
              <Link href={prevPageUrl} className="text-[#004aad] hover:underline">
                &lsaquo; Previous Page
              </Link>
            )}
            {nextPageUrl && (
              <Link href={nextPageUrl} className="text-[#004aad] hover:underline">
                Next Page &rsaquo;
              </Link>
            )}
          </div>
        </div>

        {snapshot.entries.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No ledger entries found for selected filters.</div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="ui-data-table min-w-[1500px]">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left">Transaction Date</th>
                    <th className="px-4 py-3 text-left">Academic Year</th>
                    <th className="px-4 py-3 text-left">Semester</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Category / Movement</th>
                    <th className="px-4 py-3 text-left">Payor / Payee</th>
                    <th className="px-4 py-3 text-left">Particulars</th>
                    <th className="px-4 py-3 text-left">Reference</th>
                    <th className="px-4 py-3 text-left">Event / Activity</th>
                    <th className="px-4 py-3 text-left">Account</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Attachment</th>
                    <th className="px-4 py-3 text-left">Recorded By</th>
                    <th className="px-4 py-3 text-left">Date Recorded</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {snapshot.entries.map((entry) => (
                    <LedgerRow
                      key={`${entry.kind}-${entry.id}`}
                      entry={entry}
                      academicYear={activeTerm.academicYear}
                      semesterLabel={getSemesterLabel(activeTerm.semester)}
                      incomeCategories={incomeCategories}
                      expenseCategories={expenseCategories}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Responsive Card View */}
            <div className="block lg:hidden p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {snapshot.entries.map((entry) => {
                  const dateStr = formatFinancialDate(
                    entry.kind === "TRANSACTION" ? entry.transactionDate : entry.transferDate
                  );
                  const recordedDate = entry.createdAt ? formatPhilippineDate(entry.createdAt) : "-";
                  const isTransfer = entry.kind === "TRANSFER";
                  const isIncome = entry.kind === "TRANSACTION" && entry.type === "INCOME";

                  return (
                    <div
                      key={`card-${entry.kind}-${entry.id}`}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3 flex flex-col justify-between text-xs"
                    >
                      <div className="space-y-2">
                        {/* Top: Date, Type Chip, and Amount */}
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <span className="font-bold text-slate-500">{dateStr}</span>
                          <span
                            className={`font-bold px-2 py-0.5 rounded ${
                              isTransfer
                               ? "bg-blue-100 text-blue-800"
                               : isIncome
                               ? "bg-emerald-100 text-emerald-800"
                               : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {isTransfer ? "Transfer" : entry.type}
                          </span>
                        </div>

                        {/* Amount & Account */}
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-base font-extrabold text-slate-900">
                            {formatPesoFromCents(entry.amountCents)}
                          </span>
                          <span className="font-semibold text-slate-500">
                            {entry.kind === "TRANSACTION"
                              ? entry.cashAccount === "CASH_ON_HAND"
                                ? "Cash on Hand"
                                : "Cash in Bank"
                              : `${entry.fromAccount === "CASH_ON_HAND" ? "COH" : "CIB"} → ${
                                  entry.toAccount === "CASH_ON_HAND" ? "COH" : "CIB"
                                }`}
                          </span>
                        </div>

                        {/* Category & Counterparty */}
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-800">
                            {entry.kind === "TRANSACTION" ? entry.categoryName : "Cash Transfer"}
                            {entry.documentNumber && (
                              <span className="font-mono text-slate-500 ml-1.5 font-normal">
                                ({entry.documentNumber})
                              </span>
                            )}
                          </p>
                          {entry.kind === "TRANSACTION" && entry.counterpartyName && (
                            <p className="text-slate-600">
                              <span className="font-medium text-slate-400">Party: </span>
                              {entry.counterpartyName}
                            </p>
                          )}
                          {entry.eventActivityName && (
                            <p className="text-slate-600 truncate">
                              <span className="font-medium text-slate-400">Event: </span>
                              {entry.eventActivityName}
                            </p>
                          )}
                          <p className="text-slate-600 line-clamp-2 italic pt-0.5">
                            {entry.description}
                          </p>
                        </div>

                        {/* Attachments */}
                        <div className="pt-2 border-t border-slate-100">
                          <span className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Supporting Attachments
                          </span>
                          <AttachmentManager
                            transactionId={entry.kind === "TRANSACTION" ? entry.id : undefined}
                            cashTransferId={entry.kind === "TRANSFER" ? entry.id : undefined}
                            attachments={entry.attachments}
                          />
                        </div>
                      </div>

                      {/* Footer: User & Actions */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <span className="text-slate-400 truncate max-w-[120px]" title={`Recorded by ${entry.recordedByName} on ${recordedDate}`}>
                          {entry.recordedByName}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {entry.kind === "TRANSACTION" ? (
                            <>
                              <TransactionDetailsModal transaction={entry} />
                              <EditTransactionForm
                                transaction={entry}
                                incomeCategories={incomeCategories}
                                expenseCategories={expenseCategories}
                              />
                              <DeleteTransactionForm id={entry.id} version={entry.version} />
                            </>
                          ) : (
                            <>
                              <CashTransferDetailsModal transfer={entry} />
                              <EditCashTransferForm transfer={entry} />
                              <DeleteCashTransferForm id={entry.id} version={entry.version} />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LedgerRow({
  entry,
  academicYear,
  semesterLabel,
  incomeCategories,
  expenseCategories,
}: {
  entry: LedgerEntry;
  academicYear: string;
  semesterLabel: string;
  incomeCategories: CategoryDto[];
  expenseCategories: CategoryDto[];
}) {
  const dateRecorded = entry.createdAt ? formatPhilippineDate(entry.createdAt) : "-";

  if (entry.kind === "TRANSACTION") {
    return (
      <tr className="hover:bg-slate-50 align-top">
        <td className="px-4 py-3 whitespace-nowrap">{formatFinancialDate(entry.transactionDate)}</td>
        <td className="px-4 py-3 whitespace-nowrap">{academicYear}</td>
        <td className="px-4 py-3 whitespace-nowrap">{semesterLabel}</td>
        <td className="px-4 py-3 whitespace-nowrap font-bold">{entry.type === "INCOME" ? "Income" : "Expense"}</td>
        <td className="px-4 py-3 whitespace-nowrap">{entry.categoryName}</td>
        <td className="px-4 py-3 whitespace-nowrap">{entry.counterpartyName || "-"}</td>
        <td className="px-4 py-3 max-w-xs truncate">{entry.description}</td>
        <td className="px-4 py-3 max-w-xs truncate">{entry.referenceDescription}</td>
        <td className="px-4 py-3 max-w-xs truncate">{entry.eventActivityName || "-"}</td>
        <td className="px-4 py-3 whitespace-nowrap">{entry.cashAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank"}</td>
        <td className="px-4 py-3 text-right whitespace-nowrap font-mono font-bold">{formatPesoFromCents(entry.amountCents)}</td>
        <td className="px-4 py-3"><AttachmentManager transactionId={entry.id} attachments={entry.attachments} /></td>
        <td className="px-4 py-3 whitespace-nowrap">{entry.recordedByName}</td>
        <td className="px-4 py-3 whitespace-nowrap text-slate-500">{dateRecorded}</td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1.5">
            <TransactionDetailsModal transaction={entry} />
            <EditTransactionForm transaction={entry} incomeCategories={incomeCategories} expenseCategories={expenseCategories} />
            <DeleteTransactionForm id={entry.id} version={entry.version} />
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr className="hover:bg-slate-50 align-top">
      <td className="px-4 py-3 whitespace-nowrap">{formatFinancialDate(entry.transferDate)}</td>
      <td className="px-4 py-3 whitespace-nowrap">{academicYear}</td>
      <td className="px-4 py-3 whitespace-nowrap">{semesterLabel}</td>
      <td className="px-4 py-3 whitespace-nowrap font-bold">Transfer</td>
      <td className="px-4 py-3 whitespace-nowrap">{entry.fromAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank"} -&gt; {entry.toAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank"}</td>
      <td className="px-4 py-3 whitespace-nowrap">-</td>
      <td className="px-4 py-3 max-w-xs truncate">{entry.description}</td>
      <td className="px-4 py-3 max-w-xs truncate">{entry.referenceDescription}</td>
      <td className="px-4 py-3 max-w-xs truncate">{entry.eventActivityName || "-"}</td>
      <td className="px-4 py-3 whitespace-nowrap">{entry.fromAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank"}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap font-mono font-bold">{formatPesoFromCents(entry.amountCents)}</td>
      <td className="px-4 py-3"><AttachmentManager cashTransferId={entry.id} attachments={entry.attachments} /></td>
      <td className="px-4 py-3 whitespace-nowrap">{entry.recordedByName}</td>
      <td className="px-4 py-3 whitespace-nowrap text-slate-500">{dateRecorded}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1.5">
          <CashTransferDetailsModal transfer={entry} />
          <EditCashTransferForm transfer={entry} />
          <DeleteCashTransferForm id={entry.id} version={entry.version} />
        </div>
      </td>
    </tr>
  );
}
