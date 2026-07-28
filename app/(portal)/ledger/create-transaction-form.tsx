"use client";

import { useActionState, useState } from "react";
import { createTransactionAction } from "@/lib/actions/transactions";
import type { CategoryDto } from "@/lib/data/transactions";
import { TransactionType } from "@prisma/client";

interface CreateTransactionFormProps {
  incomeCategories: CategoryDto[];
  expenseCategories: CategoryDto[];
}

export function CreateTransactionForm({
  incomeCategories,
  expenseCategories,
}: CreateTransactionFormProps) {
  const [state, formAction, isPending] = useActionState(createTransactionAction, null);
  const [txType, setTxType] = useState<TransactionType>(TransactionType.INCOME);
  const categories = txType === TransactionType.INCOME ? incomeCategories : expenseCategories;

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-4">
      {state?.error && !state.fieldErrors && (
        <div className="bg-red-50 border-l-4 border-red-500 p-3 text-red-800 text-sm rounded">{state.error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Type</label>
          <select
            name="type"
            value={txType}
            onChange={(e) => setTxType(e.target.value as TransactionType)}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
          >
            <option value="INCOME">Income</option>
            <option value="EXPENSE">Expense</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Transaction Date</label>
          <input
            name="transactionDate" type="date" required
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
          />
          {state?.fieldErrors?.transactionDate && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.transactionDate[0]}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Amount (₱)</label>
          <input
            name="amount" type="text" inputMode="decimal" required placeholder="0.00"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#004aad]"
          />
          {state?.fieldErrors?.amount && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.amount[0]}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Cash Account</label>
          <select name="cashAccount" required className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]">
            <option value="">Select account</option>
            <option value="CASH_ON_HAND">Cash on Hand</option>
            <option value="CASH_IN_BANK">Cash in Bank</option>
          </select>
          {state?.fieldErrors?.cashAccount && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.cashAccount[0]}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Category</label>
          <select name="categoryId" required className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]">
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {state?.fieldErrors?.categoryId && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.categoryId[0]}</p>}
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Document Number</label>
          <input
            name="documentNumber" type="text" placeholder="e.g. OR-001"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Payor / Payee</label>
        <input
          name="counterpartyName" type="text" required placeholder="Name of person or entity"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        />
        {state?.fieldErrors?.counterpartyName && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.counterpartyName[0]}</p>}
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Description</label>
        <input
          name="description" type="text" required placeholder="Brief description of the transaction"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        />
        {state?.fieldErrors?.description && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.description[0]}</p>}
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Reference / Attachment Description</label>
        <input
          name="referenceDescription" type="text" required placeholder="Notes about supporting documents"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        />
        {state?.fieldErrors?.referenceDescription && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.referenceDescription[0]}</p>}
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
          Receipt Attachment
        </label>
        <input
          name="attachment"
          type="file"
          required
          accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        />
        <p className="mt-1 text-xs text-slate-500">Required. JPEG, PNG, or PDF up to 10 MB.</p>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Event / Activity Name</label>
        <input
          name="eventActivityName" type="text" required placeholder="Associated project, event, or activity"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        />
        {state?.fieldErrors?.eventActivityName && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.eventActivityName[0]}</p>}
      </div>

      <button
        type="submit" disabled={isPending}
        className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-6 py-2.5 rounded-lg shadow transition text-sm disabled:opacity-50"
      >
        {isPending ? "Recording..." : `Record ${txType === TransactionType.INCOME ? "Income" : "Expense"}`}
      </button>
    </form>
  );
}
