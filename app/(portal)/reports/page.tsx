import { requireManagementUser } from "@/lib/auth/require-auth";
import { getReportPackageForCurrentUser } from "@/lib/data/reports";
import { listTermsForLedger } from "@/lib/data/transactions";
import { Semester } from "@prisma/client";
import { SummaryReport } from "@/components/reports/summary-report";
import { Schedule1Collections } from "@/components/reports/schedule-1-collections";
import { Schedule2Expenses } from "@/components/reports/schedule-2-expenses";
import { AttachmentReferences } from "@/components/reports/attachment-references";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import Link from "next/link";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Financial Reports</h1>
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 text-center">
          <p className="font-semibold text-amber-800">You are not assigned to an organization.</p>
        </div>
      </div>
    );
  }

  const params = await searchParams;

  let academicYear: string | undefined = undefined;
  if (typeof params.academicYear === "string" && params.academicYear.trim().length > 0) {
    academicYear = params.academicYear.trim();
  }

  let semester: Semester | undefined = undefined;
  if (
    typeof params.semester === "string" &&
    Object.values(Semester).includes(params.semester.trim() as Semester)
  ) {
    semester = params.semester.trim() as Semester;
  }

  const terms = await listTermsForLedger();
  const report = await getReportPackageForCurrentUser(academicYear, semester);

  if (!report || terms.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Financial Reports</h1>
        <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-8 rounded-xl text-center space-y-3">
          <h2 className="text-lg font-bold text-amber-900">No Financial Data Available</h2>
          <p className="text-sm text-amber-700">Please set up an active academic term and record transactions first.</p>
          <Link href="/ledger" className="inline-block bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow transition text-sm">
            Go to Digital Ledger
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Embedded Print CSS */}
      <style>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 0.5in;
          }
          @page landscape-section {
            size: letter landscape;
            margin: 0.5in;
          }
          .print-portrait {
            page-break-after: always;
            break-after: page;
          }
          .print-landscape {
            page: landscape-section;
            page-break-before: always;
            page-break-after: always;
            break-before: page;
            break-after: page;
          }
        }
      `}</style>

      {/* Title & Navigation (Hidden on Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Financial Report Package</h1>
          <p className="text-sm text-slate-600">
            {report.organizationName} &bull; {report.academicYear} {report.semesterLabel}
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-[#004aad] font-semibold hover:underline">
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Toolbar & Actions */}
      <ReportToolbar terms={terms} currentTermId={report.termId} />

      {/* Printable Report Package */}
      <div className="space-y-8 print:space-y-0 print:m-0 print:p-0">
        {/* Section 1: Summary Report (Portrait) */}
        <section className="print-portrait">
          <SummaryReport report={report} />
        </section>

        {/* Section 2: Schedule 1 Collections (Portrait) */}
        <section className="print-portrait">
          <Schedule1Collections report={report} />
        </section>

        {/* Section 3: Schedule 2 Expenses (Landscape) */}
        <section className="print-landscape">
          <Schedule2Expenses report={report} />
        </section>

        {/* Section 4: Attachment References (Portrait) */}
        <section className="print-portrait">
          <AttachmentReferences report={report} />
        </section>
      </div>
    </div>
  );
}
