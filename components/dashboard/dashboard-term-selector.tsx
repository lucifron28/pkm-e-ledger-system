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
      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
        Term:
      </label>
      <select
        value={currentTermId}
        onChange={(e) => handleTermChange(e.target.value)}
        className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#004aad]"
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
