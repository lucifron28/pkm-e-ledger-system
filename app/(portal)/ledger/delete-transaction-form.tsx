"use client";

import { useActionState, useState, useMemo } from "react";
import { softDeleteTransactionAction } from "@/lib/actions/transactions";
import { useModalFocus } from "@/lib/hooks/use-modal-focus";

export function DeleteTransactionForm({ id, version }: { id: string; version: number }) {
  const [state, formAction, isPending] = useActionState(softDeleteTransactionAction, null);
  const [isOpen, setIsOpen] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const { triggerRef, containerRef, initialFocusRef, handleKeyDown } = useModalFocus({
    isOpen,
    onClose: () => setIsOpen(false),
  });

  return (
    <div className="inline">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-2.5 py-1 rounded text-xs border border-red-300 transition"
      >
        Delete
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
            aria-labelledby={`del-tx-title-${id}`}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 id={`del-tx-title-${id}`} className="font-bold text-slate-900 text-lg">
                Delete Transaction
              </h3>
              <button
                ref={initialFocusRef as React.RefObject<HTMLButtonElement>}
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close dialog"
                className="text-slate-400 hover:text-slate-600 font-bold text-xl"
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
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={version} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <div>
                <label htmlFor={`del-tx-reason-${id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Deletion Reason
                </label>
                <textarea
                  id={`del-tx-reason-${id}`}
                  name="deleteReason"
                  required
                  rows={3}
                  placeholder="Reason for deleting this transaction..."
                  aria-invalid={Boolean(state?.fieldErrors?.deleteReason)}
                  aria-describedby={state?.fieldErrors?.deleteReason ? `err-del-tx-reason-${id}` : undefined}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] resize-none"
                />
                {state?.fieldErrors?.deleteReason && (
                  <p id={`err-del-tx-reason-${id}`} className="mt-1 text-xs text-red-600">
                    {state.fieldErrors.deleteReason[0]}
                  </p>
                )}
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
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg shadow transition text-sm disabled:opacity-50"
                >
                  {isPending ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
