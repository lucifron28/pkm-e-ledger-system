import { requireManagementUser } from "@/lib/auth/require-auth";
import { listDeletedTransactionsForAudit } from "@/lib/data/transactions";
import { formatPesoFromCents } from "@/lib/data/money";
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

  const deletedTxs = await listDeletedTransactionsForAudit(50);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Treasurer Log</h1>
          <p className="text-sm text-slate-600">
            Deleted transaction records for {user.organizationName}
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-[#004aad] font-semibold hover:underline">
          &larr; Back to Dashboard
        </Link>
      </div>

      {deletedTxs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center text-sm text-slate-500">
          No deleted transactions found. Soft-deleted transactions will appear here with their deletion reason.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <tr>
                  <th className="px-4 py-3 text-left">Deleted At</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">Deletion Reason</th>
                  <th className="px-4 py-3 text-left">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deletedTxs.map((tx) => (
                  <tr key={tx.id} className="bg-red-50/30">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {tx.deletedAt?.toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {tx.transactionDate.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${tx.type === "INCOME" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                        {tx.type === "INCOME" ? "Income" : "Expense"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{tx.categoryName}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-slate-700">{tx.description}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                      {formatPesoFromCents(tx.amountCents)}
                    </td>
                    <td className="px-4 py-3 max-w-xs text-red-700 text-xs">{tx.deleteReason}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 text-xs">{tx.recordedByFullName}</td>
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
