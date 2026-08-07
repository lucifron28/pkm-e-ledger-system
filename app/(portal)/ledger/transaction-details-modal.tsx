"use client";

import { useEffect, useRef, useState } from "react";
import type { LedgerEntry } from "@/lib/data/transactions";
import { formatPesoFromCents } from "@/lib/data/money";

export function TransactionDetailsModal({
  transaction,
}: {
  transaction: Extract<LedgerEntry, { kind: "TRANSACTION" }>;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    } else if (triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [open]);

  const accountLabel = transaction.cashAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank";
  const isIncome = transaction.type === "INCOME";

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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`tx-details-title-${transaction.id}`}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 text-left max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 id={`tx-details-title-${transaction.id}`} className="font-bold text-slate-900 text-lg">
                Transaction Details
              </h3>
              <button
                ref={closeButtonRef}
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
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Financial Date</span>
                <span className="font-medium text-slate-900">{transaction.transactionDate.toLocaleDateString("en-PH")}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Date Recorded</span>
                <span className="font-medium text-slate-900">{transaction.createdAt ? new Date(transaction.createdAt).toLocaleString("en-PH") : "-"}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Type</span>
                <span className={`inline-block text-xs font-extrabold px-2 py-0.5 rounded ${isIncome ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                  {transaction.type}
                </span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Amount</span>
                <span className={`font-mono font-extrabold text-base ${isIncome ? "text-emerald-700" : "text-slate-900"}`}>
                  {formatPesoFromCents(transaction.amountCents)}
                </span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Category</span>
                <span className="font-medium text-slate-900">{transaction.categoryName || "-"}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Cash Account</span>
                <span className="font-medium text-slate-900">{accountLabel}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Document Number</span>
                <span className="font-medium text-slate-900">{transaction.documentNumber || "-"}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">{isIncome ? "Payor" : "Payee"}</span>
                <span className="font-medium text-slate-900">{transaction.counterpartyName || "-"}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Recorded By</span>
                <span className="font-medium text-slate-900">{transaction.recordedByName}</span>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100 text-sm">
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Description / Particulars</span>
                <p className="mt-0.5 text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-sm">
                  {transaction.description}
                </p>
              </div>

              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Reference Description</span>
                <p className="mt-0.5 text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-sm">
                  {transaction.referenceDescription}
                </p>
              </div>

              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Event / Activity</span>
                <p className="mt-0.5 text-slate-800 font-medium">{transaction.eventActivityName || "-"}</p>
              </div>

              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Attachments</span>
                {transaction.attachments.length === 0 ? (
                  <span className="text-xs text-slate-400">No attachment uploaded</span>
                ) : (
                  <ul className="space-y-1">
                    {transaction.attachments.map((att) => (
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
