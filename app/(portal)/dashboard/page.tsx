import { requireUser } from "@/lib/auth/require-auth";
import { isManagementRole } from "@/lib/auth/rbac";
import { getSemesterLabel, listTermsForCurrentUser } from "@/lib/data/terms";
import { getDashboardBalancesForUser } from "@/lib/data/transactions";
import { formatPesoFromCents } from "@/lib/data/money";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { IconArrowRight as ArrowRight, IconFileAnalytics as FileAnalytics, IconPlus as Plus, IconReceipt as Receipt, IconRefresh as Refresh } from "@tabler/icons-react";
import { DashboardTermSelector } from "@/components/dashboard/dashboard-term-selector";
import { parseTermSelectionParams } from "@/lib/domain/query";
import { ButtonLink, MetricCard, PageHeader, Panel, StatusPanel } from "@/components/ui/patterns";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  if (user.role === Role.OSA) redirect("/osa");

  const params = await searchParams;
  const termQuery = parseTermSelectionParams(params);
  const isManagement = isManagementRole(user.role);
  const terms = await listTermsForCurrentUser();

  if (termQuery.invalidTermSelection) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Portal" title="Dashboard" description="Review current balances and financial activity." />
        <StatusPanel title="Invalid academic term" tone="warning">
          Choose a complete, valid academic term from the dashboard selector.
        </StatusPanel>
      </div>
    );
  }

  const dashboardData = await getDashboardBalancesForUser(user, termQuery.academicYear, termQuery.semester);
  const activeTerm = dashboardData?.term;
  const balances = dashboardData?.balances;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${user.organizationName || "Office of Student Affairs"} / ${user.role}`}
        title={`Welcome back, ${user.fullName}`}
        description="A clear view of your organization’s financial position for the selected academic term."
        actions={
          <>
            {terms.length > 0 && activeTerm && <DashboardTermSelector terms={terms} currentTermId={activeTerm.id} />}
            {isManagement && (
              <ButtonLink href="/settings/term" variant="secondary">
                Term settings
              </ButtonLink>
            )}
          </>
        }
      />

      {activeTerm ? (
        <Panel
          title="Current academic term"
          description={`${activeTerm.academicYear} - ${getSemesterLabel(activeTerm.semester)}`}
          actions={
            <ButtonLink
              href={`/reports?academicYear=${encodeURIComponent(activeTerm.academicYear)}&semester=${encodeURIComponent(activeTerm.semester)}`}
              variant="quiet"
            >
              <FileAnalytics size={17} aria-hidden="true" />
              View report package
            </ButtonLink>
          }
        >
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
            <span className={`ui-status-chip ${activeTerm.active ? "ui-status-chip-success" : "ui-status-chip-neutral"}`}>
              {activeTerm.active ? "Active term" : "Historical term"}
            </span>
            <span>Balances and reports use this term context.</span>
          </div>
        </Panel>
      ) : (
        <StatusPanel
          title={isManagement ? "Set up an academic term before recording transactions" : "No active academic term"}
          tone="warning"
          action={isManagement ? <ButtonLink href="/settings/term">Set up term</ButtonLink> : undefined}
        >
          {isManagement
            ? "Create an academic term and opening balances to begin recording financial activity."
            : "Ask your Treasurer or Adviser to configure an active academic term."}
        </StatusPanel>
      )}

      {activeTerm && balances && (
        <>
          <section aria-labelledby="financial-summary-heading" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="ui-eyebrow">Financial position</p>
                <h2 id="financial-summary-heading" className="text-lg font-extrabold text-slate-900">Selected term summary</h2>
              </div>
              <span className="text-xs font-bold text-slate-500">All amounts in Philippine pesos</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard label="Remaining balance" value={formatPesoFromCents(balances.remainingCents)} help="Opening funds + income - expenses" tone="dark" className="xl:col-span-2" />
              <MetricCard label="Cash on Hand" value={formatPesoFromCents(balances.cashOnHandCents)} help="Physical cash balance" tone="brand" />
              <MetricCard label="Cash in Bank" value={formatPesoFromCents(balances.cashInBankCents)} help="Bank account balance" tone="neutral" />
              <MetricCard label="Total income" value={formatPesoFromCents(balances.totalIncomeCents)} help="Recorded collections" tone="success" />
              <MetricCard label="Total expenses" value={formatPesoFromCents(balances.totalExpenseCents)} help="Recorded disbursements" tone="danger" />
            </div>
          </section>

          <Panel
            title="Next actions"
            description={isManagement ? "Keep routine recording tasks close to the summary." : "Review available information for your role."}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {isManagement ? (
                <>
                  <ButtonLink href="/ledger/income/new" variant="primary" className="justify-between">
                    <span className="inline-flex items-center gap-2"><Plus size={17} aria-hidden="true" /> Record income</span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </ButtonLink>
                  <ButtonLink href="/ledger/expense/new" variant="secondary" className="justify-between">
                    <span className="inline-flex items-center gap-2"><Receipt size={17} aria-hidden="true" /> Record expense</span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </ButtonLink>
                  <ButtonLink href="/ledger" variant="secondary" className="justify-between">
                    <span className="inline-flex items-center gap-2"><Refresh size={17} aria-hidden="true" /> Review ledger and transfers</span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </ButtonLink>
                </>
              ) : (
                <>
                  <ButtonLink href="/reports" variant="primary" className="justify-between">
                    <span className="inline-flex items-center gap-2"><FileAnalytics size={17} aria-hidden="true" /> View reports</span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </ButtonLink>
                  <ButtonLink href="/ledger" variant="secondary" className="justify-between">
                    <span className="inline-flex items-center gap-2"><Receipt size={17} aria-hidden="true" /> View ledger summary</span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </ButtonLink>
                </>
              )}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
