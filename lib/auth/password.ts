import "server-only";
import bcrypt from "bcryptjs";

import { ValidationError } from "../domain/errors";
import {
  MAX_PASSWORD_BYTES,
  validatePasswordLength,
} from "../domain/password-policy";

export { MAX_PASSWORD_BYTES, MIN_PASSWORD_CHARS, validatePasswordLength } from "../domain/password-policy";

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
