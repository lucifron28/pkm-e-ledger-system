import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePasswordLength,
  hashPassword,
  verifyPassword,
} from "../../lib/auth/password";

test("Password Validation: minimum 8 characters accepted", () => {
  const result = validatePasswordLength("12345678");
  assert.equal(result.valid, true);
  assert.equal(result.message, undefined);
});

test("Password Validation: under 8 characters rejected", () => {
  const result = validatePasswordLength("1234567");
  assert.equal(result.valid, false);
  assert.match(result.message || "", /at least 8 characters/);
});

test("Password Validation: exact 72 ASCII bytes accepted", () => {
  const password72 = "a".repeat(72);
  const result = validatePasswordLength(password72);
  assert.equal(result.valid, true);
});

test("Password Validation: 73 ASCII bytes rejected", () => {
  const password73 = "a".repeat(73);
  const result = validatePasswordLength(password73);
  assert.equal(result.valid, false);
  assert.match(result.message || "", /exceeds maximum length of 72 bytes/);
});

test("Password Validation: multibyte UTF-8 password <= 72 bytes accepted", () => {
  // '€' is 3 bytes in UTF-8. 24 * 3 = 72 bytes. Length = 24 chars (>= 8).
  const passwordMultibyte72 = "€".repeat(24);
  assert.equal(Buffer.byteLength(passwordMultibyte72, "utf8"), 72);
  const result = validatePasswordLength(passwordMultibyte72);
  assert.equal(result.valid, true);
});

test("Password Validation: multibyte UTF-8 password > 72 bytes rejected", () => {
  // '€' is 3 bytes in UTF-8. 25 * 3 = 75 bytes.
  const passwordMultibyte75 = "€".repeat(25);
  assert.equal(Buffer.byteLength(passwordMultibyte75, "utf8"), 75);
  const result = validatePasswordLength(passwordMultibyte75);
  assert.equal(result.valid, false);
  assert.match(result.message || "", /exceeds maximum length of 72 bytes/);
});

test("Password Hashing & Verification: valid boundary password hashes and verifies", async () => {
  const password = "ValidBoundaryPass123";
  const hashed = await hashPassword(password);
  assert.ok(hashed.startsWith("$2a$") || hashed.startsWith("$2b$"));

  const valid = await verifyPassword(password, hashed);
  assert.equal(valid, true);

  const invalid = await verifyPassword("WrongPassword123", hashed);
  assert.equal(invalid, false);
});

test("Password Verification: over 72 bytes login attempt safely returns false without matching", async () => {
  const validPassword = "a".repeat(72);
  const hashed = await hashPassword(validPassword);

  // Appending extra chars to make it 73 bytes should not match the 72-byte hash
  const overlongLogin = "a".repeat(73);
  const result = await verifyPassword(overlongLogin, hashed);
  assert.equal(result, false);
});

test("Registration & Password Change Validation enforces password length boundary", () => {
  const validRegPassword = "Password123";
  assert.equal(validatePasswordLength(validRegPassword).valid, true);

  const overlongRegPassword = "a".repeat(73);
  assert.equal(validatePasswordLength(overlongRegPassword).valid, false);

  const overlongChangePassword = "a".repeat(73);
  assert.equal(validatePasswordLength(overlongChangePassword).valid, false);
});
