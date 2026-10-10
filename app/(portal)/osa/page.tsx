import { requireOsaUser } from "@/lib/auth/require-auth";
import { listOsaOrganizationsOverview } from "@/lib/data/osa";
import { formatPesoFromCents } from "@/lib/data/money";
import { ButtonLink, PageHeader, Panel, StatusPanel } from "@/components/ui/patterns";
import { IconFileSpreadsheet } from "@tabler/icons-react";
import { formatPhilippineDate } from "@/lib/date-format";

export default async function OsaOverviewPage() {
  const user = await requireOsaUser();
  const overviewList = await listOsaOrganizationsOverview();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Office of Student Affairs"
        title="Organization monitoring"
        description={`Compare active financial positions across recognized student organizations. Signed in as ${user.fullName} (${user.username}).`}
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <ButtonLink
              href="/api/demo-accounts/excel"
              download
              variant="success"
              aria-label="Download seeded demo accounts Excel workbook"
            >
              <IconFileSpreadsheet size={17} aria-hidden="true" />
              <span>Demo accounts Excel</span>
            </ButtonLink>
            <ButtonLink href="/account" variant="secondary">Manage account</ButtonLink>
          </div>
        }
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
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
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
                          <p className="mt-1 text-xs leading-4 text-slate-500">
                            Last activity: {org.lastActivityDate ? formatPhilippineDate(org.lastActivityDate) : "No activity"}
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
                            className="whitespace-nowrap px-3 text-xs min-h-[36px]"
                            aria-label={`Open ledger for ${org.organizationName}`}
                          >
                            Ledger
                          </ButtonLink>
                          <ButtonLink
                            href={`/reports?org=${encodeURIComponent(org.organizationSlug)}`}
                            variant="success"
                            className="whitespace-nowrap px-3 text-xs min-h-[36px]"
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

            {/* Mobile & Tablet Responsive Card View */}
            <div className="block lg:hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {overviewList.map((org) => (
                  <div
                    key={`mobile-osa-${org.organizationId}`}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3 flex flex-col justify-between text-xs"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                        <div>
                          <h3 className="font-extrabold text-sm text-slate-900 leading-snug">{org.organizationName}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Last active: {org.lastActivityDate ? formatPhilippineDate(org.lastActivityDate) : "No activity"}
                          </p>
                        </div>
                        {org.hasActiveTerm ? (
                          <span className="ui-status-chip ui-status-chip-success shrink-0">Active</span>
                        ) : (
                          <span className="ui-status-chip ui-status-chip-warning shrink-0">No Term</span>
                        )}
                      </div>

                      {org.hasActiveTerm ? (
                        <>
                          <p className="font-semibold text-slate-700">
                            {org.academicYear} - {org.semesterLabel}
                          </p>

                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                            <div>
                              <span className="text-slate-500 block">Cash on Hand</span>
                              <span className="font-mono font-bold text-slate-900">{formatPesoFromCents(org.endingCashOnHandCents)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Cash in Bank</span>
                              <span className="font-mono font-bold text-slate-900">{formatPesoFromCents(org.endingCashInBankCents)}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-1 pt-1 text-center">
                            <div className="rounded bg-emerald-50/70 p-1.5 border border-emerald-100">
                              <span className="text-[11px] text-emerald-800 font-semibold block">Income</span>
                              <span className="font-mono font-bold text-emerald-700 text-xs">{formatPesoFromCents(org.totalIncomeCents)}</span>
                            </div>
                            <div className="rounded bg-rose-50/70 p-1.5 border border-rose-100">
                              <span className="text-[11px] text-rose-800 font-semibold block">Expenses</span>
                              <span className="font-mono font-bold text-rose-700 text-xs">{formatPesoFromCents(org.totalExpenseCents)}</span>
                            </div>
                            <div className="rounded bg-blue-50/70 p-1.5 border border-blue-100">
                              <span className="text-[11px] text-blue-800 font-semibold block">Remaining</span>
                              <span className="font-mono font-extrabold text-[#004aad] text-xs">{formatPesoFromCents(org.remainingCents)}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="italic text-slate-400 py-2">No active financial term configured.</p>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <ButtonLink
                        href={`/ledger?org=${encodeURIComponent(org.organizationSlug)}`}
                        variant="secondary"
                        className="px-3 text-xs min-h-[36px]"
                        aria-label={`Open ledger for ${org.organizationName}`}
                      >
                        Ledger
                      </ButtonLink>
                      <ButtonLink
                        href={`/reports?org=${encodeURIComponent(org.organizationSlug)}`}
                        variant="success"
                        className="px-3 text-xs min-h-[36px]"
                        aria-label={`Open reports for ${org.organizationName}`}
                      >
                        Reports
                      </ButtonLink>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
