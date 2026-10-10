"use client";

import { upload } from "@vercel/blob/client";

export interface UploadProgressEvent {
  loaded: number;
  total: number;
  percentage: number;
}

export interface ClientUploadedAttachment {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadAttachmentOptions {
  onProgress?: (progress: UploadProgressEvent) => void;
  signal?: AbortSignal;
}

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES: Record<string, true> = {
  "image/jpeg": true,
  "image/png": true,
  "application/pdf": true,
};

const ALLOWED_EXTENSIONS: Record<string, true> = {
  jpg: true,
  jpeg: true,
  png: true,
  pdf: true,
};

export function validateUploadFile(file: File): string | null {
  if (!file || file.size <= 0) {
    return "Please select a file to upload.";
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return `File size (${sizeMb} MB) exceeds maximum limit of 10 MB.`;
  }
  if (!ALLOWED_MIME_TYPES[file.type]) {
    return "Unsupported file format. Please upload a JPEG, PNG, or PDF.";
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !ALLOWED_EXTENSIONS[extension]) {
    return "File extension must be .jpg, .jpeg, .png, or .pdf.";
  }
  return null;
}

export async function uploadAttachmentDirectly(
  file: File,
  options: UploadAttachmentOptions = {}
): Promise<ClientUploadedAttachment> {
  const validationError = validateUploadFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const configRes = await fetch("/api/attachments/upload", {
    method: "GET",
    signal: options.signal,
  });

  if (!configRes.ok) {
    if (configRes.status === 401 || configRes.status === 403) {
      throw new Error("Authorization expired. Please refresh and sign in again.");
    }
    throw new Error(`Failed to check upload configuration (${configRes.status}).`);
  }

  const config = (await configRes.json()) as {
    isBlobConfigured: boolean;
    blobAccess: "public" | "private";
  };

  if (config.isBlobConfigured) {
    const blobResult = await upload(file.name, file, {
      access: config.blobAccess || "private",
      handleUploadUrl: "/api/attachments/upload",
      abortSignal: options.signal,
      onUploadProgress: (p) => {
        options.onProgress?.({
          loaded: p.loaded,
          total: p.total,
          percentage: Math.min(100, Math.max(0, Math.round(p.percentage))),
        });
      },
    });

    return {
      storageKey: blobResult.url,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  }

  return new Promise<ClientUploadedAttachment>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && options.onProgress) {
        const percentage = Math.min(100, Math.max(0, Math.round((e.loaded / e.total) * 100)));
        options.onProgress({ loaded: e.loaded, total: e.total, percentage });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText) as {
            error?: string;
            storageKey: string;
            originalName?: string;
            mimeType?: string;
            sizeBytes?: number;
          };
          if (res.error) {
            reject(new Error(res.error));
          } else {
            resolve({
              storageKey: res.storageKey,
              originalName: res.originalName || file.name,
              mimeType: res.mimeType || file.type,
              sizeBytes: res.sizeBytes || file.size,
            });
          }
        } catch {
          reject(new Error("Failed to parse server upload response."));
        }
      } else {
        let msg = `Upload failed (HTTP ${xhr.status})`;
        try {
          const errRes = JSON.parse(xhr.responseText) as { error?: string };
          if (errRes.error) msg = errRes.error;
        } catch {
          // keep fallback
        }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("Network connection error during file upload."));
    xhr.onabort = () => reject(new Error("Upload was cancelled."));

    if (options.signal) {
      options.signal.addEventListener("abort", () => xhr.abort());
    }

    xhr.open("POST", "/api/attachments/upload");
    xhr.send(formData);
  });
}
