"use client";

import { useRouter } from "next/navigation";
import type { OsaLedgerSummaryDto, OsaOrganizationSummaryDto } from "@/lib/data/osa";
import type { Semester } from "@prisma/client";
import { formatPesoFromCents } from "@/lib/data/money";
import { ButtonLink, MetricCard, PageHeader, Panel, StatusPanel } from "@/components/ui/patterns";

interface TermOption {
  id: string;
  academicYear: string;
  semester: Semester;
  active: boolean;
}

interface OsaOrganizationSelectViewProps {
  organizations: OsaOrganizationSummaryDto[];
  state?: "missing" | "invalid";
}

export function OsaOrganizationSelectView({
  organizations,
  state = "missing",
}: OsaOrganizationSelectViewProps) {
  const router = useRouter();

  function handleOrgChange(slug: string) {
    if (slug) router.push(`/ledger?org=${encodeURIComponent(slug)}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="OSA summarized ledger"
        title={state === "invalid" ? "Invalid or inactive organization" : "Select an organization"}
        description={state === "invalid" ? "The specified organization is invalid or inactive. Select an active organization below." : "Choose an active organization to inspect its financial ledger summary."}
      />
      <Panel title={`Active organizations (${organizations.length})`} description="Selection changes the organization context without granting edit access.">
        <div className="max-w-xl space-y-2">
          <label htmlFor="osa-ledger-organization" className="ui-label">Organization</label>
          <select id="osa-ledger-organization" value="" onChange={(event) => handleOrgChange(event.target.value)} className="ui-select">
            <option value="">Select organization</option>
            {organizations.map((organization) => (
              <option key={organization.organizationId} value={organization.organizationSlug}>
                {organization.organizationName} ({organization.organizationSlug})
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">Open reports separately when you need the complete official package.</p>
        </div>
      </Panel>
    </div>
  );
}

interface OsaLedgerSummaryViewProps {
  summary: OsaLedgerSummaryDto | null;
  organizations: OsaOrganizationSummaryDto[];
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
    router.push(slug ? `/ledger?org=${encodeURIComponent(slug)}` : "/ledger");
  }

  function handleTermChange(termId: string) {
    const selected = terms.find((term) => term.id === termId);
    if (!selected) return;
    router.push(`/ledger?org=${encodeURIComponent(currentOrgSlug)}&academicYear=${encodeURIComponent(selected.academicYear)}&semester=${encodeURIComponent(selected.semester)}`);
  }

  const reportHref = summary
    ? `/reports?org=${encodeURIComponent(summary.organizationSlug)}&academicYear=${encodeURIComponent(summary.academicYear)}&semester=${encodeURIComponent(summary.semester)}`
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="OSA summarized ledger"
        title={summary?.organizationName || "Ledger overview"}
        description={summary ? `${summary.academicYear} - ${summary.semesterLabel}${summary.active ? " - Active term" : ""}` : "Choose organization and term context to review summarized financial data."}
        actions={reportHref ? <ButtonLink href={reportHref} variant="success">View report package</ButtonLink> : undefined}
      />

      <Panel title="View context" description="Change organization or term to compare records without editing financial data.">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="osa-summary-organization" className="ui-label">Organization</label>
            <select id="osa-summary-organization" value={currentOrgSlug} onChange={(event) => handleOrgChange(event.target.value)} className="ui-select">
              {organizations.map((organization) => (
                <option key={organization.organizationId} value={organization.organizationSlug}>
                  {organization.organizationName} ({organization.organizationSlug})
                </option>
              ))}
            </select>
          </div>
          {terms.length > 0 && currentTermId && (
            <div>
              <label htmlFor="osa-summary-term" className="ui-label">Academic term</label>
              <select id="osa-summary-term" value={currentTermId} onChange={(event) => handleTermChange(event.target.value)} className="ui-select">
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.academicYear} - {term.semester === "FIRST_SEMESTER" ? "1st Semester" : term.semester === "SECOND_SEMESTER" ? "2nd Semester" : "Summer"} {term.active ? "(Active)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Panel>

      {!summary ? (
        <StatusPanel title="No ledger data available">
          <p>No active or historical term summary was found for this organization.</p>
        </StatusPanel>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Cash on Hand" value={formatPesoFromCents(summary.endingCashOnHandCents)} help="Current account balance" />
            <MetricCard label="Cash in Bank" value={formatPesoFromCents(summary.endingCashInBankCents)} help="Current account balance" tone="brand" />
            <MetricCard label="Total Collections" value={formatPesoFromCents(summary.totalIncomeCents)} help="Active income" tone="success" />
            <MetricCard label="Total Expenses" value={formatPesoFromCents(summary.totalExpenseCents)} help="Active expenses" tone="danger" />
            <MetricCard label="Remaining Balance" value={formatPesoFromCents(summary.remainingCents)} help="Available after expenses" tone="dark" />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel
              title="Income collections subtotals"
              actions={<span className="font-mono text-sm font-black text-emerald-700">{formatPesoFromCents(summary.totalIncomeCents)}</span>}
            >
              {summary.incomeCategoryTotals.length === 0 ? (
                <p className="py-4 text-sm italic text-slate-500">No income collections recorded for this term.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="ui-data-table">
                    <thead><tr><th scope="col">Category</th><th scope="col" className="text-right">Subtotal</th></tr></thead>
                    <tbody>{summary.incomeCategoryTotals.map((category) => (
                      <tr key={category.categoryId}><td className="font-semibold text-slate-800">{category.categoryName}</td><td className="text-right font-mono font-bold text-emerald-700">{formatPesoFromCents(category.totalCents)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel
              title="Operating expense subtotals"
              actions={<span className="font-mono text-sm font-black text-red-700">{formatPesoFromCents(summary.totalExpenseCents)}</span>}
            >
              {summary.expenseCategoryTotals.length === 0 ? (
                <p className="py-4 text-sm italic text-slate-500">No operating expenses recorded for this term.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="ui-data-table">
                    <thead><tr><th scope="col">Category</th><th scope="col" className="text-right">Subtotal</th></tr></thead>
                    <tbody>{summary.expenseCategoryTotals.map((category) => (
                      <tr key={category.categoryId}><td className="font-semibold text-slate-800">{category.categoryName}</td><td className="text-right font-mono font-bold text-red-700">{formatPesoFromCents(category.totalCents)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
