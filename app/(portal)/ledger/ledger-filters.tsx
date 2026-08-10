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
    (overrides: Record<string, string | undefined>) => buildLedgerFilterUrl(filters, overrides),
    [filters]
  );

  const handleChange = (key: string, value: string) => {
    const overrides: Record<string, string | undefined> = { [key]: value || undefined };
    if (key === "entryType" && value === "TRANSFER") {
      overrides.type = undefined;
      overrides.categoryId = undefined;
    }
    if (key === "type" && value && filters.entryType === "TRANSFER") overrides.entryType = undefined;
    window.location.href = buildUrl(overrides);
  };

  const handleClearFilters = () => {
    window.location.href = buildUrl({
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
          <h2 id="ledger-filter-title" className="ui-panel-title">Filter ledger entries</h2>
          <p className="ui-panel-description">Narrow records by term, account, category, activity, or date.</p>
        </div>
        <button type="button" onClick={handleClearFilters} className="ui-button ui-button-quiet text-xs">Clear filters</button>
      </div>

      <div className="ui-panel-body">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="term-select" className="ui-label">Academic term</label>
            <select
              id="term-select"
              value={filters.academicYear && filters.semester ? `${filters.academicYear}:${filters.semester}` : ""}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) {
                  window.location.href = buildUrl({ academicYear: undefined, semester: undefined });
                } else {
                  const [academicYear, semester] = value.split(":");
                  window.location.href = buildUrl({ academicYear, semester });
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
            <label htmlFor="type-select" className="ui-label">Transaction type</label>
            <select id="type-select" value={isTransferOnly ? "" : filters.type || ""} disabled={isTransferOnly} onChange={(event) => handleChange("type", event.target.value)} className="ui-select">
              <option value="">All types</option>
              <option value={TransactionType.INCOME}>Income</option>
              <option value={TransactionType.EXPENSE}>Expense</option>
            </select>
          </div>

          <div>
            <label htmlFor="entry-type-select" className="ui-label">Entry type</label>
            <select id="entry-type-select" value={filters.entryType || ""} onChange={(event) => handleChange("entryType", event.target.value)} className="ui-select">
              <option value="">All entries</option>
              <option value="TRANSACTION">Transactions</option>
              <option value="TRANSFER">Cash transfers</option>
            </select>
          </div>

          <div>
            <label htmlFor="category-select" className="ui-label">Category</label>
            <select id="category-select" value={isTransferOnly ? "" : filters.categoryId || ""} disabled={isTransferOnly} onChange={(event) => handleChange("categoryId", event.target.value)} className="ui-select">
              <option value="">All categories</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.type})</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="search-input" className="ui-label">Search</label>
            <input id="search-input" type="search" placeholder="Description, document no..." defaultValue={filters.search || ""} onKeyDown={(event) => { if (event.key === "Enter") handleChange("search", (event.target as HTMLInputElement).value); }} className="ui-input" />
          </div>

          <div>
            <label htmlFor="cash-account-select" className="ui-label">Cash account</label>
            <select id="cash-account-select" value={filters.cashAccount || ""} onChange={(event) => handleChange("cashAccount", event.target.value)} className="ui-select">
              <option value="">All accounts</option>
              <option value={CashAccount.CASH_ON_HAND}>Cash on Hand</option>
              <option value={CashAccount.CASH_IN_BANK}>Cash in Bank</option>
            </select>
          </div>

          <div>
            <label htmlFor="month-filter" className="ui-label">Month</label>
            <input id="month-filter" type="month" value={filters.month || ""} onChange={(event) => handleChange("month", event.target.value)} className="ui-input" />
          </div>

          <div>
            <label htmlFor="event-filter" className="ui-label">Event or activity</label>
            <input id="event-filter" type="text" defaultValue={filters.eventActivityName || ""} onKeyDown={(event) => { if (event.key === "Enter") handleChange("event", (event.target as HTMLInputElement).value); }} className="ui-input" />
          </div>

          <div>
            <label htmlFor="date-from-filter" className="ui-label">Date from</label>
            <input id="date-from-filter" type="date" value={filters.dateFrom || ""} onChange={(event) => handleChange("dateFrom", event.target.value)} className="ui-input" />
          </div>

          <div>
            <label htmlFor="date-to-filter" className="ui-label">Date to</label>
            <input id="date-to-filter" type="date" value={filters.dateTo || ""} onChange={(event) => handleChange("dateTo", event.target.value)} className="ui-input" />
          </div>
        </div>
      </div>
    </section>
  );
}
