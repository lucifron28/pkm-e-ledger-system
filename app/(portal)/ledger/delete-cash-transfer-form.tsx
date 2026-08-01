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
      {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4"><h3 className="font-bold text-slate-900 text-lg">Delete Cash Transfer</h3>{state?.error && <div className="text-sm text-red-700">{state.error}</div>}<form action={formAction} className="space-y-3"><input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={version} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} /><textarea name="deleteReason" required placeholder="Reason for deletion" className="w-full border rounded-lg p-2 text-sm" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="px-4 py-2 bg-slate-100 rounded-lg text-sm">Cancel</button><button type="submit" disabled={isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm disabled:opacity-50">{isPending ? "Deleting..." : "Confirm Delete"}</button></div></form></div></div>}
    </div>
  );
}
