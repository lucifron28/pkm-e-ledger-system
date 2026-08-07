"use client";

import { useActionState, useMemo, useState } from "react";
import { softDeleteCashTransferAction } from "@/lib/actions/transfers";
import { useModalFocus } from "@/lib/hooks/use-modal-focus";

export function DeleteCashTransferForm({ id, version }: { id: string; version: number }) {
  const [state, formAction, isPending] = useActionState(softDeleteCashTransferAction, null);
  const [open, setOpen] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const { triggerRef, containerRef, initialFocusRef, handleKeyDown } = useModalFocus({
    isOpen: open,
    isPending,
    onClose: () => setOpen(false),
  });

  return (
    <div className="inline">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="bg-red-50 hover:bg-red-100 text-red-700 font-bold px-2.5 py-1 rounded text-xs border border-red-200 transition"
      >
        Delete
      </button>

      {open && (
        <div
          ref={containerRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 text-left"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`del-tr-title-${id}`}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 id={`del-tr-title-${id}`} className="font-bold text-slate-900 text-lg">
                Delete Cash Transfer
              </h3>
              <button
                ref={initialFocusRef as React.RefObject<HTMLButtonElement>}
                type="button"
                onClick={() => !isPending && setOpen(false)}
                disabled={isPending}
                aria-label="Close dialog"
                className="text-slate-400 hover:text-slate-600 font-bold text-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                &times;
              </button>
            </div>

            {state?.error && !state.fieldErrors && (
              <div role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded border border-red-200">
                {state.error}
              </div>
            )}

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={version} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5" htmlFor={`del-tr-reason-${id}`}>
                  Deletion Reason
                </label>
                <textarea
                  id={`del-tr-reason-${id}`}
                  name="deleteReason"
                  required
                  placeholder="Reason for deleting this cash transfer..."
                  aria-invalid={Boolean(state?.fieldErrors?.deleteReason)}
                  aria-describedby={state?.fieldErrors?.deleteReason ? `err-del-tr-reason-${id}` : undefined}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] resize-none"
                  rows={3}
                />
                {state?.fieldErrors?.deleteReason && (
                  <p id={`err-del-tr-reason-${id}`} className="mt-1 text-xs text-red-600">
                    {state.fieldErrors.deleteReason[0]}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => !isPending && setOpen(false)}
                  disabled={isPending}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
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
