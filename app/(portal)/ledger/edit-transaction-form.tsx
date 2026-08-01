"use client";

import { useActionState, useState, useMemo } from "react";
import { editTransactionAction } from "@/lib/actions/transactions";
import type { TransactionDto, CategoryDto } from "@/lib/data/transactions";
import { TransactionType } from "@prisma/client";
import { formatPesoInputFromCents } from "@/lib/data/money";

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
  const categories = txType === TransactionType.INCOME ? incomeCategories : expenseCategories;
  const dateStr = transaction.transactionDate.toISOString().split("T")[0];
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  return (
    <div className="inline">
      <button type="button" onClick={() => setIsOpen(true)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded text-xs border border-slate-300 transition">
        Edit
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 text-left">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">Edit Transaction</h3>
              <button type="button" onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
            </div>

            {state?.error && !state.fieldErrors && (
              <div className="bg-red-50 border-l-4 border-red-500 p-3 text-red-800 text-sm rounded">{state.error}</div>
            )}

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="id" value={transaction.id} />
              <input type="hidden" name="version" value={transaction.version} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Type</label>
                  <select
                    name="type" value={txType}
                    onChange={(e) => setTxType(e.target.value as TransactionType)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  >
                    <option value="INCOME">Income</option>
                    <option value="EXPENSE">Expense</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Date</label>
                  <input name="transactionDate" type="date" required defaultValue={dateStr} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]" />
                  {state?.fieldErrors?.transactionDate && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.transactionDate[0]}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Amount</label>
                  <input name="amount" type="text" inputMode="decimal" required defaultValue={formatPesoInputFromCents(transaction.amountCents)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#004aad]" />
                  {state?.fieldErrors?.amount && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.amount[0]}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Cash Account</label>
                  <select name="cashAccount" required defaultValue={transaction.cashAccount} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]">
                    <option value="CASH_ON_HAND">Cash on Hand</option>
                    <option value="CASH_IN_BANK">Cash in Bank</option>
                  </select>
                  {state?.fieldErrors?.cashAccount && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.cashAccount[0]}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Category</label>
                  <select name="categoryId" required defaultValue={transaction.categoryId} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]">
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {state?.fieldErrors?.categoryId && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.categoryId[0]}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Doc Number</label>
                  <input name="documentNumber" type="text" defaultValue={transaction.documentNumber || ""} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Payor / Payee</label>
                <input name="counterpartyName" type="text" required defaultValue={transaction.counterpartyName || ""} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]" />
                {state?.fieldErrors?.counterpartyName && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.counterpartyName[0]}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Description</label>
                <input name="description" type="text" required defaultValue={transaction.description} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]" />
                {state?.fieldErrors?.description && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.description[0]}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Reference / Attachment Description</label>
                <input name="referenceDescription" type="text" required defaultValue={transaction.referenceDescription} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]" />
                {state?.fieldErrors?.referenceDescription && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.referenceDescription[0]}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Event / Activity Name</label>
                <input name="eventActivityName" type="text" required defaultValue={transaction.eventActivityName || ""} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]" />
                {state?.fieldErrors?.eventActivityName && <p className="mt-1 text-xs text-red-600">{state.fieldErrors.eventActivityName[0]}</p>}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-sm transition">Cancel</button>
                <button type="submit" disabled={isPending} className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-4 py-2 rounded-lg shadow transition text-sm disabled:opacity-50">
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
