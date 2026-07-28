import type { ReportPackageDto } from "@/lib/data/reports";

interface AttachmentReferencesProps {
  report: ReportPackageDto;
}

export function AttachmentReferences({ report }: AttachmentReferencesProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-6 text-slate-900 print:border-none print:shadow-none print:p-0 print:m-0">
      {/* Header */}
      <div className="text-center space-y-1 border-b pb-6">
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
          Supporting Receipts & Attachments Reference
        </h2>
        <p className="text-sm text-slate-600 font-semibold">
          {report.organizationName} &bull; {report.academicYear} {report.semesterLabel}
        </p>
      </div>

      {report.attachments.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm italic border rounded-lg">
          No receipt attachments associated with transactions in this report package.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Doc No.</th>
                <th className="px-3 py-2 text-left">Transaction Description</th>
                <th className="px-3 py-2 text-left">Original File Name</th>
                <th className="px-3 py-2 text-left">File Type</th>
                <th className="px-3 py-2 text-right">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.attachments.map((att, idx) => (
                <tr key={`${att.transactionId}-${idx}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                    {att.transactionDate.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                    {att.documentNumber || "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-900 font-medium">
                    {att.description}
                  </td>
                  <td className="px-3 py-2 text-slate-800 font-mono">
                    {att.originalName}
                  </td>
                  <td className="px-3 py-2 text-slate-600 uppercase text-[11px]">
                    {att.mimeType.split("/")[1] || att.mimeType}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {(att.sizeBytes / 1024).toFixed(1)} KB
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
