"use client";

import { useActionState, useState, useMemo } from "react";
import { createTransactionAction } from "@/lib/actions/transactions";
import type { CategoryDto } from "@/lib/data/transactions";
import { TransactionType } from "@prisma/client";

interface CreateTransactionFormProps {
  activeTermId: string;
  incomeCategories: CategoryDto[];
  expenseCategories: CategoryDto[];
  initialType?: TransactionType;
  fixedType?: TransactionType;
}

export function CreateTransactionForm({
  activeTermId,
  incomeCategories,
  expenseCategories,
  initialType = TransactionType.INCOME,
  fixedType,
}: CreateTransactionFormProps) {
  const [state, formAction, isPending] = useActionState(createTransactionAction, null);
  const effectiveInitialType = fixedType || initialType;
  const [txType, setTxType] = useState<TransactionType>(effectiveInitialType);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const categories = (fixedType || txType) === TransactionType.INCOME ? incomeCategories : expenseCategories;
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const handleTypeChange = (newType: TransactionType) => {
    if (fixedType) return;
    setTxType(newType);
    setSelectedCategoryId("");
  };

  const activeType = fixedType || txType;

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-4">
      <input type="hidden" name="termId" value={activeTermId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {fixedType && <input type="hidden" name="type" value={fixedType} />}
      {state?.error && !state.fieldErrors && (
        <div role="alert" className="bg-red-50 border-l-4 border-red-500 p-3 text-red-800 text-sm rounded">{state.error}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="create-tx-type" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Type</label>
          {fixedType ? (
            <div id="create-tx-type" className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-300 rounded-lg text-sm font-bold text-slate-700">
              {fixedType === TransactionType.INCOME ? "Income (Fixed)" : "Expense (Fixed)"}
            </div>
          ) : (
            <select
              id="create-tx-type"
              name="type"
              value={txType}
              onChange={(e) => handleTypeChange(e.target.value as TransactionType)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
            >
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
            </select>
          )}
        </div>

        <div>
          <label htmlFor="create-tx-date" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Transaction Date</label>
          <input
            id="create-tx-date"
            name="transactionDate"
            type="date"
            required
            aria-invalid={Boolean(state?.fieldErrors?.transactionDate)}
            aria-describedby={state?.fieldErrors?.transactionDate ? "create-tx-date-error" : undefined}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
          />
          {state?.fieldErrors?.transactionDate && <p id="create-tx-date-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.transactionDate[0]}</p>}
        </div>

        <div>
          <label htmlFor="create-tx-amount" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Amount (₱)</label>
          <input
            id="create-tx-amount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            placeholder="0.00"
            aria-invalid={Boolean(state?.fieldErrors?.amount)}
            aria-describedby={state?.fieldErrors?.amount ? "create-tx-amount-error" : undefined}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#004aad]"
          />
          {state?.fieldErrors?.amount && <p id="create-tx-amount-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.amount[0]}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="create-tx-cash-account" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Cash Account</label>
          <select
            id="create-tx-cash-account"
            name="cashAccount"
            required
            aria-invalid={Boolean(state?.fieldErrors?.cashAccount)}
            aria-describedby={state?.fieldErrors?.cashAccount ? "create-tx-cash-account-error" : undefined}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
          >
            <option value="">Select account</option>
            <option value="CASH_ON_HAND">Cash on Hand</option>
            <option value="CASH_IN_BANK">Cash in Bank</option>
          </select>
          {state?.fieldErrors?.cashAccount && <p id="create-tx-cash-account-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.cashAccount[0]}</p>}
        </div>

        <div>
          <label htmlFor="create-tx-category" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Category</label>
          <select
            id="create-tx-category"
            name="categoryId"
            required
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            aria-invalid={Boolean(state?.fieldErrors?.categoryId)}
            aria-describedby={state?.fieldErrors?.categoryId ? "create-tx-category-error" : undefined}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {state?.fieldErrors?.categoryId && <p id="create-tx-category-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.categoryId[0]}</p>}
        </div>

        <div>
          <label htmlFor="create-tx-doc-number" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Document Number</label>
          <input
            id="create-tx-doc-number"
            name="documentNumber"
            type="text"
            placeholder="e.g. OR-001"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
          />
        </div>
      </div>

      <div>
        <label htmlFor="create-tx-counterparty" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Payor / Payee</label>
        <input
          id="create-tx-counterparty"
          name="counterpartyName"
          type="text"
          required
          placeholder="Name of person or entity"
          aria-invalid={Boolean(state?.fieldErrors?.counterpartyName)}
          aria-describedby={state?.fieldErrors?.counterpartyName ? "create-tx-counterparty-error" : undefined}
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        />
        {state?.fieldErrors?.counterpartyName && <p id="create-tx-counterparty-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.counterpartyName[0]}</p>}
      </div>

      <div>
        <label htmlFor="create-tx-description" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Description</label>
        <input
          id="create-tx-description"
          name="description"
          type="text"
          required
          placeholder="Brief description of the transaction"
          aria-invalid={Boolean(state?.fieldErrors?.description)}
          aria-describedby={state?.fieldErrors?.description ? "create-tx-description-error" : undefined}
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        />
        {state?.fieldErrors?.description && <p id="create-tx-description-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.description[0]}</p>}
      </div>

      <div>
        <label htmlFor="create-tx-reference" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Reference / Attachment Description</label>
        <input
          id="create-tx-reference"
          name="referenceDescription"
          type="text"
          required
          placeholder="Notes about supporting documents"
          aria-invalid={Boolean(state?.fieldErrors?.referenceDescription)}
          aria-describedby={state?.fieldErrors?.referenceDescription ? "create-tx-reference-error" : undefined}
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        />
        {state?.fieldErrors?.referenceDescription && <p id="create-tx-reference-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.referenceDescription[0]}</p>}
      </div>

      <div>
        <label htmlFor="create-tx-attachment" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
          Receipt Attachment
        </label>
        <input
          id="create-tx-attachment"
          name="attachment"
          type="file"
          required
          accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
          aria-invalid={Boolean(state?.fieldErrors?.attachment)}
          aria-describedby={state?.fieldErrors?.attachment ? "create-tx-attachment-error" : undefined}
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        />
        <p className="mt-1 text-xs text-slate-500">Required. JPEG, PNG, or PDF up to 10 MB.</p>
        {state?.fieldErrors?.attachment && <p id="create-tx-attachment-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.attachment[0]}</p>}
      </div>

      <div>
        <label htmlFor="create-tx-event" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Event / Activity Name</label>
        <input
          id="create-tx-event"
          name="eventActivityName"
          type="text"
          required
          placeholder="Associated project, event, or activity"
          aria-invalid={Boolean(state?.fieldErrors?.eventActivityName)}
          aria-describedby={state?.fieldErrors?.eventActivityName ? "create-tx-event-error" : undefined}
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
        />
        {state?.fieldErrors?.eventActivityName && <p id="create-tx-event-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.eventActivityName[0]}</p>}
      </div>

      <button
        type="submit" disabled={isPending}
        className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-6 py-2.5 rounded-lg shadow transition text-sm disabled:opacity-50"
      >
        {isPending ? "Recording..." : `Record ${activeType === TransactionType.INCOME ? "Income" : "Expense"}`}
      </button>
    </form>
  );
}
