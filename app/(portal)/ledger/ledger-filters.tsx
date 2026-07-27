"use client";

import { useCallback } from "react";
import { TransactionFilters, CategoryDto } from "@/lib/data/transactions";
import { TransactionType } from "@prisma/client";

export function LedgerFilters({
  filters,
  incomeCategories,
  expenseCategories,
}: {
  filters: TransactionFilters;
  incomeCategories: CategoryDto[];
  expenseCategories: CategoryDto[];
}) {
  const currentType = filters.type || "";
  const categories = currentType === TransactionType.INCOME ? incomeCategories
    : currentType === TransactionType.EXPENSE ? expenseCategories : [];

  const buildUrl = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams();
      const merged = { ...filters, ...overrides };
      if (merged.type) params.set("type", merged.type);
      if (merged.categoryId) params.set("categoryId", merged.categoryId);
      if (merged.cashAccount) params.set("cashAccount", merged.cashAccount);
      if (merged.month) params.set("month", merged.month);
      if (merged.eventActivityName) params.set("event", merged.eventActivityName);
      if (merged.dateFrom) params.set("dateFrom", merged.dateFrom);
      if (merged.dateTo) params.set("dateTo", merged.dateTo);
      if (merged.search) params.set("search", merged.search);
      const qs = params.toString();
      return `/ledger${qs ? `?${qs}` : ""}`;
    },
    [filters]
  );

  const handleChange = (key: string, value: string) => {
    window.location.href = buildUrl({
      [key]: value || undefined,
      ...(key === "type" ? { categoryId: undefined } : {}),
    });
  };

  const handleClear = () => {
    window.location.href = "/ledger";
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.type || ""}
          onChange={(e) => handleChange("type", e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        >
          <option value="">All Types</option>
          <option value="INCOME">Income</option>
          <option value="EXPENSE">Expense</option>
        </select>

        <select
          value={filters.categoryId || ""}
          onChange={(e) => handleChange("categoryId", e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={filters.cashAccount || ""}
          onChange={(e) => handleChange("cashAccount", e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        >
          <option value="">All Accounts</option>
          <option value="CASH_ON_HAND">Cash on Hand</option>
          <option value="CASH_IN_BANK">Cash in Bank</option>
        </select>

        <input
          type="month"
          value={filters.month || ""}
          onChange={(e) => handleChange("month", e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        />

        <input
          type="text"
          placeholder="Search..."
          defaultValue={filters.search || ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleChange("search", (e.target as HTMLInputElement).value);
            }
          }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] flex-1 min-w-[150px]"
        />

        {(filters.type || filters.categoryId || filters.cashAccount || filters.month || filters.search) && (
          <button onClick={handleClear} className="text-xs text-red-600 font-semibold hover:underline px-2">
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
