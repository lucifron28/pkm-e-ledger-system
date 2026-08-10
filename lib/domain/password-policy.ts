export const MIN_PASSWORD_CHARS = 8;
export const MAX_PASSWORD_BYTES = 72;

export function validatePasswordLength(password: string): { valid: boolean; message?: string } {
  if (!password || password.length < MIN_PASSWORD_CHARS) {
    return { valid: false, message: `Password must be at least ${MIN_PASSWORD_CHARS} characters long.` };
  }
  const byteLength = Buffer.byteLength(password, "utf8");
  if (byteLength > MAX_PASSWORD_BYTES) {
    return { valid: false, message: `Password exceeds maximum length of ${MAX_PASSWORD_BYTES} bytes.` };
  }
  return { valid: true };
}
