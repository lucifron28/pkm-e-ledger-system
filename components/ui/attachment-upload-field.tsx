"use client";

import { useCallback, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  IconCheck as Check,
  IconPaperclip as Paperclip,
  IconRefresh as Refresh,
  IconX as X,
} from "@tabler/icons-react";
import {
  uploadAttachmentDirectly,
  validateUploadFile,
} from "@/lib/infrastructure/storage/client-upload";
import type {
  ClientUploadedAttachment,
  UploadProgressEvent,
} from "@/lib/infrastructure/storage/client-upload";

interface AttachmentUploadFieldProps {
  id: string;
  name?: string;
  label: string;
  helpText?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  onUploaded?: (attachment: ClientUploadedAttachment | null) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentUploadField({
  id,
  name = "attachment",
  label,
  helpText = "Required. JPEG, PNG, or PDF up to 10 MB.",
  required = true,
  error: externalError,
  disabled = false,
  onUploaded,
}: AttachmentUploadFieldProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<ClientUploadedAttachment | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startUpload = useCallback(
    async (selectedFile: File) => {
      const validationError = validateUploadFile(selectedFile);
      if (validationError) {
        setUploadError(validationError);
        setUploaded(null);
        onUploaded?.(null);
        return;
      }

      setUploadError(null);
      setIsUploading(true);
      setProgress(0);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const result = await uploadAttachmentDirectly(selectedFile, {
          signal: controller.signal,
          onProgress: (p: UploadProgressEvent) => {
            setProgress(p.percentage);
          },
        });
        setUploaded(result);
        setIsUploading(false);
        setProgress(100);
        onUploaded?.(result);
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          setIsUploading(false);
          setProgress(null);
          return;
        }
        const message = err instanceof Error ? err.message : "Upload failed. Please try again.";
        setUploadError(message);
        setUploaded(null);
        setIsUploading(false);
        setProgress(null);
        onUploaded?.(null);
      }
    },
    [onUploaded]
  );

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    if (!selected) return;
    setFile(selected);
    startUpload(selected);
  };

  const handleRemove = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setFile(null);
    setUploaded(null);
    setProgress(null);
    setUploadError(null);
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onUploaded?.(null);
  };

  const handleRetry = () => {
    if (file) {
      startUpload(file);
    } else if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const activeError = uploadError || externalError;
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="ui-label">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </label>

      {/* Hidden inputs communicating uploaded storage key and metadata to Server Actions */}
      {uploaded && (
        <>
          <input type="hidden" name="attachmentStorageKey" value={uploaded.storageKey} />
          <input type="hidden" name="attachmentOriginalName" value={uploaded.originalName} />
          <input type="hidden" name="attachmentMimeType" value={uploaded.mimeType} />
          <input type="hidden" name="attachmentSizeBytes" value={uploaded.sizeBytes} />
        </>
      )}

      {/* Actual native file input */}
      <input
        ref={fileInputRef}
        id={id}
        name={name}
        type="file"
        accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
        required={required && !uploaded}
        disabled={disabled || isUploading}
        onChange={handleFileChange}
        aria-invalid={Boolean(activeError)}
        aria-describedby={`${activeError ? errorId : ""} ${helpId}`.trim()}
        className={uploaded ? "sr-only" : "ui-input"}
      />

      {/* Uploading progress card */}
      {isUploading && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
            <span className="inline-flex items-center gap-1.5 truncate max-w-[240px]">
              <Paperclip size={16} className="text-blue-600 shrink-0" aria-hidden="true" />
              <span className="truncate">{file?.name}</span>
            </span>
            <span className="font-mono">{progress ?? 0}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-[#004aad] h-2 transition-all duration-150 ease-out rounded-full"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[12px] text-blue-700">
            <span>Direct secure upload in progress...</span>
            <button
              type="button"
              onClick={handleRemove}
              className="text-xs font-bold text-red-600 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Uploaded success chip */}
      {uploaded && !isUploading && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50/80 p-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white shrink-0">
              <Check size={16} stroke={2.5} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-emerald-950 truncate max-w-[260px] sm:max-w-md">
                {uploaded.originalName}
              </p>
              <p className="text-emerald-700 text-[12px]">
                {formatBytes(uploaded.sizeBytes)} &bull; Upload verified
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="inline-flex items-center gap-1 text-xs font-bold text-red-700 hover:text-red-900 hover:underline px-2 py-1 min-h-[36px]"
            title="Remove attachment"
          >
            <X size={15} aria-hidden="true" />
            <span>Remove</span>
          </button>
        </div>
      )}

      {/* Error state */}
      {uploadError && !isUploading && (
        <div
          role="alert"
          id={errorId}
          className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1 text-xs"
        >
          <div className="flex items-center justify-between font-bold text-red-800">
            <span>Upload failed</span>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1 font-bold text-[#004aad] hover:underline"
            >
              <Refresh size={14} aria-hidden="true" />
              <span>Retry</span>
            </button>
          </div>
          <p className="text-red-700">{uploadError}</p>
        </div>
      )}

      {/* External field error if any */}
      {!uploadError && externalError && (
        <p id={errorId} role="alert" className="text-xs text-red-600 font-medium">
          {externalError}
        </p>
      )}

      {/* Helper text */}
      <p id={helpId} className="text-xs text-slate-500">
        {helpText}
      </p>
    </div>
  );
}
