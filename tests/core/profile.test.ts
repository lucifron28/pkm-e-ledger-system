import test from "node:test";
import assert from "node:assert/strict";
import { profileUpdateSchema } from "../../lib/domain/profile";

test("Profile validation trims full name and normalizes username", () => {
  const result = profileUpdateSchema.safeParse({
    fullName: "  Fictional Treasurer  ",
    username: "  Official_Treasurer  ",
    currentPassword: "password",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.fullName, "Fictional Treasurer");
    assert.equal(result.data.username, "official_treasurer");
  }
});

test("Profile validation rejects incomplete identity fields", () => {
  const result = profileUpdateSchema.safeParse({
    fullName: "A",
    username: "ab",
    currentPassword: "",
  });

  assert.equal(result.success, false);
  if (!result.success) {
    const fields = result.error.flatten().fieldErrors;
    assert.ok(fields.fullName);
    assert.ok(fields.username);
    assert.ok(fields.currentPassword);
  }
});

test("Profile validation limits identity field lengths", () => {
  const result = profileUpdateSchema.safeParse({
    fullName: "F".repeat(101),
    username: "u".repeat(51),
    currentPassword: "password",
  });

  assert.equal(result.success, false);
});
