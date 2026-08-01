"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deleteAttachmentAction, uploadAttachmentAction } from "@/lib/actions/attachments";
import type { AttachmentDto } from "@/lib/data/transactions";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentManager({
  transactionId,
  cashTransferId,
  attachments,
}: {
  transactionId?: string;
  cashTransferId?: string;
  attachments: AttachmentDto[];
}) {
  const [uploadState, uploadAction, uploadPending] = useActionState(uploadAttachmentAction, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteAttachmentAction, null);
  const [uploadIdempotencyKey, setUploadIdempotencyKey] = useState(() => crypto.randomUUID());
  const wasUploadPending = useRef(false);

  useEffect(() => {
    if (wasUploadPending.current && !uploadPending && !uploadState?.error) {
      setUploadIdempotencyKey(crypto.randomUUID());
    }
    wasUploadPending.current = uploadPending;
  }, [uploadPending, uploadState?.error]);

  return (
    <div className="min-w-[190px] space-y-1">
      {attachments.length === 0 ? (
        <span className="text-xs text-slate-400">None</span>
      ) : (
        attachments.map((attachment) => (
          <div key={attachment.id} className="flex items-center gap-1 text-xs">
            <a
              href={`/api/attachments/${attachment.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-[#004aad] hover:underline truncate max-w-[130px]"
              title={`${attachment.originalName} (${formatSize(attachment.sizeBytes)})`}
            >
              {attachment.originalName}
            </a>
            <form action={deleteAction}>
              <input type="hidden" name="attachmentId" value={attachment.id} />
              <input type="hidden" name="idempotencyKey" value={`delete-attachment-${attachment.id}`} />
              <button
                type="submit"
                disabled={deletePending}
                className="text-red-600 hover:underline disabled:opacity-50"
                title="Delete attachment"
              >
                ×
              </button>
            </form>
          </div>
        ))
      )}
      <form action={uploadAction} encType="multipart/form-data" className="pt-1">
        {transactionId && <input type="hidden" name="transactionId" value={transactionId} />}
        {cashTransferId && <input type="hidden" name="cashTransferId" value={cashTransferId} />}
        <input type="hidden" name="idempotencyKey" value={uploadIdempotencyKey} />
        <input
          name="file"
          type="file"
          accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
          required
          onChange={() => setUploadIdempotencyKey(crypto.randomUUID())}
          className="block w-full text-[10px] text-slate-600"
        />
        <button
          type="submit"
          disabled={uploadPending}
          className="mt-1 text-xs font-semibold text-[#004aad] hover:underline disabled:opacity-50"
        >
          {uploadPending ? "Uploading..." : "Upload attachment"}
        </button>
      </form>
      {(uploadState?.error || deleteState?.error) && (
        <p className="text-xs text-red-600">{uploadState?.error || deleteState?.error}</p>
      )}
    </div>
  );
}
