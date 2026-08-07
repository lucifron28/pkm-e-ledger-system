"use client";

import { useState } from "react";
import type { LedgerEntry } from "@/lib/data/transactions";
import { formatPesoFromCents } from "@/lib/data/money";
import { useModalFocus } from "@/lib/hooks/use-modal-focus";

export function CashTransferDetailsModal({ transfer }: { transfer: Extract<LedgerEntry, { kind: "TRANSFER" }> }) {
  const [open, setOpen] = useState(false);
  const { triggerRef, containerRef, initialFocusRef, handleKeyDown } = useModalFocus({
    isOpen: open,
    onClose: () => setOpen(false),
  });

  const fromLabel = transfer.fromAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank";
  const toLabel = transfer.toAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank";

  return (
    <div className="inline">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="bg-blue-50 hover:bg-blue-100 text-[#004aad] font-bold px-2.5 py-1 rounded text-xs border border-blue-200 transition"
      >
        Details
      </button>

      {open && (
        <div
          ref={containerRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`ct-details-title-${transfer.id}`}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 text-left max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 id={`ct-details-title-${transfer.id}`} className="font-bold text-slate-900 text-lg">
                Cash Transfer Details
              </h3>
              <button
                ref={initialFocusRef as React.RefObject<HTMLButtonElement>}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close details dialog"
                className="text-slate-400 hover:text-slate-600 font-bold text-xl"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Transfer Date</span>
                <span className="font-medium text-slate-900">{transfer.transferDate.toLocaleDateString("en-PH")}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Date Recorded</span>
                <span className="font-medium text-slate-900">{transfer.createdAt ? new Date(transfer.createdAt).toLocaleString("en-PH") : "-"}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Amount</span>
                <span className="font-mono font-extrabold text-[#004aad] text-base">
                  {formatPesoFromCents(transfer.amountCents)}
                </span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">From Account</span>
                <span className="font-medium text-slate-900">{fromLabel}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">To Account</span>
                <span className="font-medium text-slate-900">{toLabel}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Document Number</span>
                <span className="font-medium text-slate-900">{transfer.documentNumber || "-"}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Event / Activity</span>
                <span className="font-medium text-slate-900">{transfer.eventActivityName || "-"}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Recorded By</span>
                <span className="font-medium text-slate-900">{transfer.recordedByName}</span>
              </div>
            </div>

            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Particulars / Description</span>
              <p className="mt-1 text-sm text-slate-800 bg-slate-50 p-2.5 rounded border border-slate-200 font-medium">
                {transfer.description}
              </p>
            </div>

            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Reference / Attachment Description</span>
              <p className="mt-1 text-sm text-slate-800 bg-slate-50 p-2.5 rounded border border-slate-200">
                {transfer.referenceDescription}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
