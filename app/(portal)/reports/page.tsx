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
import { ButtonLink, PageHeader, StatusPanel } from "@/components/ui/patterns";

function ReportState({
  title,
  description,
  actionHref,
  actionLabel,
  tone = "warning",
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  tone?: "warning" | "brand" | "danger";
}) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Reports" title="Financial reports" description="Review current records using the official report package structure." />
      <StatusPanel
        tone={tone}
        title={title}
        action={actionHref && actionLabel ? <ButtonLink href={actionHref}>{actionLabel}</ButtonLink> : undefined}
      >
        <p>{description}</p>
      </StatusPanel>
    </div>
  );
}

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
        <ReportState
          title="Invalid report filter"
          description="Check organization and academic term parameters, then try again."
          actionHref="/osa"
          actionLabel="Go to OSA overview"
        />
      );
    }

    const orgRaw = organizationQuery.org;
    if (!orgRaw) {
      return (
        <ReportState
          title="Select an organization"
          description="Select an active student organization from the OSA monitoring overview to inspect its financial reports."
          actionHref="/osa"
          actionLabel="Go to OSA overview"
          tone="brand"
        />
      );
    }

    const validatedOrg = await validateOsaOrganization(orgRaw);
    if (!validatedOrg) {
      return (
        <ReportState
          title="Invalid or inactive organization"
          description="The requested organization parameter is invalid or inactive."
          actionHref="/osa"
          actionLabel="Go to OSA overview"
        />
      );
    }

    report = await getReportPackageForOsa(validatedOrg.slug, ayRaw, semRaw);
    terms = await listTermsForOsaOrganization(validatedOrg.slug);
  } else {
    if (termQuery.invalidTermSelection) {
      return <ReportState title="Invalid academic term" description="Choose a complete, valid academic term." />;
    }

    if (!user.organizationId) {
      return <ReportState title="Organization assignment required" description="Your account is not assigned to an organization." />;
    }

    report = await getReportPackageForCurrentUser(ayRaw, semRaw);
    terms = await listTermsForLedger();
  }

  if (!report || terms.length === 0) {
    const actionHref = isOsa ? "/osa" : isManagement ? "/ledger" : "/dashboard";
    const actionLabel = isOsa ? "Back to OSA overview" : isManagement ? "Go to digital ledger" : "Back to dashboard";
    return (
      <ReportState
        title="No financial data available"
        description="No active or historical financial report data is available for this organization."
        actionHref={actionHref}
        actionLabel={actionLabel}
      />
    );
  }

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0.5in; }
          @page landscape-section { size: letter landscape; margin: 0.5in; }
          .print-portrait { page-break-after: always; break-after: page; }
          .print-landscape { page: landscape-section; page-break-before: always; page-break-after: always; break-before: page; break-after: page; }
          .report-page { border: 0 !important; border-radius: 0 !important; box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
          .report-table thead { display: table-header-group; }
          .report-table tr, .report-group { break-inside: avoid; page-break-inside: avoid; }
          .report-schedule-2 { min-width: 0; }
        }
      `}</style>

      <PageHeader
        eyebrow="Official report package"
        title="Financial report package"
        description={`${report.organizationName} - ${report.academicYear} ${report.semesterLabel}`}
        backHref={isOsa ? "/osa" : "/dashboard"}
        backLabel={isOsa ? "Back to OSA overview" : "Back to dashboard"}
      />

      <ReportToolbar terms={terms} currentTermId={report.termId} canExport={isManagement} />

      <div className="space-y-8 print:space-y-0 print:m-0 print:p-0">
        <section className="print-portrait" aria-label="Summary report">
          <SummaryReport report={report} />
        </section>
        <section className="print-portrait" aria-label="Schedule 1 collections">
          <Schedule1Collections report={report} />
        </section>
        <section className="print-landscape" aria-label="Schedule 2 expenses">
          <Schedule2Expenses report={report} />
        </section>
        <section className="print-portrait" aria-label="Receipt and attachment references">
          <AttachmentReferences report={report} />
        </section>
      </div>
    </div>
  );
}
