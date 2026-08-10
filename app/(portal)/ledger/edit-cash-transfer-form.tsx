"use client";

import { useActionState, useMemo, useState } from "react";
import { editCashTransferAction } from "@/lib/actions/transfers";
import type { LedgerEntry } from "@/lib/data/transactions";
import { formatPesoInputFromCents } from "@/lib/data/money";
import { useModalFocus } from "@/lib/hooks/use-modal-focus";
import { TRANSFER_FIELD_LIMITS } from "@/lib/domain/field-limits";
import { IconX as X } from "@tabler/icons-react";

export function EditCashTransferForm({ transfer }: { transfer: Extract<LedgerEntry, { kind: "TRANSFER" }> }) {
  const [state, formAction, isPending] = useActionState(editCashTransferAction, null);
  const [open, setOpen] = useState(false);
  const [fromAccount, setFromAccount] = useState<"CASH_ON_HAND" | "CASH_IN_BANK">(transfer.fromAccount as "CASH_ON_HAND" | "CASH_IN_BANK");
  const toAccount = fromAccount === "CASH_ON_HAND" ? "CASH_IN_BANK" : "CASH_ON_HAND";
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const date = transfer.transferDate.toISOString().slice(0, 10);

  const { triggerRef, containerRef, initialFocusRef, handleKeyDown } = useModalFocus<HTMLInputElement>({
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
        className="ui-button ui-button-secondary px-3 text-xs"
      >
        Edit
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
            aria-labelledby={`edit-tr-title-${transfer.id}`}
            className="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200"
          >
            <div className="px-6 py-4 bg-[#004aad] text-white flex items-center justify-between">
              <h3 id={`edit-tr-title-${transfer.id}`} className="font-bold text-[#f9d818] text-base">
                Edit Cash Transfer
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="ui-icon-button border-blue-200 bg-white/10 text-white hover:bg-white/20"
                aria-label="Close edit cash transfer dialog"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <form action={formAction} className="p-6 space-y-4" aria-busy={isPending}>
              <input type="hidden" name="id" value={transfer.id} />
              <input type="hidden" name="version" value={transfer.version} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <input type="hidden" name="toAccount" value={toAccount} />

              {state?.error && (
                <div role="alert" aria-live="assertive" className="ui-status ui-status-danger">
                  {state.error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`edit-tr-from-${transfer.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    From Account
                  </label>
                  <select
                    id={`edit-tr-from-${transfer.id}`}
                    name="fromAccount"
                    value={fromAccount}
                    onChange={(e) => setFromAccount(e.target.value as "CASH_ON_HAND" | "CASH_IN_BANK")}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  >
                    <option value="CASH_ON_HAND">Cash on Hand</option>
                    <option value="CASH_IN_BANK">Cash in Bank</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={`edit-tr-to-${transfer.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    To Account
                  </label>
                  <input
                    id={`edit-tr-to-${transfer.id}`}
                    type="text"
                    readOnly
                    value={toAccount === "CASH_IN_BANK" ? "Cash in Bank" : "Cash on Hand"}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-600 font-medium cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor={`edit-tr-date-${transfer.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Date
                  </label>
                  <input
                    ref={initialFocusRef}
                    id={`edit-tr-date-${transfer.id}`}
                    name="transferDate"
                    type="date"
                    required
                    defaultValue={date}
                    aria-invalid={Boolean(state?.fieldErrors?.transferDate)}
                    aria-describedby={state?.fieldErrors?.transferDate ? `err-tr-date-${transfer.id}` : undefined}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  />
                  {state?.fieldErrors?.transferDate && (
                    <p id={`err-tr-date-${transfer.id}`} className="mt-1 text-xs text-red-600">
                      {state.fieldErrors.transferDate[0]}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor={`edit-tr-amount-${transfer.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Amount (PHP)
                  </label>
                  <input
                    id={`edit-tr-amount-${transfer.id}`}
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    required
                    defaultValue={formatPesoInputFromCents(transfer.amountCents)}
                    aria-invalid={Boolean(state?.fieldErrors?.amount)}
                    aria-describedby={state?.fieldErrors?.amount ? `err-tr-amount-${transfer.id}` : undefined}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  />
                  {state?.fieldErrors?.amount && (
                    <p id={`err-tr-amount-${transfer.id}`} className="mt-1 text-xs text-red-600">
                      {state.fieldErrors.amount[0]}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor={`edit-tr-doc-${transfer.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Document Number
                  </label>
                  <input
                    id={`edit-tr-doc-${transfer.id}`}
                    name="documentNumber"
                    type="text"
                    maxLength={TRANSFER_FIELD_LIMITS.documentNumber}
                    defaultValue={transfer.documentNumber || ""}
                    placeholder="Document number"
                    aria-invalid={Boolean(state?.fieldErrors?.documentNumber)}
                    aria-describedby={state?.fieldErrors?.documentNumber ? `err-tr-doc-${transfer.id}` : undefined}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  />
                  {state?.fieldErrors?.documentNumber && (
                    <p id={`err-tr-doc-${transfer.id}`} className="mt-1 text-xs text-red-600">
                      {state.fieldErrors.documentNumber[0]}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor={`edit-tr-event-${transfer.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Event / Activity
                </label>
                <input
                  id={`edit-tr-event-${transfer.id}`}
                  name="eventActivityName"
                  type="text"
                  maxLength={TRANSFER_FIELD_LIMITS.eventActivityName}
                  defaultValue={transfer.eventActivityName || ""}
                  placeholder="Event / Activity"
                  aria-invalid={Boolean(state?.fieldErrors?.eventActivityName)}
                  aria-describedby={state?.fieldErrors?.eventActivityName ? `err-tr-event-${transfer.id}` : undefined}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                />
                {state?.fieldErrors?.eventActivityName && (
                  <p id={`err-tr-event-${transfer.id}`} className="mt-1 text-xs text-red-600">
                    {state.fieldErrors.eventActivityName[0]}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor={`edit-tr-desc-${transfer.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Particulars / Description
                </label>
                <input
                  id={`edit-tr-desc-${transfer.id}`}
                  name="description"
                  type="text"
                  maxLength={TRANSFER_FIELD_LIMITS.description}
                  defaultValue={transfer.description}
                  required
                  placeholder="Description"
                  aria-invalid={Boolean(state?.fieldErrors?.description)}
                  aria-describedby={state?.fieldErrors?.description ? `err-tr-desc-${transfer.id}` : undefined}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                />
                {state?.fieldErrors?.description && (
                  <p id={`err-tr-desc-${transfer.id}`} className="mt-1 text-xs text-red-600">
                    {state.fieldErrors.description[0]}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor={`edit-tr-ref-${transfer.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Reference Description
                </label>
                <input
                  id={`edit-tr-ref-${transfer.id}`}
                  name="referenceDescription"
                  type="text"
                  maxLength={TRANSFER_FIELD_LIMITS.referenceDescription}
                  defaultValue={transfer.referenceDescription}
                  required
                  placeholder="Reference"
                  aria-invalid={Boolean(state?.fieldErrors?.referenceDescription)}
                  aria-describedby={state?.fieldErrors?.referenceDescription ? `err-tr-ref-${transfer.id}` : undefined}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                />
                {state?.fieldErrors?.referenceDescription && (
                  <p id={`err-tr-ref-${transfer.id}`} className="mt-1 text-xs text-red-600">
                    {state.fieldErrors.referenceDescription[0]}
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
                  className="ui-button ui-button-primary disabled:opacity-50"
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
