"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { deleteAttachmentAction, uploadAttachmentAction } from "@/lib/actions/attachments";
import type { AttachmentDto } from "@/lib/data/transactions";
import {
  uploadAttachmentDirectly,
  validateUploadFile,
} from "@/lib/infrastructure/storage/client-upload";
import { useModalFocus } from "@/lib/hooks/use-modal-focus";
import {
  IconPaperclip as Paperclip,
  IconTrash as Trash,
  IconX as X,
} from "@tabler/icons-react";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DeleteConfirmModalProps {
  attachment: AttachmentDto;
  isPending: boolean;
  triggerElement?: HTMLElement | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmModal({
  attachment,
  isPending,
  triggerElement,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  const { containerRef, initialFocusRef, handleKeyDown } = useModalFocus<HTMLButtonElement>({
    isOpen: true,
    isPending,
    onClose: onCancel,
  });
  useEffect(() => {
    return () => {
      triggerElement?.focus();
    };
  }, [triggerElement]);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`del-attach-title-${attachment.id}`}
        aria-describedby={`del-attach-desc-${attachment.id}`}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4 text-left"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 id={`del-attach-title-${attachment.id}`} className="font-bold text-slate-900 text-base">
            Delete Attachment?
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="ui-icon-button -mr-2 text-slate-400 hover:text-slate-600"
            aria-label="Cancel deletion"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p id={`del-attach-desc-${attachment.id}`} className="text-xs text-slate-600 leading-relaxed">
          Are you sure you want to delete <strong className="text-slate-900 font-semibold">{attachment.originalName}</strong>? Supporting files are permanently removed from storage.
        </p>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            ref={initialFocusRef}
            type="button"
            disabled={isPending}
            onClick={onCancel}
            className="ui-button ui-button-secondary text-xs px-3"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className="ui-button ui-button-danger text-xs px-3"
          >
            {isPending ? "Deleting..." : "Delete attachment"}
          </button>
        </div>
      </div>
    </div>
  );
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

  const [confirmingAttachment, setConfirmingAttachment] = useState<AttachmentDto | null>(null);
  const [confirmingTrigger, setConfirmingTrigger] = useState<HTMLButtonElement | null>(null);
  const [clientUploadProgress, setClientUploadProgress] = useState<number | null>(null);
  const [clientUploadError, setClientUploadError] = useState<string | null>(null);
  const [isClientUploading, setIsClientUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isFinalAttachment = attachments.length <= 1;

  const handleConfirmDelete = () => {
    if (!confirmingAttachment) return;
    const target = confirmingAttachment;
    setConfirmingAttachment(null);
    const formData = new FormData();
    formData.append("attachmentId", target.id);
    formData.append("idempotencyKey", `delete-attachment-${target.id}`);
    startTransition(() => {
      deleteAction(formData);
    });
  };
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validationError = validateUploadFile(selectedFile);
    if (validationError) {
      setClientUploadError(validationError);
      return;
    }

    setClientUploadError(null);
    setIsClientUploading(true);
    setClientUploadProgress(0);

    try {
      const uploaded = await uploadAttachmentDirectly(selectedFile, {
        onProgress: (p) => setClientUploadProgress(p.percentage),
      });

      const formData = new FormData();
      if (transactionId) formData.append("transactionId", transactionId);
      if (cashTransferId) formData.append("cashTransferId", cashTransferId);
      formData.append("idempotencyKey", crypto.randomUUID());
      formData.append("storageKey", uploaded.storageKey);
      formData.append("originalName", uploaded.originalName);
      formData.append("mimeType", uploaded.mimeType);
      formData.append("sizeBytes", String(uploaded.sizeBytes));

      startTransition(() => {
        uploadAction(formData);
      });

      setIsClientUploading(false);
      setClientUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      setIsClientUploading(false);
      setClientUploadProgress(null);
      const msg = err instanceof Error ? err.message : "Failed to upload file.";
      setClientUploadError(msg);
    }
  };

  const activeError = clientUploadError || uploadState?.error || deleteState?.error;

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
              className="text-[#004aad] hover:underline truncate max-w-[130px] font-medium"
              title={`${attachment.originalName} (${formatSize(attachment.sizeBytes)})`}
            >
              {attachment.originalName}
            </a>

            <button
              type="button"
              disabled={deletePending || isFinalAttachment}
              onClick={(e) => {
                setConfirmingAttachment(attachment);
                setConfirmingTrigger(e.currentTarget);
              }}
              className="ui-icon-button text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent min-w-[28px] min-h-[28px] p-1"
              aria-label={
                isFinalAttachment
                  ? `Cannot delete final supporting attachment ${attachment.originalName}`
                  : `Delete attachment ${attachment.originalName}`
              }
              title={
                isFinalAttachment
                  ? "Cannot delete the final supporting attachment."
                  : "Delete attachment"
              }
            >
              <Trash size={15} aria-hidden="true" />
            </button>
          </div>
        ))
      )}

      {/* Confirmation Dialog */}
      {confirmingAttachment && (
        <DeleteConfirmModal
          attachment={confirmingAttachment}
          isPending={deletePending}
          triggerElement={confirmingTrigger}
          onCancel={() => {
            setConfirmingAttachment(null);
            confirmingTrigger?.focus();
          }}
          onConfirm={handleConfirmDelete}
        />
      )}

      {/* Direct upload progress */}
      {isClientUploading && (
        <div className="rounded bg-blue-50 p-1.5 text-xs text-blue-900 space-y-1">
          <div className="flex justify-between font-semibold">
            <span>Uploading...</span>
            <span className="font-mono">{clientUploadProgress ?? 0}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[#004aad] h-1.5 transition-all duration-150 rounded-full"
              style={{ width: `${clientUploadProgress ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload button & file input */}
      {!isClientUploading && (
        <div className="pt-1">
          <label className="cursor-pointer inline-flex items-center gap-1 text-xs font-semibold text-[#004aad] hover:underline">
            <Paperclip size={14} aria-hidden="true" />
            <span>Add supporting attachment</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
              disabled={uploadPending || isClientUploading}
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
        </div>
      )}

      {uploadPending && (
        <p className="text-[12px] text-blue-700 font-medium">Recording attachment...</p>
      )}

      {activeError && (
        <p role="alert" className="text-xs text-red-600 font-medium leading-tight">
          {activeError}
        </p>
      )}
    </div>
  );
}
