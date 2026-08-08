"use client";

import { useActionState, useMemo, useState } from "react";
import { createCashTransferAction } from "@/lib/actions/transfers";
import { TRANSFER_FIELD_LIMITS } from "@/lib/domain/field-limits";

interface CreateCashTransferFormProps {
  activeTermId: string;
}

export function CreateCashTransferForm({ activeTermId }: CreateCashTransferFormProps) {
  const [state, formAction, isPending] = useActionState(createCashTransferAction, null);
  const [fromAccount, setFromAccount] = useState<"CASH_ON_HAND" | "CASH_IN_BANK">("CASH_ON_HAND");
  const toAccount = fromAccount === "CASH_ON_HAND" ? "CASH_IN_BANK" : "CASH_ON_HAND";
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-4">
      <input type="hidden" name="termId" value={activeTermId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="toAccount" value={toAccount} />
      {state?.error && (
        <div role="alert" className="bg-red-50 border-l-4 border-red-500 p-3 text-red-800 text-sm rounded">{state.error}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="create-transfer-from" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">From Account</label>
          <select
            id="create-transfer-from"
            name="fromAccount"
            value={fromAccount}
            onChange={(e) => setFromAccount(e.target.value as "CASH_ON_HAND" | "CASH_IN_BANK")}
            required
            aria-invalid={Boolean(state?.fieldErrors?.fromAccount)}
            aria-describedby={state?.fieldErrors?.fromAccount ? "create-transfer-from-error" : undefined}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
          >
            <option value="CASH_ON_HAND">Cash on Hand</option>
            <option value="CASH_IN_BANK">Cash in Bank</option>
          </select>
          {state?.fieldErrors?.fromAccount && <p id="create-transfer-from-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.fromAccount[0]}</p>}
        </div>

        <div>
          <label htmlFor="create-transfer-to-display" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">To Account</label>
          <input
            id="create-transfer-to-display"
            type="text"
            readOnly
            value={toAccount === "CASH_IN_BANK" ? "Cash in Bank" : "Cash on Hand"}
            className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-700 font-medium cursor-not-allowed"
          />
        </div>

        <div>
          <label htmlFor="create-transfer-date" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Transfer Date</label>
          <input
            id="create-transfer-date"
            name="transferDate"
            type="date"
            required
            aria-invalid={Boolean(state?.fieldErrors?.transferDate)}
            aria-describedby={state?.fieldErrors?.transferDate ? "create-transfer-date-error" : undefined}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
          />
          {state?.fieldErrors?.transferDate && <p id="create-transfer-date-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.transferDate[0]}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="create-transfer-amount" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Amount (₱)</label>
          <input
            id="create-transfer-amount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            placeholder="0.00"
            aria-invalid={Boolean(state?.fieldErrors?.amount)}
            aria-describedby={state?.fieldErrors?.amount ? "create-transfer-amount-error" : undefined}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono"
          />
          {state?.fieldErrors?.amount && <p id="create-transfer-amount-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.amount[0]}</p>}
        </div>

        <div>
          <label htmlFor="create-transfer-doc-number" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Document Number</label>
          <input
            id="create-transfer-doc-number"
            name="documentNumber"
            type="text"
            maxLength={TRANSFER_FIELD_LIMITS.documentNumber}
            placeholder="e.g. TR-001"
            aria-invalid={Boolean(state?.fieldErrors?.documentNumber)}
            aria-describedby={state?.fieldErrors?.documentNumber ? "create-transfer-doc-number-error" : undefined}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
          />
          {state?.fieldErrors?.documentNumber && <p id="create-transfer-doc-number-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.documentNumber[0]}</p>}
        </div>

        <div>
          <label htmlFor="create-transfer-event" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Event / Activity Name</label>
          <input
            id="create-transfer-event"
            name="eventActivityName"
            type="text"
            maxLength={TRANSFER_FIELD_LIMITS.eventActivityName}
            placeholder="Associated event/activity"
            aria-invalid={Boolean(state?.fieldErrors?.eventActivityName)}
            aria-describedby={state?.fieldErrors?.eventActivityName ? "create-transfer-event-error" : undefined}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
          />
          {state?.fieldErrors?.eventActivityName && <p id="create-transfer-event-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.eventActivityName[0]}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="create-transfer-description" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Description</label>
        <input
          id="create-transfer-description"
          name="description"
          type="text"
          required
          maxLength={TRANSFER_FIELD_LIMITS.description}
          placeholder="Reason for cash transfer"
          aria-invalid={Boolean(state?.fieldErrors?.description)}
          aria-describedby={state?.fieldErrors?.description ? "create-transfer-desc-error" : undefined}
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
        />
        {state?.fieldErrors?.description && <p id="create-transfer-desc-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.description[0]}</p>}
      </div>

      <div>
        <label htmlFor="create-transfer-reference" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Reference / Attachment Description</label>
        <input
          id="create-transfer-reference"
          name="referenceDescription"
          type="text"
          required
          maxLength={TRANSFER_FIELD_LIMITS.referenceDescription}
          placeholder="Notes about deposit slip or receipt"
          aria-invalid={Boolean(state?.fieldErrors?.referenceDescription)}
          aria-describedby={state?.fieldErrors?.referenceDescription ? "create-transfer-ref-error" : undefined}
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
        />
        {state?.fieldErrors?.referenceDescription && <p id="create-transfer-ref-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.referenceDescription[0]}</p>}
      </div>

      <div>
        <label htmlFor="create-transfer-attachment" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">Supporting Document Attachment</label>
        <input
          id="create-transfer-attachment"
          name="attachment"
          type="file"
          required
          accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
          aria-invalid={Boolean(state?.fieldErrors?.attachment)}
          aria-describedby={state?.fieldErrors?.attachment ? "create-transfer-att-error" : undefined}
          className="w-full px-3 py-2 text-sm font-normal normal-case"
        />
        {state?.fieldErrors?.attachment && <p id="create-transfer-att-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.attachment[0]}</p>}
      </div>

      <button type="submit" disabled={isPending} className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow text-sm disabled:opacity-50">
        {isPending ? "Recording..." : "Record Cash Transfer"}
      </button>
    </form>
  );
}
