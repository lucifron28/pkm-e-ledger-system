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
import { MetricCard, PageHeader, Panel, StatusPanel } from "@/components/ui/patterns";

export default async function TermSettingsPage() {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Settings" title="Term settings" description="Configure academic terms and opening balances." />
        <StatusPanel title="Organization assignment required"><p>You are not assigned to an active organization.</p></StatusPanel>
      </div>
    );
  }

  const [activeTerm, terms] = await Promise.all([
    getActiveTermForCurrentUser(),
    listTermsForCurrentUser(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Term settings"
        description={`Configure academic terms and opening balances for ${user.organizationName}.`}
        backHref="/dashboard"
        backLabel="Back to dashboard"
      />

      {activeTerm && (
        <Panel
          title={`${activeTerm.academicYear} - ${getSemesterLabel(activeTerm.semester)}`}
          description="Active term opening balances establish balance forwarded for the official report package."
          actions={<span className="ui-status-chip ui-status-chip-success">Active term</span>}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Opening Cash on Hand" value={formatPesoFromCents(activeTerm.openingCashOnHandCents)} />
            <MetricCard label="Opening Cash in Bank" value={formatPesoFromCents(activeTerm.openingCashInBankCents)} tone="brand" />
            <MetricCard label="Balance Forwarded" value={formatPesoFromCents(activeTerm.balanceForwardedCents)} tone="dark" />
          </div>
        </Panel>
      )}

      <Panel title="Create academic term" description="Add a term before recording transactions or publishing its reports.">
        <CreateTermForm hasActiveTerm={!!activeTerm} />
      </Panel>

      <Panel title={`All academic terms (${terms.length})`} description="Activate one term at a time. Historical terms remain available for review.">
        {terms.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">No academic terms have been created yet. Use the form above to create the first term.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-data-table min-w-[820px]">
              <caption className="sr-only">Academic terms and opening balances</caption>
              <thead>
                <tr>
                  <th scope="col">Academic year</th>
                  <th scope="col">Semester</th>
                  <th scope="col" className="text-right">Cash on Hand</th>
                  <th scope="col" className="text-right">Cash in Bank</th>
                  <th scope="col" className="text-right">Balance forwarded</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {terms.map((term) => <TermRow key={term.id} term={term} isActive={activeTerm?.id === term.id} />)}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function TermRow({ term, isActive }: { term: TermDto; isActive: boolean }) {
  return (
    <tr className={isActive ? "bg-blue-50/50" : undefined}>
      <td className="font-semibold text-slate-900">{term.academicYear}</td>
      <td>{getSemesterLabel(term.semester)}</td>
      <td className="text-right font-mono">{formatPesoFromCents(term.openingCashOnHandCents)}</td>
      <td className="text-right font-mono">{formatPesoFromCents(term.openingCashInBankCents)}</td>
      <td className="text-right font-mono font-bold text-slate-900">{formatPesoFromCents(term.balanceForwardedCents)}</td>
      <td><span className={`ui-status-chip ${isActive ? "ui-status-chip-success" : "ui-status-chip-neutral"}`}>{isActive ? "Active" : "Inactive"}</span></td>
      <td>
        <div className="flex justify-end gap-2">
          {!isActive && <ActivateTermForm termId={term.id} />}
          <EditOpeningBalancesForm
            termId={term.id}
            version={term.version}
            initialCashOnHand={formatPesoInputFromCents(term.openingCashOnHandCents)}
            initialCashInBank={formatPesoInputFromCents(term.openingCashInBankCents)}
          />
        </div>
      </td>
    </tr>
  );
}
