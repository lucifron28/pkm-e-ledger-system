"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload as uploadToBlob } from "@vercel/blob/client";
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
  const [blobUploadPending, setBlobUploadPending] = useState(false);
  const [blobUploadError, setBlobUploadError] = useState<string | null>(null);
  const blobFileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const wasUploadPending = useRef(false);
  const usesBlobStorage = process.env.NEXT_PUBLIC_ATTACHMENT_STORAGE_PROVIDER === "vercel-blob";

  async function handleBlobUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = blobFileInputRef.current?.files?.[0];
    if (!file) {
      setBlobUploadError("File is required.");
      return;
    }

    setBlobUploadPending(true);
    setBlobUploadError(null);
    try {
      const owner = transactionId ? { transactionId } : { cashTransferId };
      const prepareResponse = await fetch("/api/attachments/upload/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...owner, originalName: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      const prepareBody = (await prepareResponse.json()) as { stagedKey?: string; clientPayload?: string; error?: string };
      if (!prepareResponse.ok || !prepareBody.stagedKey || !prepareBody.clientPayload) {
        throw new Error(prepareBody.error || "Could not prepare attachment upload.");
      }

      const uploaded = await uploadToBlob(prepareBody.stagedKey, file, {
        access: "private",
        handleUploadUrl: "/api/attachments/upload",
        clientPayload: prepareBody.clientPayload,
        contentType: file.type,
      });

      const finalizeResponse = await fetch("/api/attachments/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...owner,
          stagedKey: uploaded.pathname,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const finalizeBody = (await finalizeResponse.json()) as { error?: string };
      if (!finalizeResponse.ok) throw new Error(finalizeBody.error || "Could not finalize attachment upload.");

      if (blobFileInputRef.current) blobFileInputRef.current.value = "";
      router.refresh();
    } catch (error) {
      setBlobUploadError(error instanceof Error ? error.message : "Could not upload attachment.");
    } finally {
      setBlobUploadPending(false);
    }
  }

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
      {usesBlobStorage ? (
        <form onSubmit={handleBlobUpload} className="pt-1">
          <input
            ref={blobFileInputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
            required
            className="block w-full text-[10px] text-slate-600"
          />
          <button
            type="submit"
            disabled={blobUploadPending}
            className="mt-1 text-xs font-semibold text-[#004aad] hover:underline disabled:opacity-50"
          >
            {blobUploadPending ? "Uploading..." : "Upload attachment"}
          </button>
        </form>
      ) : (
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
      )}
      {(uploadState?.error || blobUploadError || deleteState?.error) && (
        <p className="text-xs text-red-600">{uploadState?.error || blobUploadError || deleteState?.error}</p>
      )}
    </div>
  );
}
