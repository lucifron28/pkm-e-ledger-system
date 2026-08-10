"use client";

import { useState } from "react";
import type { LedgerEntry } from "@/lib/data/transactions";
import { formatPesoFromCents } from "@/lib/data/money";
import { useModalFocus } from "@/lib/hooks/use-modal-focus";
import { IconX as X } from "@tabler/icons-react";

export function TransactionDetailsModal({
  transaction,
}: {
  transaction: Extract<LedgerEntry, { kind: "TRANSACTION" }>;
}) {
  const [open, setOpen] = useState(false);
  const { triggerRef, containerRef, initialFocusRef, handleKeyDown } = useModalFocus({
    isOpen: open,
    onClose: () => setOpen(false),
  });

  const accountLabel = transaction.cashAccount === "CASH_ON_HAND" ? "Cash on Hand" : "Cash in Bank";
  const isIncome = transaction.type === "INCOME";

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
            aria-labelledby={`tx-details-title-${transaction.id}`}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 text-left max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 id={`tx-details-title-${transaction.id}`} className="font-bold text-slate-900 text-lg">
                Transaction Details
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
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  {transaction.type === "INCOME" ? "Payor Name" : "Payee Name"}
                </span>
                <span className="font-medium text-slate-900">{transaction.counterpartyName || "-"}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Event / Activity</span>
                <span className="font-medium text-slate-900">{transaction.eventActivityName || "-"}</span>
              </div>
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Recorded By</span>
                <span className="font-medium text-slate-900">{transaction.recordedByName}</span>
              </div>
            </div>

            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Particulars / Description</span>
              <p className="mt-1 text-sm text-slate-800 bg-slate-50 p-2.5 rounded border border-slate-200 font-medium">
                {transaction.description}
              </p>
            </div>

            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Reference / Attachment Description</span>
              <p className="mt-1 text-sm text-slate-800 bg-slate-50 p-2.5 rounded border border-slate-200">
                {transaction.referenceDescription}
              </p>
            </div>

            {transaction.attachments && transaction.attachments.length > 0 && (
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Attachments</span>
                <div className="space-y-1.5">
                  {transaction.attachments.map((att) => (
                    <div key={att.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded text-xs border border-slate-200">
                      <span className="truncate max-w-[240px] font-medium text-slate-700">{att.originalName}</span>
                      <a
                        href={`/api/attachments/${att.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#004aad] hover:underline font-bold"
                      >
                        Download
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
