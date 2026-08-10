import { requireOsaUser } from "@/lib/auth/require-auth";
import { listOsaOrganizationsOverview } from "@/lib/data/osa";
import { formatPesoFromCents } from "@/lib/data/money";
import { ButtonLink, PageHeader, Panel, StatusPanel } from "@/components/ui/patterns";

export default async function OsaOverviewPage() {
  const user = await requireOsaUser();
  const overviewList = await listOsaOrganizationsOverview();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Office of Student Affairs"
        title="Organization monitoring"
        description={`Compare active financial positions across recognized student organizations. Signed in as ${user.fullName} (${user.username}).`}
        actions={<ButtonLink href="/account" variant="secondary">Manage account</ButtonLink>}
      />

      <Panel
        title={`Recognized student organizations (${overviewList.length})`}
        description="Use each row to open a summarized ledger or the official report package."
      >
        {overviewList.length === 0 ? (
          <StatusPanel title="No active student organizations found">
            <p>The monitoring overview has no active organization records.</p>
          </StatusPanel>
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-data-table min-w-[1080px] table-fixed">
              <caption className="sr-only">Financial position comparison for recognized student organizations</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-[28%]">Organization</th>
                  <th scope="col" className="w-[14%]">Active term</th>
                  <th scope="col" className="w-[17%]">Cash position</th>
                  <th scope="col" className="w-[10%] text-right">Collections</th>
                  <th scope="col" className="w-[10%] text-right">Expenses</th>
                  <th scope="col" className="w-[10%] text-right">Remaining</th>
                  <th scope="col" className="w-[11%] text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {overviewList.map((org) => (
                  <tr key={org.organizationId}>
                    <td>
                      <div className="min-w-0">
                        <p className="font-extrabold leading-snug text-slate-900">{org.organizationName}</p>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">
                          Last activity: {org.lastActivityDate ? org.lastActivityDate.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "No activity"}
                        </p>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      {org.hasActiveTerm ? (
                        <>
                          <p className="font-bold text-slate-900">{org.academicYear}</p>
                          <p className="mt-1 text-xs text-slate-500">{org.semesterLabel}</p>
                        </>
                      ) : (
                        <span className="ui-status-chip ui-status-chip-warning">No active term</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {org.hasActiveTerm ? (
                        <div className="grid gap-1 text-xs">
                          <span><strong className="text-slate-500">Hand:</strong> <span className="font-mono font-bold">{formatPesoFromCents(org.endingCashOnHandCents)}</span></span>
                          <span><strong className="text-slate-500">Bank:</strong> <span className="font-mono font-bold">{formatPesoFromCents(org.endingCashInBankCents)}</span></span>
                        </div>
                      ) : "-"}
                    </td>
                    <td className="text-right font-mono font-bold text-emerald-700">{org.hasActiveTerm ? formatPesoFromCents(org.totalIncomeCents) : "-"}</td>
                    <td className="text-right font-mono font-bold text-red-700">{org.hasActiveTerm ? formatPesoFromCents(org.totalExpenseCents) : "-"}</td>
                    <td className="text-right font-mono text-base font-black text-[#004aad]">{org.hasActiveTerm ? formatPesoFromCents(org.remainingCents) : "-"}</td>
                    <td className="whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        <ButtonLink
                          href={`/ledger?org=${encodeURIComponent(org.organizationSlug)}`}
                          variant="secondary"
                          className="whitespace-nowrap px-3 text-xs"
                          aria-label={`Open ledger for ${org.organizationName}`}
                        >
                          Ledger
                        </ButtonLink>
                        <ButtonLink
                          href={`/reports?org=${encodeURIComponent(org.organizationSlug)}`}
                          variant="success"
                          className="whitespace-nowrap px-3 text-xs"
                          aria-label={`Open reports for ${org.organizationName}`}
                        >
                          Reports
                        </ButtonLink>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
