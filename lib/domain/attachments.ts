const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "application/pdf": ["pdf"],
};

export function validateAttachmentFile(file: File): string | null {
  if (file.size <= 0) return "File is required.";
  if (file.size > MAX_ATTACHMENT_SIZE) return "File must be under 10 MB.";

  const allowedExtensions = MIME_EXTENSIONS[file.type];
  if (!allowedExtensions) return "Only JPEG, PNG, and PDF files are allowed.";

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !allowedExtensions.includes(extension)) {
    return "File extension does not match its MIME type.";
  }

  return null;
}

export function validateFileMagicBytes(buffer: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimeType === "application/pdf") {
    return buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }
  return false;
}

export interface ValidatedAttachment {
  buffer: Uint8Array;
  mimeType: string;
  extension: string;
  originalName: string;
  sizeBytes: number;
}

export type ValidatedAttachmentResult =
  | { success: true; data: ValidatedAttachment }
  | { success: false; error: string };

export async function validateAndReadAttachmentFile(
  file: File
): Promise<ValidatedAttachmentResult> {
  const metadataError = validateAttachmentFile(file);
  if (metadataError) {
    return { success: false, error: metadataError };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  if (!validateFileMagicBytes(buffer, file.type)) {
    return {
      success: false,
      error: "File content signature does not match its declared type.",
    };
  }

  const extension = file.name.split(".").pop()!.toLowerCase();

  return {
    success: true,
    data: {
      buffer,
      mimeType: file.type,
      extension,
      originalName: file.name,
      sizeBytes: file.size,
    },
  };
}
