"use client";

import { useCallback } from "react";
import type { CategoryDto, TransactionFilters } from "@/lib/data/transactions";
import { SEMESTER_LABELS } from "@/lib/data/term-labels";
import { Semester, TransactionType } from "@prisma/client";

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
  filters: TransactionFilters;
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
      const merged = { ...filters, ...overrides } as Record<string, string | undefined>;
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
      ]) {
        if (merged[key]) params.set(key, merged[key]!);
      }
      const query = params.toString();
      return `/ledger${query ? `?${query}` : ""}`;
    },
    [filters]
  );

  const handleChange = (key: string, value: string) => {
    window.location.href = buildUrl({
      [key]: value || undefined,
      ...(key === "type" ? { categoryId: undefined } : {}),
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select value={filters.academicYear || ""} onChange={(e) => handleChange("academicYear", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]">
          <option value="">Active Academic Year</option>
          {terms.map((term) => (
            <option key={term.id} value={term.academicYear}>{term.academicYear}</option>
          ))}
        </select>

        <select value={filters.semester || ""} onChange={(e) => handleChange("semester", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]">
          <option value="">Active Semester</option>
          {Object.entries(SEMESTER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <select value={filters.type || ""} onChange={(e) => handleChange("type", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]">
          <option value="">All Types</option>
          <option value="INCOME">Income</option>
          <option value="EXPENSE">Expense</option>
        </select>

        <select value={filters.categoryId || ""} onChange={(e) => handleChange("categoryId", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]">
          <option value="">All Categories</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>

        <select value={filters.cashAccount || ""} onChange={(e) => handleChange("cashAccount", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]">
          <option value="">All Accounts</option>
          <option value="CASH_ON_HAND">Cash on Hand</option>
          <option value="CASH_IN_BANK">Cash in Bank</option>
        </select>

        <input type="month" value={filters.month || ""} onChange={(e) => handleChange("month", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]" />
        <input type="text" placeholder="Event / Activity" defaultValue={filters.eventActivityName || ""} onKeyDown={(e) => e.key === "Enter" && handleChange("event", (e.target as HTMLInputElement).value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]" />
        <input type="date" value={filters.dateFrom || ""} onChange={(e) => handleChange("dateFrom", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]" />
        <input type="date" value={filters.dateTo || ""} onChange={(e) => handleChange("dateTo", e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]" />
        <input type="text" placeholder="Search" defaultValue={filters.search || ""} onKeyDown={(e) => e.key === "Enter" && handleChange("search", (e.target as HTMLInputElement).value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] flex-1 min-w-[150px]" />

        {Object.values(filters).some(Boolean) && (
          <button type="button" onClick={() => { window.location.href = "/ledger"; }} className="text-xs text-red-600 font-semibold hover:underline px-2">Clear Filters</button>
        )}
      </div>
    </div>
  );
}
