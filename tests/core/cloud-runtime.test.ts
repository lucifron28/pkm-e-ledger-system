import test from "node:test";
import assert from "node:assert/strict";

import { getDemoPassword, LOCAL_DEMO_PASSWORD_FALLBACK } from "../../lib/application/demo-password";
import { getDatabaseRuntimeMode } from "../../lib/db/prisma";
import {
  createAttachmentStorageService,
  getAttachmentStorageProviderMode,
} from "../../lib/infrastructure/storage/attachment-store";
import { VercelBlobAttachmentStorageService } from "../../lib/infrastructure/storage/vercel-blob-storage";

test("Cloud runtime: local SQLite is default when Turso is not configured", () => {
  assert.equal(getDatabaseRuntimeMode({}), "local");
  assert.equal(getAttachmentStorageProviderMode({}), "local");
  assert.equal(createAttachmentStorageService("test-cloud-runtime-root").mode, "local");
});

test("Cloud runtime: Turso requires both URL and auth token", () => {
  assert.equal(
    getDatabaseRuntimeMode({ TURSO_DATABASE_URL: "libsql://demo.turso.io", TURSO_AUTH_TOKEN: "demo-token" }),
    "turso",
  );
  assert.throws(() => getDatabaseRuntimeMode({ TURSO_DATABASE_URL: "libsql://demo.turso.io" }), /configured together/);
  assert.throws(() => getDatabaseRuntimeMode({ VERCEL: "1" }), /required on Vercel/);
});

test("Cloud runtime: Vercel Blob provider requires an explicit private-storage token", () => {
  const blobEnvironment = {
    ATTACHMENT_STORAGE_PROVIDER: "vercel-blob",
    BLOB_READ_WRITE_TOKEN: "vercel-blob-test-token",
  };
  assert.equal(getAttachmentStorageProviderMode(blobEnvironment), "vercel-blob");
  assert.throws(
    () => getAttachmentStorageProviderMode({ ATTACHMENT_STORAGE_PROVIDER: "vercel-blob" }),
    /BLOB_READ_WRITE_TOKEN is required/,
  );
  assert.throws(
    () => getAttachmentStorageProviderMode({ VERCEL: "1" }),
    /Vercel deployments must use ATTACHMENT_STORAGE_PROVIDER=vercel-blob/,
  );
  assert.equal(new VercelBlobAttachmentStorageService({ attachment: { findMany: async () => [] } }).mode, "vercel-blob");
});

test("Cloud runtime: staged Blob keys use a constrained staging namespace", () => {
  const service = new VercelBlobAttachmentStorageService({ attachment: { findMany: async () => [] } });
  const stagedKey = service.createStagedUploadKey("png");
  assert.match(stagedKey, /^staging\/[0-9a-f-]{36}\.png$/i);
  assert.throws(() => service.createStagedUploadKey("exe"), /extension is required/);
});

test("Seed security: deployment requires DEMO_PASSWORD while local development uses documented fallback", () => {
  assert.equal(getDemoPassword({ NODE_ENV: "development" }), LOCAL_DEMO_PASSWORD_FALLBACK);
  assert.throws(() => getDemoPassword({ NODE_ENV: "production" }), /DEMO_PASSWORD is required/);
  assert.throws(() => getDemoPassword({ VERCEL: "1" }), /DEMO_PASSWORD is required/);
  assert.equal(getDemoPassword({ NODE_ENV: "production", DEMO_PASSWORD: "fictional-demo-pass" }), "fictional-demo-pass");
  assert.throws(() => getDemoPassword({ NODE_ENV: "production", DEMO_PASSWORD: "short" }), /DEMO_PASSWORD is invalid/);
});
