"use client";

import { useRouter } from "next/navigation";
import type { Semester } from "@prisma/client";

interface TermOption {
  id: string;
  academicYear: string;
  semester: Semester;
  active: boolean;
}

interface DashboardTermSelectorProps {
  terms: TermOption[];
  currentTermId: string;
}

export function DashboardTermSelector({ terms, currentTermId }: DashboardTermSelectorProps) {
  const router = useRouter();

  function handleTermChange(termId: string) {
    const selected = terms.find((t) => t.id === termId);
    if (selected) {
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set("academicYear", selected.academicYear);
      searchParams.set("semester", selected.semester);
      router.push(`/dashboard?${searchParams.toString()}`);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="dashboard-term-select" className="ui-label mb-0 whitespace-nowrap">
        Term:
      </label>
      <select
        id="dashboard-term-select"
        value={currentTermId}
        onChange={(e) => handleTermChange(e.target.value)}
        className="ui-select w-auto min-w-[12rem] text-xs font-bold"
      >
        {terms.map((t) => (
          <option key={t.id} value={t.id}>
            {t.academicYear} &mdash; {t.semester === "FIRST_SEMESTER" ? "1st Sem" : t.semester === "SECOND_SEMESTER" ? "2nd Sem" : "Summer"} {t.active ? "(Active)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
