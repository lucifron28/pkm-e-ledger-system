"use client";

import { useActionState, useMemo, useState } from "react";
import { createCashTransferAction } from "@/lib/actions/transfers";

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
      {state?.error && <div className="bg-red-50 border-l-4 border-red-500 p-3 text-red-800 text-sm rounded">{state.error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
          From
          <select
            name="fromAccount"
            value={fromAccount}
            onChange={(e) => setFromAccount(e.target.value as "CASH_ON_HAND" | "CASH_IN_BANK")}
            required
            className="mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-normal normal-case"
          >
            <option value="CASH_ON_HAND">Cash on Hand</option>
            <option value="CASH_IN_BANK">Cash in Bank</option>
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
          To
          <select
            disabled
            value={toAccount}
            className="mt-1 w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm font-normal normal-case text-slate-600"
          >
            <option value="CASH_IN_BANK">Cash in Bank</option>
            <option value="CASH_ON_HAND">Cash on Hand</option>
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Date
          <input name="transferDate" type="date" required className="mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-normal normal-case" />
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Amount
          <input name="amount" type="text" inputMode="decimal" required className="mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono font-normal normal-case" />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Document Number
          <input name="documentNumber" type="text" className="mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-normal normal-case" />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Event / Activity
          <input name="eventActivityName" type="text" className="mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-normal normal-case" />
        </label>
      </div>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
        Description
        <input name="description" type="text" required className="mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-normal normal-case" />
      </label>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
        Reference
        <input name="referenceDescription" type="text" required className="mt-1 w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-normal normal-case" />
      </label>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
        Supporting Document
        <input name="attachment" type="file" required accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" className="mt-1 w-full px-3 py-2 text-sm font-normal normal-case" />
      </label>
      <button type="submit" disabled={isPending} className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow text-sm disabled:opacity-50">
        {isPending ? "Recording..." : "Record Cash Transfer"}
      </button>
    </form>
  );
}
