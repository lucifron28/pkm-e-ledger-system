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
