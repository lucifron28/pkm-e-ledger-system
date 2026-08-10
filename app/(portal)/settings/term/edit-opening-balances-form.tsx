"use client";

import { useActionState, useState, useMemo } from "react";
import { updateOpeningBalancesAction } from "@/lib/actions/terms";
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
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  return (
    <div className="relative">
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="ui-button ui-button-secondary px-3 text-xs"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        >
          Edit Balances
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
          <div className="w-full max-w-md space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="edit-opening-balances-title">
            <div className="flex items-center justify-between">
              <h3 id="edit-opening-balances-title" className="font-extrabold text-slate-900">
                Edit Opening Balances
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="ui-icon-button"
                aria-label="Close opening balances dialog"
                title="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {state?.error && !state.fieldErrors && (
              <div role="alert" aria-live="assertive" className="ui-status ui-status-danger"><p>{state.error}</p></div>
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
                  id={`cohand-${termId}`}
                  name="openingCashOnHand"
                  type="text"
                  inputMode="decimal"
                  required
                  defaultValue={initialCashOnHand}
                  className="ui-input font-mono"
                />
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
                  className="ui-input font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
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
