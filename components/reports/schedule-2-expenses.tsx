import type { ReportPackageDto } from "@/lib/data/reports";
import { formatPesoFromCents } from "@/lib/data/money";
import { formatReportDate, getReportExpenseColumns } from "@/lib/reports/report-layout";

interface Schedule2ExpensesProps {
  report: ReportPackageDto;
}

export function Schedule2Expenses({ report }: Schedule2ExpensesProps) {
  const expenseColumns = getReportExpenseColumns(report.expenseCategories);

  return (
    <div className="report-page report-schedule-2 bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-6 text-slate-900 print:border-none print:shadow-none print:p-0 print:m-0">
      <div className="text-center space-y-1 border-b pb-6">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">
          Pambayang Kolehiyo ng Mauban
        </p>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
          Summary of Expenses
        </h2>
        <p className="text-sm uppercase font-bold text-[#004aad]">Schedule 2</p>
        <p className="text-sm text-slate-600 font-semibold">
          {report.organizationName} &bull; {report.academicYear} {report.semesterLabel}
        </p>
        <p className="text-xs text-slate-500">As of {formatReportDate(report.asOfDate)}</p>
      </div>

      {report.expenseRows.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm italic border rounded-lg">
          No operating expense entries recorded for this academic term.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="report-table report-table-landscape w-full text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase tracking-wider border-b-2 border-slate-300">
              <tr>
                <th className="border border-slate-300 px-2 py-2 text-left whitespace-nowrap">Doc No.</th>
                <th className="border border-slate-300 px-2 py-2 text-left whitespace-nowrap">Date</th>
                <th className="border border-slate-300 px-2 py-2 text-left whitespace-nowrap">Payee</th>
                <th className="border border-slate-300 px-2 py-2 text-left min-w-[120px]">Particulars</th>
                <th className="border border-slate-300 px-2 py-2 text-right whitespace-nowrap bg-slate-200">Amount</th>
                {expenseColumns.map((category) => (
                  <th key={category.key} className="border border-slate-300 px-2 py-2 text-right whitespace-nowrap min-w-[72px]">
                    {category.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.expenseRows.map((row) => (
                <tr key={row.transactionId} className="break-inside-avoid">
                  <td className="border border-slate-300 px-2 py-2 font-mono text-slate-600 whitespace-nowrap">
                    {row.documentNumber || ""}
                  </td>
                  <td className="border border-slate-300 px-2 py-2 whitespace-nowrap text-slate-700">
                    {formatReportDate(row.transactionDate)}
                  </td>
                  <td className="border border-slate-300 px-2 py-2 font-semibold text-slate-900 whitespace-nowrap">
                    {row.payeeName}
                  </td>
                  <td className="border border-slate-300 px-2 py-2 text-slate-600">
                    {row.description}
                  </td>
                  <td className="border border-slate-300 px-2 py-2 text-right font-mono font-bold text-slate-900 bg-slate-50 whitespace-nowrap">
                    {formatPesoFromCents(row.amountCents)}
                  </td>
                  {expenseColumns.map((category) => {
                    const bucketAmount = row.categoryBucketCents[category.key] || 0;
                    return (
                      <td key={category.key} className="border border-slate-300 px-2 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                        {bucketAmount > 0 ? formatPesoFromCents(bucketAmount) : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}

              <tr className="bg-slate-50 font-extrabold border-t-2 border-slate-900">
                <td colSpan={4} className="border border-slate-300 px-2 py-3 text-right uppercase tracking-wider text-xs">
                  Total Expenses
                </td>
                <td className="border border-slate-300 px-2 py-3 text-right font-mono text-slate-900 whitespace-nowrap">
                  {formatPesoFromCents(report.totalExpenseCents)}
                </td>
                {expenseColumns.map((category) => (
                  <td key={category.key} className="border border-slate-300 px-2 py-3 text-right font-mono text-slate-900 whitespace-nowrap">
                    {formatPesoFromCents(category.totalCents)}
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
