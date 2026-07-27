import { requireManagementUser } from "@/lib/auth/require-auth";
import { listAuditLogsForCurrentOrganization } from "@/lib/data/audit-log";
import Link from "next/link";

export default async function AuditLogPage() {
  const user = await requireManagementUser();
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

  const logs = await listAuditLogsForCurrentOrganization();

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

      {logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center text-sm text-slate-500">
          No audit entries found for this organization.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <tr>
                  <th className="px-4 py-3 text-left">Timestamp</th>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Organization</th>
                  <th className="px-4 py-3 text-left">Entity</th>
                  <th className="px-4 py-3 text-left">Metadata</th>
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
                      {log.action}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {log.fullName || log.username || log.userId || "System"}
                      {log.username && <div className="text-xs text-slate-500">{log.username}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{log.role || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{log.organizationName || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {log.entityType || "—"}
                      {log.entityId && <div className="text-xs text-slate-500 font-mono">{log.entityId}</div>}
                    </td>
                    <td className="px-4 py-3 max-w-sm text-xs text-slate-600 break-words">
                      {log.metadataJson || "—"}
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
