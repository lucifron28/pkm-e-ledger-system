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
        <h1 className="text-2xl font-extrabold text-slate-900">Treasurer Log</h1>
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 text-center">
          <p className="font-semibold text-amber-800">You are not assigned to an organization.</p>
        </div>
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
        <h1 className="text-2xl font-extrabold text-slate-900">Treasurer Log</h1>
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 text-center">
          <p className="font-semibold text-amber-800">Invalid audit-log filter or expired pagination cursor. Check action, dates, actor, cursor, or page size.</p>
        </div>
      </div>
    );
  }
  const logs = page.logs;

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      action,
      dateFrom,
      dateTo,
      actorUserId,
      pageSize: pageSize !== 50 ? String(pageSize) : undefined,
      ...overrides,
    };
    for (const [key, val] of Object.entries(merged)) {
      if (val && val.trim().length > 0) params.set(key, val.trim());
    }
    const query = params.toString();
    return `/audit-log${query ? `?${query}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Treasurer Log</h1>
          <p className="text-sm text-slate-600">
            Organization-scoped audit history for {user.organizationName}
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-[#004aad] font-semibold hover:underline">
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Filters */}
      <form method="GET" action="/audit-log" className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1" htmlFor="action-filter">
            Action
          </label>
          <select id="action-filter" name="action" defaultValue={action || ""} className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
            <option value="">All Actions</option>
            {Object.values(AuditAction).map((a) => (
              <option key={a} value={a}>{AUDIT_ACTION_LABELS[a] || a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1" htmlFor="actor-filter">
            Actor User
          </label>
          <select id="actor-filter" name="actorUserId" defaultValue={actorUserId || ""} className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
            <option value="">All Users</option>
            {orgUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName} ({u.username})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1" htmlFor="date-from">
            Date From
          </label>
          <input id="date-from" type="date" name="dateFrom" defaultValue={dateFrom || ""} className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1" htmlFor="date-to">
            Date To
          </label>
          <input id="date-to" type="date" name="dateTo" defaultValue={dateTo || ""} className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition flex-1">
            Apply Filters
          </button>
          <Link href="/audit-log" className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs transition text-center flex-1">
            Clear
          </Link>
        </div>
      </form>

      {logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center text-sm text-slate-500">
          No audit entries found for this organization.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm">Audit Log Entries — showing {logs.length} entries on this page</h2>
            <div className="flex items-center gap-3 text-xs">
              <Link href="/audit-log" className="text-[#004aad] font-bold hover:underline">First Page</Link>
              {page.pagination.hasMore && (
                <Link href={buildUrl({ cursor: page.pagination.nextCursor || undefined })} className="text-[#004aad] font-bold hover:underline">Next Page &rarr;</Link>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-bold">
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
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{log.role || "—"}</td>
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
