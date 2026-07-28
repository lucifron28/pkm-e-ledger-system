"use client";

import { useRouter } from "next/navigation";
import type { Semester } from "@prisma/client";

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
    const selected = terms.find((t) => t.id === termId);
    if (selected) {
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set("academicYear", selected.academicYear);
      searchParams.set("semester", selected.semester);
      router.push(`/reports?${searchParams.toString()}`);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
      {/* Term Selector */}
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 whitespace-nowrap">
          Academic Term:
        </label>
        <select
          value={currentTermId}
          onChange={(e) => handleTermChange(e.target.value)}
          className="px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#004aad] w-full sm:w-auto"
        >
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.academicYear} &mdash; {t.semester === "FIRST_SEMESTER" ? "1st Semester" : t.semester === "SECOND_SEMESTER" ? "2nd Semester" : "Summer"} {t.active ? "(Active)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Action Buttons (Visible only if canExport is true) */}
      {canExport && (
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-lg text-sm shadow transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Report Package
          </button>

          <a
            href={`/api/reports/${currentTermId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-4 py-2 rounded-lg text-sm shadow transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export PDF
          </a>

          <a
            href={`/api/reports/${currentTermId}/excel`}
            download
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-lg text-sm shadow transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Excel
          </a>
        </div>
      )}
    </div>
  );
}
