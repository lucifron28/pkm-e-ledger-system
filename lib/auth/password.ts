import "server-only";
import bcrypt from "bcryptjs";

import { ValidationError } from "../domain/errors";

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

export async function hashPassword(plain: string): Promise<string> {
  const check = validatePasswordLength(plain);
  if (!check.valid) {
    throw new ValidationError(check.message || "Invalid password length.");
  }
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (Buffer.byteLength(plain, "utf8") > MAX_PASSWORD_BYTES) {
    return false;
  }
  return bcrypt.compare(plain, hash);
}
