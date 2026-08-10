import type { ReportPackageDto } from "@/lib/data/reports";
import { formatReportDate } from "@/lib/reports/report-layout";
import { PkmLogo } from "@/components/branding/pkm-logo";

export function ReportMasthead({
  report,
  title,
  sectionLabel,
  compact = false,
}: {
  report: ReportPackageDto;
  title: string;
  sectionLabel?: string;
  compact?: boolean;
}) {
  return (
    <div className={`report-masthead border-b border-slate-200 pb-6 text-center ${compact ? "report-masthead-compact" : ""}`}>
      <PkmLogo size={compact ? 64 : 80} className={`mx-auto ${compact ? "h-16 w-16" : "h-20 w-20"}`} />
      <p className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">
        Pambayang Kolehiyo ng Mauban
      </p>
      <h1 className="mt-1 text-xl font-black uppercase tracking-tight text-slate-950 sm:text-2xl">
        {report.organizationName}
      </h1>
      <h2 className="mt-1 text-base font-extrabold uppercase tracking-wide text-slate-800 sm:text-lg">
        {title}
      </h2>
      {sectionLabel && <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-[#004aad]">{sectionLabel}</p>}
      <p className="mt-2 text-xs font-semibold text-slate-600 sm:text-sm">
        {report.academicYear} <span aria-hidden="true">&bull;</span> {report.semesterLabel}
      </p>
      <p className="text-[11px] text-slate-500">As of {formatReportDate(report.asOfDate)}</p>
    </div>
  );
}
