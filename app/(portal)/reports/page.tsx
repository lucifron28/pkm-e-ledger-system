import { requireUser } from "@/lib/auth/require-auth";
import { isManagementRole } from "@/lib/auth/rbac";
import {
  getReportPackageForCurrentUser,
  getReportPackageForOsa,
} from "@/lib/data/reports";
import { listTermsForLedger } from "@/lib/data/transactions";
import {
  listTermsForOsaOrganization,
  validateOsaOrganization,
} from "@/lib/data/osa";
import { Role, Semester } from "@prisma/client";
import { parseOrganizationParam, parseTermSelectionParams } from "@/lib/domain/query";
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
  const user = await requireUser();
  const params = await searchParams;
  const termQuery = parseTermSelectionParams(params);
  const organizationQuery = parseOrganizationParam(params);
  const ayRaw = termQuery.academicYear;
  const semRaw = termQuery.semester;

  const isManagement = isManagementRole(user.role);
  const isOsa = user.role === Role.OSA;

  let report = null;
  let terms: { id: string; academicYear: string; semester: Semester; active: boolean }[] = [];

  if (isOsa) {
    if (termQuery.invalidTermSelection || organizationQuery.invalidOrganization) {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-extrabold text-slate-900">Financial Reports</h1>
          <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-8 rounded-xl text-center space-y-3">
            <h2 className="text-lg font-bold text-amber-900">Invalid Report Filter</h2>
            <p className="text-sm text-amber-700">Check organization and academic term parameters, then try again.</p>
            <Link href="/osa" className="inline-block bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow transition text-sm">
              Go to OSA Overview
            </Link>
          </div>
        </div>
      );
    }
    const orgRaw = organizationQuery.org;
    if (!orgRaw) {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-extrabold text-slate-900">Financial Reports</h1>
          <div className="bg-[#004aad]/5 border-2 border-dashed border-[#004aad]/30 p-8 rounded-xl text-center space-y-3">
            <h2 className="text-lg font-bold text-[#004aad]">Select an Organization</h2>
            <p className="text-sm text-slate-600 max-w-xl mx-auto">
              Please select an active student organization from the OSA Monitoring Overview to inspect financial reports.
            </p>
            <Link href="/osa" className="inline-block bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow transition text-sm">
              Go to OSA Overview
            </Link>
          </div>
        </div>
      );
    }

    const validatedOrg = await validateOsaOrganization(orgRaw);
    if (!validatedOrg) {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-extrabold text-slate-900">Financial Reports</h1>
          <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-8 rounded-xl text-center space-y-3">
            <h2 className="text-lg font-bold text-amber-900">Invalid or Inactive Organization</h2>
            <p className="text-sm text-amber-700">The requested organization parameter is invalid or inactive.</p>
            <Link href="/osa" className="inline-block bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow transition text-sm">
              Go to OSA Overview
            </Link>
          </div>
        </div>
      );
    }

    report = await getReportPackageForOsa(validatedOrg.slug, ayRaw, semRaw);
    terms = await listTermsForOsaOrganization(validatedOrg.slug);
  } else {
    if (termQuery.invalidTermSelection) {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-extrabold text-slate-900">Financial Reports</h1>
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 text-center">
            <p className="font-semibold text-amber-800">Invalid academic term parameter. Choose a complete, valid term.</p>
          </div>
        </div>
      );
    }
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
    report = await getReportPackageForCurrentUser(ayRaw, semRaw);
    terms = await listTermsForLedger();
  }

  if (!report || terms.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Financial Reports</h1>
        <div className="bg-amber-50 border-2 border-dashed border-amber-300 p-8 rounded-xl text-center space-y-3">
          <h2 className="text-lg font-bold text-amber-900">No Financial Data Available</h2>
          <p className="text-sm text-amber-700">No active or historical financial report data is available for this organization.</p>
          {isOsa ? (
            <Link href="/osa" className="inline-block bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow transition text-sm">
              Back to OSA Overview
            </Link>
          ) : isManagement ? (
            <Link href="/ledger" className="inline-block bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow transition text-sm">
              Go to Digital Ledger
            </Link>
          ) : (
            <Link href="/dashboard" className="inline-block bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow transition text-sm">
              Back to Dashboard
            </Link>
          )}
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
          .report-page {
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .report-table thead {
            display: table-header-group;
          }
          .report-table tr,
          .report-group {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .report-schedule-2 {
            min-width: 0;
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
        <Link href={isOsa ? "/osa" : "/dashboard"} className="text-sm text-[#004aad] font-semibold hover:underline">
          &larr; Back to {isOsa ? "OSA Overview" : "Dashboard"}
        </Link>
      </div>

      {/* Toolbar & Actions */}
      <ReportToolbar terms={terms} currentTermId={report.termId} canExport={isManagement} />

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
