"use client";

import { useState } from "react";
import type { CategoryDto } from "@/lib/data/transactions";
import { TransactionType } from "@prisma/client";
import { CreateTransactionForm } from "@/app/(portal)/ledger/create-transaction-form";
import { CreateCashTransferForm } from "@/app/(portal)/ledger/create-cash-transfer-form";
import { ButtonLink } from "@/components/ui/patterns";
import {
  IconArrowsExchange as ArrowsExchange,
  IconChevronDown as ChevronDown,
  IconChevronUp as ChevronUp,
  IconPlus as Plus,
  IconReceipt as Receipt,
  IconX as X,
} from "@tabler/icons-react";

interface LedgerRecordingHubProps {
  activeTermId: string;
  incomeCategories: CategoryDto[];
  expenseCategories: CategoryDto[];
}

type RecordingTab = "none" | "income" | "expense" | "transfer";

export function LedgerRecordingHub({
  activeTermId,
  incomeCategories,
  expenseCategories,
}: LedgerRecordingHubProps) {
  const [activeTab, setActiveTab] = useState<RecordingTab>("none");

  const isExpanded = activeTab !== "none";

  return (
    <div className="space-y-4">
      {/* Quick Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#004aad]">
            <Receipt size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">Recording Actions</h2>
            <p className="text-xs text-slate-500">Record a transaction or move funds between accounts.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink
            href="/ledger/income/new"
            variant="primary"
            className="text-xs px-3 py-1.5 min-h-[36px]"
          >
            <Plus size={15} aria-hidden="true" />
            <span>New Income</span>
          </ButtonLink>

          <ButtonLink
            href="/ledger/expense/new"
            variant="secondary"
            className="text-xs px-3 py-1.5 min-h-[36px]"
          >
            <Plus size={15} aria-hidden="true" />
            <span>New Expense</span>
          </ButtonLink>

          <button
            type="button"
            onClick={() => setActiveTab(activeTab === "transfer" ? "none" : "transfer")}
            aria-expanded={activeTab === "transfer"}
            className={`ui-button text-xs px-3 py-1.5 min-h-[36px] ${
              activeTab === "transfer" ? "ui-button-primary" : "ui-button-secondary"
            }`}
          >
            <ArrowsExchange size={15} aria-hidden="true" />
            <span>Transfer Cash</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(isExpanded ? "none" : "income")}
            aria-expanded={isExpanded}
            className="ui-button ui-button-quiet text-xs px-2.5 py-1.5 min-h-[36px]"
            title={isExpanded ? "Collapse inline recording" : "Expand inline form"}
          >
            <span>{isExpanded ? "Hide form" : "Inline form"}</span>
            {isExpanded ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Expanded Inline Form Panel */}
      {isExpanded && (
        <div className="rounded-xl border border-blue-200 bg-white shadow-md overflow-hidden transition-all duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 bg-blue-50/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#004aad]">
                {activeTab === "transfer" ? "Cash Transfer" : activeTab === "expense" ? "Expense Transaction" : "Income Transaction"}
              </span>
              <div className="flex items-center gap-1 border-l border-slate-300 pl-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("income")}
                  className={`text-xs font-semibold px-2 py-0.5 rounded transition-colors ${
                    activeTab === "income" ? "bg-[#004aad] text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Income
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("expense")}
                  className={`text-xs font-semibold px-2 py-0.5 rounded transition-colors ${
                    activeTab === "expense" ? "bg-[#004aad] text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("transfer")}
                  className={`text-xs font-semibold px-2 py-0.5 rounded transition-colors ${
                    activeTab === "transfer" ? "bg-[#004aad] text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Transfer
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("none")}
              className="ui-icon-button min-w-[32px] min-h-[32px] text-slate-400 hover:text-slate-600"
              aria-label="Close recording form"
              title="Close form"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="p-5">
            {activeTab === "transfer" ? (
              <CreateCashTransferForm activeTermId={activeTermId} />
            ) : (
              <CreateTransactionForm
                activeTermId={activeTermId}
                incomeCategories={incomeCategories}
                expenseCategories={expenseCategories}
                fixedType={activeTab === "expense" ? TransactionType.EXPENSE : TransactionType.INCOME}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
