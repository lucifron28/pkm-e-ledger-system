"use client";

import { useCallback, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CategoryDto } from "@/lib/data/transactions";
import { SEMESTER_LABELS } from "@/lib/data/term-labels";
import { CashAccount, TransactionType } from "@prisma/client";
import type { Semester } from "@prisma/client";
import { buildLedgerFilterUrl } from "@/lib/domain/query";
import type { ParsedLedgerQuery } from "@/lib/domain/query";
import { IconFilter as Filter, IconRotate2 as Rotate } from "@tabler/icons-react";

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState(filters.search || "");
  const [eventTerm, setEventTerm] = useState(filters.eventActivityName || "");
  const [dateFrom, setDateFrom] = useState(filters.dateFrom || "");
  const [dateTo, setDateTo] = useState(filters.dateTo || "");
  const [month, setMonth] = useState(filters.month || "");

  const currentType = filters.type || "";
  const categories =
    currentType === TransactionType.INCOME
      ? incomeCategories
      : currentType === TransactionType.EXPENSE
      ? expenseCategories
      : [...incomeCategories, ...expenseCategories];

  const buildUrl = useCallback(
    (overrides: Record<string, string | undefined>) => buildLedgerFilterUrl(filters, overrides),
    [filters]
  );

  const navigateFilters = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const targetUrl = buildUrl({ ...overrides, cursor: undefined });
      startTransition(() => {
        router.push(targetUrl, { scroll: false });
      });
    },
    [buildUrl, router]
  );

  const handleSelectChange = (key: string, value: string) => {
    const overrides: Record<string, string | undefined> = { [key]: value || undefined };
    if (key === "entryType" && value === "TRANSFER") {
      overrides.type = undefined;
      overrides.categoryId = undefined;
    }
    if (key === "type" && value && filters.entryType === "TRANSFER") {
      overrides.entryType = undefined;
    }
    navigateFilters(overrides);
  };

  const handleApplyAll = (e?: FormEvent) => {
    if (e) e.preventDefault();
    navigateFilters({
      search: searchTerm.trim() || undefined,
      event: eventTerm.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      month: month || undefined,
    });
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setEventTerm("");
    setDateFrom("");
    setDateTo("");
    setMonth("");
    navigateFilters({
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
  };

  const isTransferOnly = filters.entryType === "TRANSFER";

  return (
    <section className="ui-panel" aria-labelledby="ledger-filter-title">
      <div className="ui-panel-header">
        <div>
          <h2 id="ledger-filter-title" className="ui-panel-title">
            Filter ledger entries
          </h2>
          <p className="ui-panel-description">
            Narrow records by term, account, category, activity, or date.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isPending && (
            <span
              role="status"
              aria-live="polite"
              className="text-xs font-semibold text-[#004aad] bg-blue-50 px-2.5 py-1 rounded border border-blue-200 animate-pulse"
            >
              Filtering records...
            </span>
          )}
          <button
            type="button"
            onClick={handleClearFilters}
            disabled={isPending}
            className="ui-button ui-button-quiet text-xs px-2.5 py-1 min-h-[36px]"
          >
            <Rotate size={14} aria-hidden="true" />
            <span>Clear filters</span>
          </button>
          <button
            type="button"
            onClick={handleApplyAll}
            disabled={isPending}
            className="ui-button ui-button-primary text-xs px-3 py-1 min-h-[36px]"
          >
            <Filter size={14} aria-hidden="true" />
            <span>Apply filters</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleApplyAll} className="ui-panel-body space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="term-select" className="ui-label">
              Academic term
            </label>
            <select
              id="term-select"
              value={filters.academicYear && filters.semester ? `${filters.academicYear}:${filters.semester}` : ""}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) {
                  navigateFilters({ academicYear: undefined, semester: undefined });
                } else {
                  const [academicYear, semester] = value.split(":");
                  navigateFilters({ academicYear, semester });
                }
              }}
              className="ui-select"
            >
              <option value="">Active term (default)</option>
              {terms.map((term) => (
                <option key={term.id} value={`${term.academicYear}:${term.semester}`}>
                  {term.academicYear} - {SEMESTER_LABELS[term.semester]} {term.active ? "(Active)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="type-select" className="ui-label">
              Transaction type
            </label>
            <select
              id="type-select"
              value={isTransferOnly ? "" : filters.type || ""}
              disabled={isTransferOnly}
              onChange={(event) => handleSelectChange("type", event.target.value)}
              className="ui-select"
            >
              <option value="">All types</option>
              <option value={TransactionType.INCOME}>Income</option>
              <option value={TransactionType.EXPENSE}>Expense</option>
            </select>
          </div>

          <div>
            <label htmlFor="entry-type-select" className="ui-label">
              Entry type
            </label>
            <select
              id="entry-type-select"
              value={filters.entryType || ""}
              onChange={(event) => handleSelectChange("entryType", event.target.value)}
              className="ui-select"
            >
              <option value="">All entries</option>
              <option value="TRANSACTION">Transactions</option>
              <option value="TRANSFER">Cash transfers</option>
            </select>
          </div>

          <div>
            <label htmlFor="category-select" className="ui-label">
              Category
            </label>
            <select
              id="category-select"
              value={isTransferOnly ? "" : filters.categoryId || ""}
              disabled={isTransferOnly}
              onChange={(event) => handleSelectChange("categoryId", event.target.value)}
              className="ui-select"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({category.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="search-input" className="ui-label">
              Search
            </label>
            <input
              id="search-input"
              type="search"
              placeholder="Description, document no..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ui-input"
            />
          </div>

          <div>
            <label htmlFor="cash-account-select" className="ui-label">
              Cash account
            </label>
            <select
              id="cash-account-select"
              value={filters.cashAccount || ""}
              onChange={(event) => handleSelectChange("cashAccount", event.target.value)}
              className="ui-select"
            >
              <option value="">All accounts</option>
              <option value={CashAccount.CASH_ON_HAND}>Cash on Hand</option>
              <option value={CashAccount.CASH_IN_BANK}>Cash in Bank</option>
            </select>
          </div>

          <div>
            <label htmlFor="month-filter" className="ui-label">
              Month
            </label>
            <input
              id="month-filter"
              type="month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                navigateFilters({ month: event.target.value || undefined });
              }}
              className="ui-input"
            />
          </div>

          <div>
            <label htmlFor="event-filter" className="ui-label">
              Event or activity
            </label>
            <input
              id="event-filter"
              type="text"
              placeholder="Sports fest, seminar..."
              value={eventTerm}
              onChange={(e) => setEventTerm(e.target.value)}
              className="ui-input"
            />
          </div>

          <div>
            <label htmlFor="date-from-filter" className="ui-label">
              Date from
            </label>
            <input
              id="date-from-filter"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="ui-input"
            />
          </div>

          <div>
            <label htmlFor="date-to-filter" className="ui-label">
              Date to
            </label>
            <input
              id="date-to-filter"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="ui-input"
            />
          </div>
        </div>
      </form>
    </section>
  );
}
