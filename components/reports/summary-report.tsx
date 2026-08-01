import type { ReportPackageDto } from "@/lib/data/reports";
import { formatPesoFromCents } from "@/lib/data/money";

interface SummaryReportProps {
  report: ReportPackageDto;
}

export function SummaryReport({ report }: SummaryReportProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-8 text-slate-900 print:border-none print:shadow-none print:p-0 print:m-0">
      {/* Header */}
      <div className="text-center space-y-1 border-b pb-6">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">
          Pambayang Kolehiyo ng Mauban
        </p>
        <h1 className="text-2xl font-black tracking-tight text-[#004aad]">
          {report.organizationName}
        </h1>
        <h2 className="text-lg font-bold text-slate-800">
          Financial Summary Report
        </h2>
        <p className="text-sm text-slate-600 font-medium">
          {report.academicYear} &bull; {report.semesterLabel}
        </p>
        <p className="text-xs text-slate-500">
          As of {report.asOfDate.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Financial Table */}
      <div className="space-y-6 text-sm">
        {/* I. Balance Forwarded */}
        <div>
          <h3 className="font-bold text-slate-800 uppercase tracking-wider text-xs bg-slate-100 px-3 py-1.5 rounded">
            I. Balance Forwarded (Opening Balance)
          </h3>
          <table className="w-full mt-2 border-collapse">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2 pl-4 text-slate-700">Cash on Hand</td>
                <td className="py-2 pr-4 text-right font-mono font-semibold">
                  {formatPesoFromCents(report.openingCashOnHandCents)}
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 pl-4 text-slate-700">Cash in Bank</td>
                <td className="py-2 pr-4 text-right font-mono font-semibold">
                  {formatPesoFromCents(report.openingCashInBankCents)}
                </td>
              </tr>
              <tr className="bg-slate-50 font-bold border-t border-slate-200">
                <td className="py-2 pl-4">Total Balance Forwarded</td>
                <td className="py-2 pr-4 text-right font-mono text-[#004aad]">
                  {formatPesoFromCents(report.balanceForwardedCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* II. Collections */}
        <div>
          <h3 className="font-bold text-slate-800 uppercase tracking-wider text-xs bg-slate-100 px-3 py-1.5 rounded">
            II. Add: Collections (Income)
          </h3>
          {report.collectionGroups.length === 0 ? (
            <p className="py-3 pl-4 text-xs italic text-slate-500">No collections recorded for this term.</p>
          ) : (
            <table className="w-full mt-2 border-collapse">
              <tbody>
                {report.collectionGroups.map((group) => (
                  <tr key={group.categoryId} className="border-b border-slate-100">
                    <td className="py-2 pl-4 text-slate-700">{group.categoryName}</td>
                    <td className="py-2 pr-4 text-right font-mono font-semibold">
                      {formatPesoFromCents(group.totalCents)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-emerald-50/50 font-bold border-t border-slate-200">
                  <td className="py-2 pl-4 text-emerald-900">Total Collections</td>
                  <td className="py-2 pr-4 text-right font-mono text-emerald-700">
                    {formatPesoFromCents(report.totalIncomeCents)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* III. Total Cash Available */}
        <div className="bg-blue-50/60 p-4 rounded-lg border border-blue-100 flex items-center justify-between font-bold text-base">
          <span className="text-[#004aad]">III. Total Cash Available</span>
          <span className="font-mono text-[#004aad]">
            {formatPesoFromCents(report.totalCashAvailableCents)}
          </span>
        </div>

        {/* IV. Expenses */}
        <div>
          <h3 className="font-bold text-slate-800 uppercase tracking-wider text-xs bg-slate-100 px-3 py-1.5 rounded">
            IV. Less: Total Expenses (Schedule 2)
          </h3>
          <table className="w-full mt-2 border-collapse">
            <tbody>
              <tr className="bg-red-50/50 font-bold border-t border-slate-200">
                <td className="py-2 pl-4 text-red-900">Total Operating Expenses</td>
                <td className="py-2 pr-4 text-right font-mono text-red-700">
                  {formatPesoFromCents(report.totalExpenseCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* V. Ending Balance */}
        <div>
          <h3 className="font-bold text-slate-800 uppercase tracking-wider text-xs bg-slate-100 px-3 py-1.5 rounded">
            V. Ending Balance Summary
          </h3>
          <table className="w-full mt-2 border-collapse">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2 pl-4 text-slate-700">Ending Cash on Hand</td>
                <td className="py-2 pr-4 text-right font-mono font-semibold">
                  {formatPesoFromCents(report.endingCashOnHandCents)}
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2 pl-4 text-slate-700">Ending Cash in Bank</td>
                <td className="py-2 pr-4 text-right font-mono font-semibold">
                  {formatPesoFromCents(report.endingCashInBankCents)}
                </td>
              </tr>
              <tr className="bg-slate-900 text-white font-extrabold text-base border-t border-slate-900">
                <td className="py-3 pl-4">Net Remaining Balance</td>
                <td className="py-3 pr-4 text-right font-mono text-[#f9d818]">
                  {formatPesoFromCents(report.endingBalanceCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Signature Section - 4 Signatures */}
      <div className="pt-10 border-t space-y-12">
        <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs text-center">
          Signatures & Verification
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center text-xs">
          <div className="space-y-8">
            <p className="text-slate-500 font-semibold">Prepared by:</p>
            <div className="border-b border-slate-400 pb-1">
              <p className="font-bold text-slate-900 uppercase tracking-wide">____________________</p>
              <p className="text-slate-600 font-medium">{report.signatories.treasurerTitle}</p>
            </div>
          </div>

          <div className="space-y-8">
            <p className="text-slate-500 font-semibold">Certified Correct:</p>
            <div className="border-b border-slate-400 pb-1">
              <p className="font-bold text-slate-900 uppercase tracking-wide">____________________</p>
              <p className="text-slate-600 font-medium">{report.signatories.auditorTitle}</p>
            </div>
          </div>

          <div className="space-y-8">
            <p className="text-slate-500 font-semibold">Approved by:</p>
            <div className="border-b border-slate-400 pb-1">
              <p className="font-bold text-slate-900 uppercase tracking-wide">____________________</p>
              <p className="text-slate-600 font-medium">{report.signatories.adviserTitle}</p>
            </div>
          </div>

          <div className="space-y-8">
            <p className="text-slate-500 font-semibold">Noted by / Approved by:</p>
            <div className="border-b border-slate-400 pb-1">
              <p className="font-bold text-slate-900 uppercase tracking-wide">____________________</p>
              <p className="text-slate-600 font-medium">{report.signatories.presidentOsaTitle}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
