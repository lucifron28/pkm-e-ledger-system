"use client";

import { useState } from "react";
import type { LedgerEntry } from "@/lib/data/transactions";
import { formatPesoFromCents } from "@/lib/data/money";
import { useModalFocus } from "@/lib/hooks/use-modal-focus";
import { IconX as X } from "@tabler/icons-react";

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
        className="ui-button ui-button-secondary px-3 text-xs"
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
                className="ui-icon-button"
              >
                <X size={18} aria-hidden="true" />
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
              <p className="mt-1 text-sm text-slate-800 bg-slate-50 p-2.5 rounded border border-slate-200 font-medium">
                {transfer.referenceDescription}
              </p>
            </div>

            {transfer.attachments && transfer.attachments.length > 0 && (
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Attachments</span>
                <div className="space-y-1.5">
                  {transfer.attachments.map((att) => (
                    <div key={att.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded text-xs border border-slate-200">
                      <span className="truncate max-w-[240px] font-medium text-slate-700">
                        {att.originalName} {att.sizeBytes ? `(${Math.round(att.sizeBytes / 1024)} KB)` : ""}
                      </span>
                      <a
                        href={`/api/attachments/${att.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#004aad] hover:underline font-bold"
                      >
                        Download / View
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
