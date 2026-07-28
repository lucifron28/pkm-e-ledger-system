import type { ReportPackageDto } from "@/lib/data/reports";
import { formatPesoFromCents } from "@/lib/data/money";

interface Schedule2ExpensesProps {
  report: ReportPackageDto;
}

export function Schedule2Expenses({ report }: Schedule2ExpensesProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-6 text-slate-900 print:border-none print:shadow-none print:p-0 print:m-0">
      {/* Header */}
      <div className="text-center space-y-1 border-b pb-6">
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
          Schedule 2 — Expense Schedule
        </h2>
        <p className="text-sm text-slate-600 font-semibold">
          {report.organizationName} &bull; {report.academicYear} {report.semesterLabel}
        </p>
      </div>

      {report.expenseRows.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm italic border rounded-lg">
          No operating expense entries recorded for this academic term.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase tracking-wider border-b-2 border-slate-300">
              <tr>
                <th className="px-2.5 py-2 text-left whitespace-nowrap">Doc No.</th>
                <th className="px-2.5 py-2 text-left whitespace-nowrap">Date</th>
                <th className="px-2.5 py-2 text-left whitespace-nowrap">Payee Name</th>
                <th className="px-2.5 py-2 text-left min-w-[140px]">Particulars</th>
                <th className="px-2.5 py-2 text-right whitespace-nowrap bg-red-100 text-red-900">Total Amount</th>
                {report.expenseCategories.map((cat) => (
                  <th key={cat.categoryId} className="px-2.5 py-2 text-right whitespace-nowrap min-w-[90px]">
                    {cat.categoryName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {report.expenseRows.map((row) => (
                <tr key={row.transactionId} className="hover:bg-slate-50">
                  <td className="px-2.5 py-2 font-mono text-slate-600 whitespace-nowrap">
                    {row.documentNumber || "—"}
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap text-slate-700">
                    {row.transactionDate.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                  </td>
                  <td className="px-2.5 py-2 font-semibold text-slate-900 whitespace-nowrap">
                    {row.payeeName}
                  </td>
                  <td className="px-2.5 py-2 text-slate-600">
                    <div>{row.description}</div>
                    {row.referenceDescription && (
                      <div className="text-[11px] text-slate-500 italic">{row.referenceDescription}</div>
                    )}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono font-bold text-red-700 bg-red-50/50 whitespace-nowrap">
                    {formatPesoFromCents(row.amountCents)}
                  </td>
                  {report.expenseCategories.map((cat) => {
                    const bucketAmt = row.categoryBucketCents[cat.categoryId] || 0;
                    return (
                      <td key={cat.categoryId} className="px-2.5 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                        {bucketAmt > 0 ? formatPesoFromCents(bucketAmt) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Totals Row */}
              <tr className="bg-slate-900 text-white font-extrabold border-t-2 border-slate-900">
                <td colSpan={4} className="px-2.5 py-3 text-right uppercase tracking-wider text-xs text-[#f9d818]">
                  Total Expenses:
                </td>
                <td className="px-2.5 py-3 text-right font-mono text-red-300 bg-slate-800 text-sm whitespace-nowrap">
                  {formatPesoFromCents(report.totalExpenseCents)}
                </td>
                {report.expenseCategories.map((cat) => (
                  <td key={cat.categoryId} className="px-2.5 py-3 text-right font-mono text-[#f9d818] whitespace-nowrap">
                    {formatPesoFromCents(cat.totalCents)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
