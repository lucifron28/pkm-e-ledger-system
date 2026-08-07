"use client";

import { useCallback } from "react";
import type { CategoryDto } from "@/lib/data/transactions";
import { SEMESTER_LABELS } from "@/lib/data/term-labels";
import { CashAccount, Semester, TransactionType } from "@prisma/client";
import { buildLedgerFilterUrl, ParsedLedgerQuery } from "@/lib/domain/query";

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
    (overrides: Record<string, string | undefined>) =>
      buildLedgerFilterUrl(filters, overrides),
    [filters]
  );

  const handleChange = (key: string, value: string) => {
    const overrides: Record<string, string | undefined> = { [key]: value || undefined };
    if (key === "entryType" && value === "TRANSFER") {
      overrides.type = undefined;
      overrides.categoryId = undefined;
    }
    if (key === "type" && value && filters.entryType === "TRANSFER") {
      overrides.entryType = undefined;
    }
    const url = buildUrl(overrides);
    window.location.href = url;
  };

  const handleClearFilters = () => {
    const url = buildUrl({
      type: undefined,
      entryType: undefined,
      categoryId: undefined,
      cashAccount: undefined,
      month: undefined,
      event: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      search: undefined,
    });
    window.location.href = url;
  };

  const isTransferOnly = filters.entryType === "TRANSFER";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Filter Ledger Entries</span>
        <button
          type="button"
          onClick={handleClearFilters}
          className="text-xs font-bold text-[#004aad] hover:underline"
        >
          Clear Filters
        </button>
      </div>

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
            value={isTransferOnly ? "" : filters.type || ""}
            disabled={isTransferOnly}
            onChange={(e) => handleChange("type", e.target.value)}
            className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004aad] disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">All Types</option>
            <option value={TransactionType.INCOME}>Income</option>
            <option value={TransactionType.EXPENSE}>Expense</option>
          </select>
        </div>

        <div>
          <label htmlFor="entry-type-select" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Entry Type
          </label>
          <select
            id="entry-type-select"
            value={filters.entryType || ""}
            onChange={(e) => handleChange("entryType", e.target.value)}
            className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004aad]"
          >
            <option value="">All Entries</option>
            <option value="TRANSACTION">Transactions</option>
            <option value="TRANSFER">Cash Transfers</option>
          </select>
        </div>

        {/* Category Select */}
        <div>
          <label htmlFor="category-select" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Category
          </label>
          <select
            id="category-select"
            value={isTransferOnly ? "" : filters.categoryId || ""}
            disabled={isTransferOnly}
            onChange={(e) => handleChange("categoryId", e.target.value)}
            className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004aad] disabled:bg-slate-100 disabled:text-slate-400"
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

        <div>
          <label htmlFor="cash-account-select" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Cash Account
          </label>
          <select
            id="cash-account-select"
            value={filters.cashAccount || ""}
            onChange={(e) => handleChange("cashAccount", e.target.value)}
            className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004aad]"
          >
            <option value="">All Accounts</option>
            <option value={CashAccount.CASH_ON_HAND}>Cash on Hand</option>
            <option value={CashAccount.CASH_IN_BANK}>Cash in Bank</option>
          </select>
        </div>

        <div>
          <label htmlFor="month-filter" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Month
          </label>
          <input
            id="month-filter"
            type="month"
            value={filters.month || ""}
            onChange={(e) => handleChange("month", e.target.value)}
            className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004aad]"
          />
        </div>

        <div>
          <label htmlFor="event-filter" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Event / Activity
          </label>
          <input
            id="event-filter"
            type="text"
            defaultValue={filters.eventActivityName || ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleChange("event", (e.target as HTMLInputElement).value);
            }}
            className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004aad]"
          />
        </div>

        <div>
          <label htmlFor="date-from-filter" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Date From
          </label>
          <input
            id="date-from-filter"
            type="date"
            value={filters.dateFrom || ""}
            onChange={(e) => handleChange("dateFrom", e.target.value)}
            className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004aad]"
          />
        </div>

        <div>
          <label htmlFor="date-to-filter" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Date To
          </label>
          <input
            id="date-to-filter"
            type="date"
            value={filters.dateTo || ""}
            onChange={(e) => handleChange("dateTo", e.target.value)}
            className="w-full text-xs font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004aad]"
          />
        </div>
      </div>
    </div>
  );
}
