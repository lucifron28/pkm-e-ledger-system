import { requireManagementUser } from "@/lib/auth/require-auth";
import { AUDIT_ACTION_LABELS, formatHumanReadableSummary, listAuditLogsForCurrentOrganization, listOrganizationUsers } from "@/lib/data/audit-log";
import {
  hasScalarValue,
  parseDateRangeParams,
  parsePageSize,
  parseScalarString,
} from "@/lib/domain/query";
import Link from "next/link";
import { AuditAction } from "@prisma/client";
import { Button, ButtonLink, PageHeader, StatusPanel } from "@/components/ui/patterns";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireManagementUser();
  const rawParams = await searchParams;

  const actionRaw = parseScalarString(rawParams.action);
  const action = Object.values(AuditAction).includes(actionRaw as AuditAction)
    ? (actionRaw as AuditAction)
    : undefined;
  const dateQuery = parseDateRangeParams(rawParams);
  const dateFrom = dateQuery.dateFrom;
  const dateTo = dateQuery.dateTo;
  const actorUserId = parseScalarString(rawParams.actorUserId);
  const cursor = parseScalarString(rawParams.cursor);
  const pageSizeInput = rawParams.pageSize;
  const pageSizeString = parseScalarString(pageSizeInput);
  const pageSize = parsePageSize(pageSizeInput, 50, 100);
  const invalidQuery =
    (hasScalarValue(rawParams.action) && (!actionRaw || !action)) ||
    dateQuery.invalidDateRange ||
    (hasScalarValue(rawParams.actorUserId) && !actorUserId) ||
    (hasScalarValue(rawParams.cursor) && !cursor) ||
    (hasScalarValue(pageSizeInput) && (!pageSizeString || !/^\d+$/.test(pageSizeString) || Number(pageSizeString) <= 0 || Number(pageSizeString) > 100));

  if (!user.organizationId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Audit" title="Treasurer log" description="Organization-scoped history of financial and account changes." />
        <StatusPanel title="Organization assignment required"><p>You are not assigned to an organization.</p></StatusPanel>
      </div>
    );
  }

  const [page, orgUsers] = await Promise.all([
    listAuditLogsForCurrentOrganization({
      action,
      dateFrom,
      dateTo,
      actorUserId,
      cursor,
      pageSize,
    }),
    listOrganizationUsers(user.organizationId),
  ]);

  if (invalidQuery || page.invalidCursor) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Audit" title="Treasurer log" description="Organization-scoped history of financial and account changes." />
        <StatusPanel title="Invalid audit filter"><p>Check action, dates, actor, cursor, or page size.</p></StatusPanel>
      </div>
    );
  }
  const logs = page.logs;

  const currentCursor = cursor;
  const hasCursor = Boolean(currentCursor);

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      action,
      dateFrom,
      dateTo,
      actorUserId,
      pageSize: pageSize !== 50 ? String(pageSize) : undefined,
      cursor,
      ...overrides,
    };
    const hasFilterOverride = Object.keys(overrides).some(
      (key) => key !== "cursor"
    );
    if (hasFilterOverride) {
      if (!("cursor" in overrides)) merged.cursor = undefined;
    }

    for (const [key, val] of Object.entries(merged)) {
      if (val && val.trim().length > 0) params.set(key, val.trim());
    }
    const query = params.toString();
    return `/audit-log${query ? `?${query}` : ""}`;
  };

  const firstPageUrl = buildUrl({ cursor: undefined });

  const prevPageUrl = page.pagination.previousCursor
    ? buildUrl({ cursor: page.pagination.previousCursor })
    : null;

  const nextPageUrl = page.pagination.nextCursor
    ? buildUrl({ cursor: page.pagination.nextCursor })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Audit" title="Treasurer log" description={`Organization-scoped audit history for ${user.organizationName}.`} backHref="/dashboard" backLabel="Back to dashboard" />

      {/* Filters */}
      <form method="GET" action="/audit-log" className="ui-panel ui-panel-body grid grid-cols-1 items-end gap-4 sm:grid-cols-2 md:grid-cols-5">
        <div>
          <label className="ui-label" htmlFor="action-filter">Action</label>
          <select id="action-filter" name="action" defaultValue={action || ""} className="ui-select">
            <option value="">All actions</option>
            {Object.values(AuditAction).map((a) => (
              <option key={a} value={a}>{AUDIT_ACTION_LABELS[a] || a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="ui-label" htmlFor="actor-filter">Actor user</label>
          <select id="actor-filter" name="actorUserId" defaultValue={actorUserId || ""} className="ui-select">
            <option value="">All users</option>
            {orgUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName} ({u.username})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="ui-label" htmlFor="date-from">Date from</label>
          <input id="date-from" type="date" name="dateFrom" defaultValue={dateFrom || ""} className="ui-input" />
        </div>
        <div>
          <label className="ui-label" htmlFor="date-to">Date to</label>
          <input id="date-to" type="date" name="dateTo" defaultValue={dateTo || ""} className="ui-input" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1 text-xs">Apply filters</Button>
          <ButtonLink href="/audit-log" variant="secondary" className="flex-1 text-xs">Clear</ButtonLink>
        </div>
      </form>

      {logs.length === 0 ? (
        <StatusPanel title="No audit entries found"><p>No audit entries were found for this organization.</p></StatusPanel>
      ) : (
        <div className="ui-panel">
          <div className="ui-panel-header">
            <h2 className="ui-panel-title">Audit log entries - showing {logs.length} on this page</h2>
            <div className="flex items-center gap-3 text-xs font-bold">
              {hasCursor && (
                <Link href={firstPageUrl} className="text-[#004aad] hover:underline">&laquo; First Page</Link>
              )}
              {prevPageUrl && (
                <Link href={prevPageUrl} className="text-[#004aad] hover:underline">&lsaquo; Previous Page</Link>
              )}
              {nextPageUrl && (
                <Link href={nextPageUrl} className="text-[#004aad] hover:underline">Next Page &rsaquo;</Link>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="ui-data-table min-w-[760px]">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">Timestamp</th>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Summary & Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {log.createdAt.toLocaleString("en-PH", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-900">
                      {AUDIT_ACTION_LABELS[log.action] || log.action}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {log.fullName || log.username || log.userId || "System"}
                      {log.username && <div className="text-xs text-slate-500">{log.username}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{log.role || "-"}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      <div className="font-semibold text-slate-900 mb-1">
                        {formatHumanReadableSummary(log)}
                      </div>
                      {log.metadataJson && (
                        <details className="cursor-pointer mt-1">
                          <summary className="text-[11px] font-medium text-slate-500 hover:text-[#004aad] underline decoration-dotted">
                            Technical Payload ({log.entityType || "Audit"})
                          </summary>
                          <pre className="mt-1.5 bg-slate-50 p-2.5 rounded border border-slate-200 font-mono text-[11px] text-slate-800 whitespace-pre-wrap max-w-lg">
                            {log.metadataJson}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
