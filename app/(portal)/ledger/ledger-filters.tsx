"use client";

import { useCallback } from "react";
import type { CategoryDto } from "@/lib/data/transactions";
import { SEMESTER_LABELS } from "@/lib/data/term-labels";
import { Semester, TransactionType } from "@prisma/client";
import { ParsedLedgerQuery } from "@/lib/domain/query";

interface LedgerTermOption {
  id: string;
  academicYear: string;
  semester: Semester;
  active: boolean;
}

export function LedgerFilters({
  filters,
  incomeCategories,
  expenseCategories,
  terms,
}: {
  filters: ParsedLedgerQuery;
  incomeCategories: CategoryDto[];
  expenseCategories: CategoryDto[];
  terms: LedgerTermOption[];
}) {
  const currentType = filters.type || "";
  const categories = currentType === TransactionType.INCOME
    ? incomeCategories
    : currentType === TransactionType.EXPENSE
      ? expenseCategories
      : [...incomeCategories, ...expenseCategories];

  const buildUrl = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const merged: Record<string, unknown> = {
        academicYear: filters.academicYear,
        semester: filters.semester,
        type: filters.type,
        categoryId: filters.categoryId,
        cashAccount: filters.cashAccount,
        month: filters.month,
        event: filters.eventActivityName,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: filters.search,
        cursor: filters.cursor,
        ...overrides,
      };

      const params = new URLSearchParams();
      for (const key of [
        "academicYear",
        "semester",
        "type",
        "categoryId",
        "cashAccount",
        "month",
        "event",
        "dateFrom",
        "dateTo",
        "search",
        "cursor",
      ]) {
        const val = merged[key];
        if (typeof val === "string" && val.trim().length > 0) {
          params.set(key, val.trim());
        }
      }
      const query = params.toString();
      return `/ledger${query ? `?${query}` : ""}`;
    },
    [filters]
  );

  const handleChange = (key: string, value: string) => {
    const url = buildUrl({ [key]: value || undefined });
    window.location.href = url;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* Term Select */}
        <div>
          <label htmlFor="term-select" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Academic Term
          </label>
          <select
            id="term-select"
            value={
              filters.academicYear && filters.semester
                ? `${filters.academicYear}:${filters.semester}`
                : ""
            }
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                window.location.href = buildUrl({ academicYear: undefined, semester: undefined });
              } else {
                const [ay, sem] = val.split(":");
                window.location.href = buildUrl({ academicYear: ay, semester: sem });
              }
            }}
            className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004aad]"
          >
            <option value="">-- Active Term (Default) --</option>
            {terms.map((t) => (
              <option key={t.id} value={`${t.academicYear}:${t.semester}`}>
                {t.academicYear} - {SEMESTER_LABELS[t.semester]} {t.active ? "(Active)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Type Select */}
        <div>
          <label htmlFor="type-select" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Type
          </label>
          <select
            id="type-select"
            value={filters.type || ""}
            onChange={(e) => handleChange("type", e.target.value)}
            className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004aad]"
          >
            <option value="">All Types</option>
            <option value={TransactionType.INCOME}>Income</option>
            <option value={TransactionType.EXPENSE}>Expense</option>
          </select>
        </div>

        {/* Category Select */}
        <div>
          <label htmlFor="category-select" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Category
          </label>
          <select
            id="category-select"
            value={filters.categoryId || ""}
            onChange={(e) => handleChange("categoryId", e.target.value)}
            className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004aad]"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div>
          <label htmlFor="search-input" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Search
          </label>
          <input
            id="search-input"
            type="text"
            placeholder="Search description, OR #..."
            defaultValue={filters.search || ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleChange("search", (e.target as HTMLInputElement).value);
              }
            }}
            className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004aad]"
          />
        </div>
      </div>
    </div>
  );
}
