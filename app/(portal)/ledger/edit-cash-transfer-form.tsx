"use client";

import { useActionState, useMemo, useState } from "react";
import { editCashTransferAction } from "@/lib/actions/transfers";
import type { LedgerEntry } from "@/lib/data/transactions";
import { formatPesoInputFromCents } from "@/lib/data/money";
import { useModalFocus } from "@/lib/hooks/use-modal-focus";

export function EditCashTransferForm({ transfer }: { transfer: Extract<LedgerEntry, { kind: "TRANSFER" }> }) {
  const [state, formAction, isPending] = useActionState(editCashTransferAction, null);
  const [open, setOpen] = useState(false);
  const [fromAccount, setFromAccount] = useState<"CASH_ON_HAND" | "CASH_IN_BANK">(transfer.fromAccount as "CASH_ON_HAND" | "CASH_IN_BANK");
  const toAccount = fromAccount === "CASH_ON_HAND" ? "CASH_IN_BANK" : "CASH_ON_HAND";
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const date = transfer.transferDate.toISOString().slice(0, 10);

  const { triggerRef, containerRef, initialFocusRef, handleKeyDown } = useModalFocus({
    isOpen: open,
    onClose: () => setOpen(false),
  });

  return (
    <div className="inline">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded text-xs border border-slate-300 transition"
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
            aria-labelledby={`edit-transfer-heading-${transfer.id}`}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 id={`edit-transfer-heading-${transfer.id}`} className="font-bold text-slate-900 text-lg">
                Edit Cash Transfer
              </h3>
              <button
                ref={initialFocusRef as React.RefObject<HTMLButtonElement>}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close modal"
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
              <input type="hidden" name="id" value={transfer.id} />
              <input type="hidden" name="version" value={transfer.version} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <input type="hidden" name="toAccount" value={toAccount} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`edit-from-${transfer.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    From Account
                  </label>
                  <select
                    id={`edit-from-${transfer.id}`}
                    name="fromAccount"
                    value={fromAccount}
                    onChange={(e) => setFromAccount(e.target.value as "CASH_ON_HAND" | "CASH_IN_BANK")}
                    aria-invalid={Boolean(state?.fieldErrors?.fromAccount)}
                    aria-describedby={state?.fieldErrors?.fromAccount ? `err-from-${transfer.id}` : undefined}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad]"
                  >
                    <option value="CASH_ON_HAND">Cash on Hand</option>
                    <option value="CASH_IN_BANK">Cash in Bank</option>
                  </select>
                  {state?.fieldErrors?.fromAccount && (
                    <p id={`err-from-${transfer.id}`} className="mt-1 text-xs text-red-600">
                      {state.fieldErrors.fromAccount[0]}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor={`edit-to-${transfer.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    To Account
                  </label>
                  <select
                    id={`edit-to-${transfer.id}`}
                    disabled
                    value={toAccount}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-slate-100 text-slate-600"
                  >
                    <option value="CASH_IN_BANK">Cash in Bank</option>
                    <option value="CASH_ON_HAND">Cash on Hand</option>
                  </select>
                </div>

                <div>
                  <label htmlFor={`edit-[#tr-date-${transfer.id}]`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Transfer Date
                  </label>
                  <input
                    id={`edit-[#tr-date-${transfer.id}]`}
                    name="transferDate"
                    type="date"
                    defaultValue={date}
                    required
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
                    Amount
                  </label>
                  <input
                    id={`edit-tr-amount-${transfer.id}`}
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    defaultValue={formatPesoInputFromCents(transfer.amountCents)}
                    required
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

                <div>
                  <label htmlFor={`edit-tr-event-${transfer.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Event / Activity
                  </label>
                  <input
                    id={`edit-tr-event-${transfer.id}`}
                    name="eventActivityName"
                    type="text"
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
              </div>

              <div>
                <label htmlFor={`edit-tr-desc-${transfer.id}`} className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Particulars / Description
                </label>
                <input
                  id={`edit-tr-desc-${transfer.id}`}
                  name="description"
                  type="text"
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
                  onClick={() => setOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-sm transition"
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
