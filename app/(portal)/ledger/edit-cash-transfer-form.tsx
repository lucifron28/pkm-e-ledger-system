"use client";

import { useActionState, useMemo, useState } from "react";
import { editCashTransferAction } from "@/lib/actions/transfers";
import type { LedgerEntry } from "@/lib/data/transactions";
import { formatPesoInputFromCents } from "@/lib/data/money";

export function EditCashTransferForm({ transfer }: { transfer: Extract<LedgerEntry, { kind: "TRANSFER" }> }) {
  const [state, formAction, isPending] = useActionState(editCashTransferAction, null);
  const [open, setOpen] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const date = transfer.transferDate.toISOString().slice(0, 10);

  return (
    <div className="inline">
      <button type="button" onClick={() => setOpen(true)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded text-xs border border-slate-300">Edit</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900 text-lg">Edit Cash Transfer</h3><button type="button" onClick={() => setOpen(false)} className="text-slate-500 text-xl">&times;</button></div>
            {state?.error && <div className="bg-red-50 border-l-4 border-red-500 p-3 text-red-800 text-sm rounded">{state.error}</div>}
            <form action={formAction} className="space-y-3">
              <input type="hidden" name="id" value={transfer.id} />
              <input type="hidden" name="version" value={transfer.version} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <div className="grid grid-cols-2 gap-3">
                <select name="fromAccount" defaultValue={transfer.fromAccount} className="px-3 py-2 border rounded-lg text-sm"><option value="CASH_ON_HAND">Cash on Hand</option><option value="CASH_IN_BANK">Cash in Bank</option></select>
                <select name="toAccount" defaultValue={transfer.toAccount} className="px-3 py-2 border rounded-lg text-sm"><option value="CASH_IN_BANK">Cash in Bank</option><option value="CASH_ON_HAND">Cash on Hand</option></select>
                <input name="transferDate" type="date" defaultValue={date} required className="px-3 py-2 border rounded-lg text-sm" />
                <input name="amount" type="text" inputMode="decimal" defaultValue={formatPesoInputFromCents(transfer.amountCents)} required className="px-3 py-2 border rounded-lg text-sm font-mono" />
                <input name="documentNumber" defaultValue={transfer.documentNumber || ""} placeholder="Document number" className="px-3 py-2 border rounded-lg text-sm" />
                <input name="eventActivityName" defaultValue={transfer.eventActivityName || ""} placeholder="Event / Activity" className="px-3 py-2 border rounded-lg text-sm" />
              </div>
              <input name="description" defaultValue={transfer.description} required placeholder="Description" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input name="referenceDescription" defaultValue={transfer.referenceDescription} required placeholder="Reference" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="px-4 py-2 bg-slate-100 rounded-lg text-sm">Cancel</button><button type="submit" disabled={isPending} className="px-4 py-2 bg-[#004aad] text-white rounded-lg text-sm disabled:opacity-50">{isPending ? "Saving..." : "Save Changes"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
