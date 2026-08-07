"use client";

import { useActionState, useMemo, useState } from "react";
import { softDeleteCashTransferAction } from "@/lib/actions/transfers";

export function DeleteCashTransferForm({ id, version }: { id: string; version: number }) {
  const [state, formAction, isPending] = useActionState(softDeleteCashTransferAction, null);
  const [open, setOpen] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  return (
    <div className="inline">
      <button type="button" onClick={() => setOpen(true)} className="bg-red-50 hover:bg-red-100 text-red-700 font-bold px-2.5 py-1 rounded text-xs border border-red-200">Delete</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" tabIndex={-1} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby={`del-tr-title-${id}`} className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 id={`del-tr-title-${id}`} className="font-bold text-slate-900 text-lg">Delete Cash Transfer</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close dialog" className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
            </div>
            {state?.error && <div role="alert" className="text-sm text-red-700 bg-red-50 p-2.5 rounded border border-red-200">{state.error}</div>}
            <form action={formAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={version} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1" htmlFor={`del-reason-${id}`}>Deletion Reason</label>
                <textarea id={`del-reason-${id}`} name="deleteReason" required placeholder="Reason for deletion" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm resize-none" rows={3} />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-semibold">Cancel</button>
                <button type="submit" disabled={isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">{isPending ? "Deleting..." : "Confirm Delete"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
