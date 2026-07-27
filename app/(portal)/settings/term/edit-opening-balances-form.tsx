"use client";

import { useActionState, useState } from "react";
import { updateOpeningBalancesAction } from "@/lib/actions/terms";

interface EditOpeningBalancesFormProps {
  termId: string;
  initialCashOnHand: string;
  initialCashInBank: string;
}

export function EditOpeningBalancesForm({
  termId,
  initialCashOnHand,
  initialCashInBank,
}: EditOpeningBalancesFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateOpeningBalancesAction,
    null
  );
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded text-xs shadow transition border border-slate-300"
        >
          Edit Balances
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">
                Edit Opening Balances
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {state?.error && !state.fieldErrors && (
              <div className="bg-red-50 border-l-4 border-red-500 p-3 text-red-800 text-sm rounded">
                {state.error}
              </div>
            )}

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="termId" value={termId} />

              <div>
                <label
                  htmlFor={`cohand-${termId}`}
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Opening Cash on Hand
                </label>
                <input
                  id={`cohand-${termId}`}
                  name="openingCashOnHand"
                  type="text"
                  inputMode="decimal"
                  required
                  defaultValue={initialCashOnHand}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition font-mono"
                />
              </div>

              <div>
                <label
                  htmlFor={`cibank-${termId}`}
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Opening Cash in Bank
                </label>
                <input
                  id={`cibank-${termId}`}
                  name="openingCashInBank"
                  type="text"
                  inputMode="decimal"
                  required
                  defaultValue={initialCashInBank}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-sm transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-4 py-2 rounded-lg shadow transition text-sm disabled:opacity-50"
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
