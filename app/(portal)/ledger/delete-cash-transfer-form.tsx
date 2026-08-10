"use client";

import { useActionState, useMemo, useState } from "react";
import { softDeleteCashTransferAction } from "@/lib/actions/transfers";
import { useModalFocus } from "@/lib/hooks/use-modal-focus";
import { IconX as X } from "@tabler/icons-react";

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
        className="ui-button ui-button-danger px-3 text-xs"
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
                className="ui-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {state?.error && !state.fieldErrors && (
              <div role="alert" aria-live="assertive" className="ui-status ui-status-danger"><p>{state.error}</p></div>
            )}

            <form action={formAction} className="space-y-4" aria-busy={isPending}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={version} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

              <div>
                <label className="ui-label" htmlFor={`del-tr-reason-${id}`}>Deletion reason</label>
                <textarea
                  id={`del-tr-reason-${id}`}
                  name="deleteReason"
                  required
                  placeholder="Reason for deleting this cash transfer..."
                  aria-invalid={Boolean(state?.fieldErrors?.deleteReason)}
                  aria-describedby={state?.fieldErrors?.deleteReason ? `err-del-tr-reason-${id}` : undefined}
                  className="ui-textarea"
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
                  className="ui-button ui-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="ui-button ui-button-danger disabled:opacity-50"
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
