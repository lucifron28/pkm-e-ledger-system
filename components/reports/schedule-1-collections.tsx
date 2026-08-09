import type { ReportPackageDto } from "@/lib/data/reports";
import { formatPesoFromCents } from "@/lib/data/money";
import { formatReportDate } from "@/lib/reports/report-layout";

interface Schedule1CollectionsProps {
  report: ReportPackageDto;
}

export function Schedule1Collections({ report }: Schedule1CollectionsProps) {
  return (
    <div className="report-page report-schedule-1 bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-6 text-slate-900 print:border-none print:shadow-none print:p-0 print:m-0">
      <div className="text-center space-y-1 border-b pb-6">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">
          Pambayang Kolehiyo ng Mauban
        </p>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
          Summary of Collections
        </h2>
        <p className="text-sm uppercase font-bold text-[#004aad]">Schedule 1</p>
        <p className="text-sm text-slate-600 font-semibold">
          {report.organizationName} &bull; {report.academicYear} {report.semesterLabel}
        </p>
        <p className="text-xs text-slate-500">As of {formatReportDate(report.asOfDate)}</p>
      </div>

      {report.collectionGroups.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm italic border rounded-lg">
          No collection entries recorded for this academic term.
        </div>
      ) : (
        <div className="space-y-8 text-sm">
          {report.collectionGroups.map((group) => (
            <div key={group.categoryId} className="report-group space-y-3 break-inside-avoid">
              <div className="border-b-2 border-[#004aad] pb-1.5">
                <h3 className="font-extrabold text-[#004aad] text-sm uppercase tracking-wide">
                  {group.categoryName}
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="report-table w-full text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="border border-slate-300 px-3 py-2 text-center w-20">Sequence number</th>
                      <th className="border border-slate-300 px-3 py-2 text-left">Payor / Source Name</th>
                      <th className="border border-slate-300 px-3 py-2 text-right w-36">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.transactionId} className="break-inside-avoid">
                        <td className="border border-slate-300 px-3 py-2 text-center text-slate-500 font-mono">
                          {item.sequenceNumber}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-900">
                          {item.payorName}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 text-right font-mono font-bold text-slate-900">
                          {formatPesoFromCents(item.amountCents)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={2} className="border border-slate-300 px-3 py-2 text-right uppercase tracking-wider text-slate-600 text-[11px]">
                        Total per schedule
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right font-mono text-emerald-700">
                        {formatPesoFromCents(group.totalCents)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="border-t-2 border-slate-900 pt-3 flex items-center justify-between font-extrabold text-base break-inside-avoid">
            <span className="uppercase tracking-wide text-xs">Total collections</span>
            <span className="font-mono text-[#004aad] text-lg">
              {formatPesoFromCents(report.totalIncomeCents)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
