"use client";

import { useState } from "react";
import type { LedgerEntry } from "@/lib/data/transactions";
import { formatPesoFromCents } from "@/lib/data/money";

export function CashTransferDetailsModal({ transfer }: { transfer: Extract<LedgerEntry, { kind: "TRANSFER" }> }) {
  const [open, setOpen] = useState(false);

  const fromLabel = transfer.fromAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank";
  const toLabel = transfer.toAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank";

  return (
    <div className="inline">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-blue-50 hover:bg-blue-100 text-[#004aad] font-bold px-2.5 py-1 rounded text-xs border border-blue-200 transition"
      >
        Details
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`ct-details-title-${transfer.id}`}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 text-left"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 id={`ct-details-title-${transfer.id}`} className="font-bold text-slate-900 text-lg">
                Cash Transfer Details
              </h3>
              <button
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
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Recorded By</span>
                <span className="font-medium text-slate-900">{transfer.recordedByName}</span>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100 text-sm">
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Description / Particulars</span>
                <p className="mt-0.5 text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-sm">
                  {transfer.description}
                </p>
              </div>

              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Reference Description</span>
                <p className="mt-0.5 text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-sm">
                  {transfer.referenceDescription}
                </p>
              </div>

              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Event / Activity</span>
                <p className="mt-0.5 text-slate-800 font-medium">{transfer.eventActivityName || "-"}</p>
              </div>

              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Attachments</span>
                {transfer.attachments.length === 0 ? (
                  <span className="text-xs text-slate-400">No attachment uploaded</span>
                ) : (
                  <ul className="space-y-1">
                    {transfer.attachments.map((att) => (
                      <li key={att.id}>
                        <a
                          href={`/api/attachments/${att.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#004aad] font-semibold hover:underline text-xs flex items-center gap-1"
                        >
                          <span>📎</span> {att.originalName} ({Math.ceil(att.sizeBytes / 1024)} KB)
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-sm transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
