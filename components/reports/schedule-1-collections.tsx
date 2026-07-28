import type { ReportPackageDto } from "@/lib/data/reports";
import { formatPesoFromCents } from "@/lib/data/money";

interface Schedule1CollectionsProps {
  report: ReportPackageDto;
}

export function Schedule1Collections({ report }: Schedule1CollectionsProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-6 text-slate-900 print:border-none print:shadow-none print:p-0 print:m-0">
      {/* Header */}
      <div className="text-center space-y-1 border-b pb-6">
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
          Schedule 1 — Collections Schedule
        </h2>
        <p className="text-sm text-slate-600 font-semibold">
          {report.organizationName} &bull; {report.academicYear} {report.semesterLabel}
        </p>
      </div>

      {report.collectionGroups.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm italic border rounded-lg">
          No collection entries recorded for this academic term.
        </div>
      ) : (
        <div className="space-y-8 text-sm">
          {report.collectionGroups.map((group) => (
            <div key={group.categoryId} className="space-y-3">
              <div className="flex items-center justify-between border-b-2 border-[#004aad] pb-1.5">
                <h3 className="font-extrabold text-[#004aad] text-sm uppercase tracking-wide">
                  Category: {group.categoryName}
                </h3>
                <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  Subtotal: {formatPesoFromCents(group.totalCents)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 text-left w-12">Seq</th>
                      <th className="px-3 py-2 text-left">Payor / Source Name</th>
                      <th className="px-3 py-2 text-left">Date / Ref / Particulars</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.items.map((item) => (
                      <tr key={item.transactionId} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-500 font-mono">{item.sequenceNumber}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{item.payorName}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {item.transactionDate.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                          {item.documentNumber ? ` (${item.documentNumber})` : ""}
                          <div className="text-[11px] text-slate-500">{item.description}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                          {formatPesoFromCents(item.amountCents)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold border-t">
                      <td colSpan={3} className="px-3 py-2 text-right uppercase tracking-wider text-slate-600 text-[11px]">
                        Category Total ({group.categoryName}):
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-700">
                        {formatPesoFromCents(group.totalCents)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Grand Total */}
          <div className="bg-emerald-50 border-2 border-emerald-200 p-4 rounded-xl flex items-center justify-between font-extrabold text-base">
            <span className="text-emerald-900 uppercase tracking-wide text-xs">
              Overall Total Collections (Schedule 1)
            </span>
            <span className="font-mono text-emerald-800 text-lg">
              {formatPesoFromCents(report.totalIncomeCents)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
