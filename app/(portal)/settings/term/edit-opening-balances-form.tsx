"use client";

import { useEffect, useId, useMemo, useRef, useState, useActionState } from "react";
import { updateOpeningBalancesAction } from "@/lib/actions/terms";
import { useModalFocus } from "@/lib/hooks/use-modal-focus";
import { IconX as X } from "@tabler/icons-react";

interface EditOpeningBalancesFormProps {
  termId: string;
  version?: number;
  initialCashOnHand: string;
  initialCashInBank: string;
}

export function EditOpeningBalancesForm({
  termId,
  version = 1,
  initialCashOnHand,
  initialCashInBank,
}: EditOpeningBalancesFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateOpeningBalancesAction,
    null
  );
  const [isOpen, setIsOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const formId = useId();

  const { triggerRef, containerRef, initialFocusRef, handleKeyDown } = useModalFocus<HTMLInputElement>({
    isOpen,
    isPending,
    onClose: () => setIsOpen(false),
  });

  const wasPendingRef = useRef(false);
  useEffect(() => {
    if (wasPendingRef.current && !isPending && !state?.error) {
      setIsOpen(false);
      setSaveSuccess(true);
      const timer = setTimeout(() => setSaveSuccess(false), 4000);
      return () => clearTimeout(timer);
    }
    wasPendingRef.current = isPending;
  }, [isPending, state?.error]);

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className="ui-button ui-button-secondary px-3 text-xs"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        Edit Balances
      </button>

      {saveSuccess && (
        <span
          role="status"
          aria-live="polite"
          className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
        >
          Balances updated
        </span>
      )}

      {isOpen && (
        <div
          ref={containerRef}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`edit-opening-balances-title-${formId}`}
            className="w-full max-w-md space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-2xl text-left"
          >
            <div className="flex items-center justify-between">
              <h3 id={`edit-opening-balances-title-${formId}`} className="font-extrabold text-slate-900">
                Edit Opening Balances
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
                className="ui-icon-button"
                aria-label="Close opening balances dialog"
                title="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {state?.error && !state.fieldErrors && (
              <div role="alert" aria-live="assertive" className="ui-status ui-status-danger">
                <p>{state.error}</p>
              </div>
            )}

            <form action={formAction} className="space-y-4" aria-busy={isPending}>
              <input type="hidden" name="termId" value={termId} />
              <input type="hidden" name="version" value={version} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

              <div>
                <label
                  htmlFor={`cohand-${termId}`}
                  className="ui-label"
                >
                  Opening Cash on Hand
                </label>
                <input
                  ref={initialFocusRef}
                  id={`cohand-${termId}`}
                  name="openingCashOnHand"
                  type="text"
                  inputMode="decimal"
                  required
                  defaultValue={initialCashOnHand}
                  aria-invalid={Boolean(state?.fieldErrors?.openingCashOnHand)}
                  aria-describedby={state?.fieldErrors?.openingCashOnHand ? `err-cohand-${termId}` : undefined}
                  className="ui-input font-mono"
                />
                {state?.fieldErrors?.openingCashOnHand && (
                  <p id={`err-cohand-${termId}`} role="alert" className="mt-1 text-xs text-red-600 font-medium">
                    {state.fieldErrors.openingCashOnHand[0]}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor={`cibank-${termId}`}
                  className="ui-label"
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
                  aria-invalid={Boolean(state?.fieldErrors?.openingCashInBank)}
                  aria-describedby={state?.fieldErrors?.openingCashInBank ? `err-cibank-${termId}` : undefined}
                  className="ui-input font-mono"
                />
                {state?.fieldErrors?.openingCashInBank && (
                  <p id={`err-cibank-${termId}`} role="alert" className="mt-1 text-xs text-red-600 font-medium">
                    {state.fieldErrors.openingCashInBank[0]}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isPending}
                  className="ui-button ui-button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="ui-button ui-button-primary"
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
