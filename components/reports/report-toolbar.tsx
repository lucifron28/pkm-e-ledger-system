"use client";

import { useRouter } from "next/navigation";
import type { Semester } from "@prisma/client";
import {
  IconCalendar,
  IconFileSpreadsheet,
  IconFileTypePdf,
  IconPrinter,
} from "@tabler/icons-react";
import { ButtonLink } from "@/components/ui/patterns";

interface TermOption {
  id: string;
  academicYear: string;
  semester: Semester;
  active: boolean;
}

interface ReportToolbarProps {
  terms: TermOption[];
  currentTermId: string;
  canExport?: boolean;
}

export function ReportToolbar({ terms, currentTermId, canExport = true }: ReportToolbarProps) {
  const router = useRouter();

  function handleTermChange(termId: string) {
    const selected = terms.find((term) => term.id === termId);
    if (!selected) return;

    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("academicYear", selected.academicYear);
    searchParams.set("semester", selected.semester);
    router.push(`/reports?${searchParams.toString()}`);
  }

  return (
    <div className="ui-report-toolbar print:hidden" aria-label="Report controls">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <IconCalendar size={18} className="shrink-0 text-[#004aad]" aria-hidden="true" />
        <div className="min-w-0 flex-1 sm:flex-none">
          <label htmlFor="report-term-select" className="ui-label mb-1">Academic term</label>
          <select
            id="report-term-select"
            value={currentTermId}
            onChange={(event) => handleTermChange(event.target.value)}
            className="ui-select min-w-0 sm:min-w-[16rem]"
          >
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.academicYear} - {term.semester === "FIRST_SEMESTER" ? "1st Semester" : term.semester === "SECOND_SEMESTER" ? "2nd Semester" : "Summer"} {term.active ? "(Active)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canExport && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <button type="button" onClick={() => window.print()} className="ui-button ui-button-dark" aria-label="Print report package">
            <IconPrinter size={17} aria-hidden="true" />
            <span>Print</span>
          </button>
          <ButtonLink href={`/api/reports/${currentTermId}/pdf`} target="_blank" rel="noopener noreferrer" className="ui-button ui-button-primary" aria-label="Export report package as PDF">
            <IconFileTypePdf size={17} aria-hidden="true" />
            <span>PDF</span>
          </ButtonLink>
          <ButtonLink href={`/api/reports/${currentTermId}/excel`} download className="ui-button ui-button-success" aria-label="Export report package as Excel workbook">
            <IconFileSpreadsheet size={17} aria-hidden="true" />
            <span>Excel</span>
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
