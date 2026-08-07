"use client";

import { useActionState, useState, useMemo } from "react";
import { editTransactionAction } from "@/lib/actions/transactions";
import type { TransactionDto, CategoryDto } from "@/lib/data/transactions";
import { TransactionType } from "@prisma/client";
import { formatPesoInputFromCents } from "@/lib/data/money";
import { useModalFocus } from "@/lib/hooks/use-modal-focus";

interface EditTransactionFormProps {
  transaction: TransactionDto;
  incomeCategories: CategoryDto[];
  expenseCategories: CategoryDto[];
}

export function EditTransactionForm({
  transaction,
  incomeCategories,
  expenseCategories,
}: EditTransactionFormProps) {
  const [state, formAction, isPending] = useActionState(editTransactionAction, null);
  const [isOpen, setIsOpen] = useState(false);
  const [txType, setTxType] = useState<TransactionType>(transaction.type);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(transaction.categoryId);
  const categories = txType === TransactionType.INCOME ? incomeCategories : expenseCategories;
  const dateStr = transaction.transactionDate.toISOString().split("T")[0];
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const { triggerRef, containerRef, initialFocusRef, handleKeyDown } = useModalFocus({
    isOpen,
    isPending,
    onClose: () => setIsOpen(false),
  });

  const isCurrentCategoryInList = categories.some((c) => c.id === transaction.categoryId);

  const handleTypeChange = (newType: TransactionType) => {
    setTxType(newType);
    if (newType === transaction.type) {
      setSelectedCategoryId(transaction.categoryId);
    } else {
      setSelectedCategoryId("");
    }
  };

  return (
    <div className="inline">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded text-xs border border-slate-300 transition"
      >
        Edit
      </button>

      {isOpen && (
        <div
          ref={containerRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 text-left"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`edit-tx-title-${transaction.id}`}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 id={`edit-tx-title-${transaction.id}`} className="font-bold text-slate-900 text-lg">
                Edit Transaction
              </h3>
              <button
                ref={initialFocusRef as React.RefObject<HTMLButtonElement>}
                type="button"
                onClick={() => !isPending && setIsOpen(false)}
                disabled={isPending}
                aria-label="Close dialog"
                className="text-slate-400 hover:text-slate-600 font-bold text-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                &times;
              </button>
            </div>

            {state?.error && !state.fieldErrors && (
              <div role="alert" className="bg-red-50 border-l-4 border-red-500 p-3 text-red-800 text-sm rounded">
                {state.error}
              </div>
            )}

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="id" value={transaction.id} />
              <input type="hidden" name="version" value={transaction.version} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor={`edit-type-${transaction.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Type
                  </label>
                  <select
                    id={`edit-type-${transaction.id}`}
                    name="type"
                    value={txType}
                    onChange={(e) => handleTypeChange(e.target.value as TransactionType)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  >
                    <option value="INCOME">Income</option>
                    <option value="EXPENSE">Expense</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={`edit-date-${transaction.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Date
                  </label>
                  <input
                    id={`edit-date-${transaction.id}`}
                    name="transactionDate"
                    type="date"
                    required
                    defaultValue={dateStr}
                    aria-invalid={Boolean(state?.fieldErrors?.transactionDate)}
                    aria-describedby={state?.fieldErrors?.transactionDate ? `err-date-${transaction.id}` : undefined}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  />
                  {state?.fieldErrors?.transactionDate && (
                    <p id={`err-date-${transaction.id}`} className="mt-1 text-xs text-red-600">
                      {state.fieldErrors.transactionDate[0]}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor={`edit-amount-${transaction.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Amount
                  </label>
                  <input
                    id={`edit-amount-${transaction.id}`}
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    required
                    defaultValue={formatPesoInputFromCents(transaction.amountCents)}
                    aria-invalid={Boolean(state?.fieldErrors?.amount)}
                    aria-describedby={state?.fieldErrors?.amount ? `err-amount-${transaction.id}` : undefined}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  />
                  {state?.fieldErrors?.amount && (
                    <p id={`err-amount-${transaction.id}`} className="mt-1 text-xs text-red-600">
                      {state.fieldErrors.amount[0]}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor={`edit-account-${transaction.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Cash Account
                  </label>
                  <select
                    id={`edit-account-${transaction.id}`}
                    name="cashAccount"
                    required
                    defaultValue={transaction.cashAccount}
                    aria-invalid={Boolean(state?.fieldErrors?.cashAccount)}
                    aria-describedby={state?.fieldErrors?.cashAccount ? `err-account-${transaction.id}` : undefined}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  >
                    <option value="CASH_ON_HAND">Cash on Hand</option>
                    <option value="CASH_IN_BANK">Cash in Bank</option>
                  </select>
                  {state?.fieldErrors?.cashAccount && (
                    <p id={`err-account-${transaction.id}`} className="mt-1 text-xs text-red-600">
                      {state.fieldErrors.cashAccount[0]}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor={`edit-category-${transaction.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Category
                  </label>
                  <select
                    id={`edit-category-${transaction.id}`}
                    name="categoryId"
                    required
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    aria-invalid={Boolean(state?.fieldErrors?.categoryId)}
                    aria-describedby={state?.fieldErrors?.categoryId ? `err-category-${transaction.id}` : undefined}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  >
                    <option value="">Select Category...</option>
                    {!isCurrentCategoryInList && transaction.categoryId && (
                      <option value={transaction.categoryId}>
                        {transaction.categoryName || transaction.categoryId} (Current)
                      </option>
                    )}
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {state?.fieldErrors?.categoryId && (
                    <p id={`err-category-${transaction.id}`} className="mt-1 text-xs text-red-600">
                      {state.fieldErrors.categoryId[0]}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor={`edit-doc-${transaction.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Document # (OR/DV)
                  </label>
                  <input
                    id={`edit-doc-${transaction.id}`}
                    name="documentNumber"
                    type="text"
                    defaultValue={transaction.documentNumber || ""}
                    placeholder="e.g. OR-1001"
                    aria-invalid={Boolean(state?.fieldErrors?.documentNumber)}
                    aria-describedby={state?.fieldErrors?.documentNumber ? `err-doc-${transaction.id}` : undefined}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  />
                  {state?.fieldErrors?.documentNumber && (
                    <p id={`err-doc-${transaction.id}`} className="mt-1 text-xs text-red-600">
                      {state.fieldErrors.documentNumber[0]}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`edit-party-${transaction.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    {txType === TransactionType.INCOME ? "Payor Name" : "Payee Name"}
                  </label>
                  <input
                    id={`edit-party-${transaction.id}`}
                    name="counterpartyName"
                    type="text"
                    defaultValue={transaction.counterpartyName || ""}
                    placeholder={txType === TransactionType.INCOME ? "Received from..." : "Paid to..."}
                    aria-invalid={Boolean(state?.fieldErrors?.counterpartyName)}
                    aria-describedby={state?.fieldErrors?.counterpartyName ? `err-party-${transaction.id}` : undefined}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  />
                  {state?.fieldErrors?.counterpartyName && (
                    <p id={`err-party-${transaction.id}`} className="mt-1 text-xs text-red-600">
                      {state.fieldErrors.counterpartyName[0]}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor={`edit-event-${transaction.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Event / Activity
                  </label>
                  <input
                    id={`edit-event-${transaction.id}`}
                    name="eventActivityName"
                    type="text"
                    defaultValue={transaction.eventActivityName || ""}
                    placeholder="e.g. Sportsfest 2026"
                    aria-invalid={Boolean(state?.fieldErrors?.eventActivityName)}
                    aria-describedby={state?.fieldErrors?.eventActivityName ? `err-event-${transaction.id}` : undefined}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  />
                  {state?.fieldErrors?.eventActivityName && (
                    <p id={`err-event-${transaction.id}`} className="mt-1 text-xs text-red-600">
                      {state.fieldErrors.eventActivityName[0]}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor={`edit-desc-${transaction.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Particulars / Description
                </label>
                <input
                  id={`edit-desc-${transaction.id}`}
                  name="description"
                  type="text"
                  required
                  defaultValue={transaction.description}
                  aria-invalid={Boolean(state?.fieldErrors?.description)}
                  aria-describedby={state?.fieldErrors?.description ? `err-desc-${transaction.id}` : undefined}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                />
                {state?.fieldErrors?.description && (
                  <p id={`err-desc-${transaction.id}`} className="mt-1 text-xs text-red-600">
                    {state.fieldErrors.description[0]}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor={`edit-ref-${transaction.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Reference Description
                </label>
                <input
                  id={`edit-ref-${transaction.id}`}
                  name="referenceDescription"
                  type="text"
                  required
                  defaultValue={transaction.referenceDescription}
                  aria-invalid={Boolean(state?.fieldErrors?.referenceDescription)}
                  aria-describedby={state?.fieldErrors?.referenceDescription ? `err-ref-${transaction.id}` : undefined}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                />
                {state?.fieldErrors?.referenceDescription && (
                  <p id={`err-ref-${transaction.id}`} className="mt-1 text-xs text-red-600">
                    {state.fieldErrors.referenceDescription[0]}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => !isPending && setIsOpen(false)}
                  disabled={isPending}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="bg-[#004aad] hover:bg-[#003882] text-white font-bold px-4 py-2 rounded-lg shadow transition text-sm disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
