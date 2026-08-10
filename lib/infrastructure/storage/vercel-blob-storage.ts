import crypto from "crypto";
import { BlobNotFoundError, copy, del, get, head, list, put } from "@vercel/blob";

import {
  MAX_ATTACHMENT_SIZE,
  validateAttachmentMetadata,
  validateAttachmentPayload,
} from "../../domain/attachments";
import { StorageConsistencyError, ValidationError } from "../../domain/errors";
import { prisma } from "../../db/prisma";
import type {
  AttachmentStorageProvider,
  CommittedUploadResult,
  StorageAttachmentRecord,
  StorageDatabase,
  StorageReadResult,
  StorageReconciliationPlan,
  StagedUploadResult,
  TrashManifest,
  TrashMoveOwner,
  ValidatedStagedUpload,
} from "./attachment-store";

const STAGING_PREFIX = "staging/";
const ACTIVE_PREFIX = "active/";
const TRASH_PREFIX = "trash/";
const MANIFEST_PREFIX = "trash/manifests/";
const EXTENSION_PATTERN = "(?:jpg|jpeg|png|pdf)";
const STAGED_KEY_PATTERN = new RegExp(`^${STAGING_PREFIX}([0-9a-f-]{36})\\.(${EXTENSION_PATTERN})$`, "i");
const STORAGE_KEY_PATTERN = new RegExp(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,200}\\.(${EXTENSION_PATTERN})$`, "i");

const defaultStorageDatabase = prisma as unknown as StorageDatabase;

function parseStagedKey(stagedKey: string): { stageId: string; extension: string } {
  const match = STAGED_KEY_PATTERN.exec(stagedKey.trim());
  if (!match) throw new ValidationError("Invalid staged upload key.");
  return { stageId: match[1], extension: match[2].toLowerCase() };
}

function normalizeStorageKey(storageKey: string): string {
  const normalized = storageKey.trim();
  if (!STORAGE_KEY_PATTERN.test(normalized)) throw new ValidationError("Invalid attachment storage key.");
  return normalized;
}

function stagingKey(stageId: string, extension: string): string {
  const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!safeExtension || !new RegExp(`^${EXTENSION_PATTERN}$`, "i").test(safeExtension)) {
    throw new ValidationError("Attachment file extension is required.");
  }
  return `${STAGING_PREFIX}${stageId}.${safeExtension}`;
}

function activeKey(storageKey: string): string {
  return `${ACTIVE_PREFIX}${normalizeStorageKey(storageKey)}`;
}

function trashObjectKey(trashKey: string): string {
  return `${TRASH_PREFIX}${normalizeStorageKey(trashKey)}`;
}

function manifestObjectKey(trashKey: string): string {
  return `${MANIFEST_PREFIX}${normalizeStorageKey(trashKey).replace(/\.[^.]+$/, "")}.json`;
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
      total += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

async function readBlob(pathname: string): Promise<{ buffer: Uint8Array; contentType: string } | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return { buffer: await readStream(result.stream), contentType: result.blob.contentType };
}

async function blobExists(pathname: string): Promise<boolean> {
  try {
    await head(pathname);
    return true;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return false;
    throw error;
  }
}

function parseManifest(value: unknown): TrashManifest {
  const manifest = value as Partial<TrashManifest>;
  if (
    manifest.version !== 1 ||
    !manifest.state ||
    !["PREPARED", "MOVED", "DB_DELETED", "CLEANED"].includes(manifest.state) ||
    typeof manifest.trashKey !== "string" ||
    typeof manifest.originalStorageKey !== "string" ||
    typeof manifest.operationTimestamp !== "string"
  ) {
    throw new StorageConsistencyError("Trash manifest is invalid.");
  }
  return {
    ...manifest,
    stateChangedAt: manifest.stateChangedAt || manifest.operationTimestamp,
  } as TrashManifest;
}

async function readManifest(pathname: string): Promise<TrashManifest | null> {
  const result = await readBlob(pathname);
  if (!result) return null;
  try {
    return parseManifest(JSON.parse(new TextDecoder().decode(result.buffer)));
  } catch (error) {
    if (error instanceof StorageConsistencyError) throw error;
    throw new StorageConsistencyError(`Trash manifest could not be read: ${String(error)}`);
  }
}

async function writeManifest(pathname: string, manifest: TrashManifest): Promise<void> {
  await put(pathname, JSON.stringify(manifest), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function listAll(prefix: string) {
  const results: Awaited<ReturnType<typeof list>>["blobs"] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    results.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return results;
}

export class VercelBlobAttachmentStorageService implements AttachmentStorageProvider {
  public readonly mode = "vercel-blob" as const;
  private database: StorageDatabase;

  constructor(database: StorageDatabase = defaultStorageDatabase) {
    this.database = database;
  }

  public createStagedUploadKey(extension: string): string {
    return stagingKey(crypto.randomUUID(), extension);
  }

  public async stageUpload(buffer: Uint8Array, originalName: string, mimeType: string): Promise<StagedUploadResult> {
    const extension = originalName.split(".").pop()?.toLowerCase() || "";
    const metadataError = validateAttachmentMetadata(originalName, mimeType, buffer.length);
    if (metadataError) throw new ValidationError(metadataError);
    const stageId = crypto.randomUUID();
    const stagedKey = stagingKey(stageId, extension);
    await put(stagedKey, Buffer.from(buffer), {
      access: "private",
      contentType: mimeType,
      addRandomSuffix: false,
      allowOverwrite: false,
      maximumSizeInBytes: MAX_ATTACHMENT_SIZE,
    });
    return { stageId, stagedPath: stagedKey, originalName, mimeType, sizeBytes: buffer.length, extension };
  }

  public async commitUpload(stageId: string, extension: string): Promise<CommittedUploadResult> {
    const stagedKey = stagingKey(stageId, extension);
    const staged = await readBlob(stagedKey);
    if (!staged) throw new StorageConsistencyError(`Staged upload file missing: ${stagedKey}`);
    const normalizedExtension = extension.toLowerCase();
    const mimeType = normalizedExtension === "pdf" ? "application/pdf" : normalizedExtension === "png" ? "image/png" : "image/jpeg";
    const validated = await this.validateStagedUpload(
      stagedKey,
      `staged-upload.${normalizedExtension}`,
      mimeType,
      staged.buffer.length,
    );
    return this.commitValidatedStagedUpload(validated);
  }

  public async validateStagedUpload(
    stagedKey: string,
    originalName: string,
    mimeType: string,
    sizeBytes: number,
  ): Promise<ValidatedStagedUpload> {
    const parsed = parseStagedKey(stagedKey);
    const stored = await readBlob(stagedKey);
    if (!stored) throw new StorageConsistencyError(`Staged upload file missing: ${stagedKey}`);
    const validationError = validateAttachmentPayload(originalName, mimeType, stored.buffer, sizeBytes);
    if (validationError) throw new ValidationError(validationError);
    if (stored.buffer.length !== sizeBytes) {
      throw new ValidationError("Attachment size metadata does not match file contents.");
    }
    return {
      stageId: parsed.stageId,
      stagedKey: stagedKey.trim(),
      originalName,
      mimeType,
      sizeBytes,
      extension: parsed.extension,
      buffer: stored.buffer,
      fileHash: crypto.createHash("sha256").update(stored.buffer).digest("hex"),
    };
  }

  public async commitValidatedStagedUpload(validated: ValidatedStagedUpload): Promise<CommittedUploadResult> {
    const storageKey = `${crypto.randomUUID()}.${validated.extension}`;
    await copy(validated.stagedKey, activeKey(storageKey), {
      access: "private",
      contentType: validated.mimeType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return { storageKey, relativeKey: storageKey };
  }

  public async discardStagedUpload(stageId: string, extension: string): Promise<void> {
    await this.discardStagedObject(stagingKey(stageId, extension));
  }

  public async discardStagedObject(stagedKey: string): Promise<void> {
    parseStagedKey(stagedKey);
    try {
      await del(stagedKey.trim());
    } catch {
      /* Best effort cleanup. Reconciliation handles abandoned staged objects. */
    }
  }

  public async moveToTrash(storageKey: string, owner: TrashMoveOwner = {}): Promise<string> {
    const normalizedStorageKey = normalizeStorageKey(storageKey);
    const sourceKey = activeKey(normalizedStorageKey);
    const source = await head(sourceKey);
    const extension = normalizedStorageKey.split(".").pop() || "bin";
    const trashKey = `${crypto.randomUUID()}.${extension}`;
    const manifestPath = manifestObjectKey(trashKey);
    const manifest: TrashManifest = {
      version: 1,
      state: "PREPARED",
      trashKey,
      originalStorageKey: normalizedStorageKey,
      attachmentId: owner.attachmentId || null,
      transactionId: owner.transactionId || null,
      cashTransferId: owner.cashTransferId || null,
      operationTimestamp: new Date().toISOString(),
      stateChangedAt: new Date().toISOString(),
    };

    await writeManifest(manifestPath, manifest);
    try {
      await copy(sourceKey, trashObjectKey(trashKey), {
        access: "private",
        contentType: source.contentType || "application/octet-stream",
        addRandomSuffix: false,
        allowOverwrite: false,
      });
      await writeManifest(manifestPath, { ...manifest, state: "MOVED", stateChangedAt: new Date().toISOString() });
      await del(sourceKey);
    } catch (error) {
      throw new StorageConsistencyError(`Attachment could not be moved to private trash: ${String(error)}`);
    }
    return trashKey;
  }

  public async restoreFromTrash(trashKey: string, storageKey: string): Promise<void> {
    const manifestPath = manifestObjectKey(trashKey);
    const manifest = await readManifest(manifestPath);
    if (!manifest || manifest.trashKey !== normalizeStorageKey(trashKey) || manifest.originalStorageKey !== normalizeStorageKey(storageKey)) {
      throw new StorageConsistencyError(`Trash mapping does not match attachment storage key: ${trashKey}`);
    }
    if (manifest.state !== "PREPARED" && manifest.state !== "MOVED") {
      throw new StorageConsistencyError(`Trash item cannot be restored from state ${manifest.state}.`);
    }
    const destinationKey = activeKey(storageKey);
    if (await blobExists(destinationKey)) throw new StorageConsistencyError(`Active attachment already exists: ${storageKey}`);
    const source = await head(trashObjectKey(trashKey));
    await copy(trashObjectKey(trashKey), destinationKey, {
      access: "private",
      contentType: source.contentType || "application/octet-stream",
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    await del(trashObjectKey(trashKey));
    await del(manifestPath);
  }

  public async readActiveFile(storageKey: string): Promise<StorageReadResult | null> {
    const result = await readBlob(activeKey(storageKey));
    return result;
  }

  public async deleteActiveFile(storageKey: string): Promise<void> {
    await del(activeKey(storageKey));
  }

  public async permanentlyDelete(trashKey: string): Promise<void> {
    const normalizedTrashKey = normalizeStorageKey(trashKey);
    const manifestPath = manifestObjectKey(normalizedTrashKey);
    const manifest = await readManifest(manifestPath);
    if (manifest) await writeManifest(manifestPath, { ...manifest, state: "DB_DELETED", stateChangedAt: new Date().toISOString() });
    await del(trashObjectKey(normalizedTrashKey));
    if (manifest) {
      await writeManifest(manifestPath, { ...manifest, state: "CLEANED", stateChangedAt: new Date().toISOString() });
      await del(manifestPath);
    }
  }

  public async planReconciliation(maxStaleAgeMs = 60 * 60 * 1000): Promise<StorageReconciliationPlan> {
    const emptyPlan = (dbError = false): StorageReconciliationPlan => ({
      deleteStaging: [],
      restoreTrash: [],
      deleteTrash: [],
      deleteManifestOnly: [],
      deleteActiveOrphans: [],
      missingDbFiles: [],
      retainedForReview: [],
      ...(dbError ? { dbError: true } : {}),
    });

    let dbAttachments: StorageAttachmentRecord[];
    try {
      dbAttachments = await this.database.attachment.findMany({
        select: { id: true, storageKey: true, transactionId: true, cashTransferId: true },
      });
    } catch (error) {
      console.warn("[VercelBlobAttachmentStorageService] Reconciliation failed closed due to database error:", error);
      return emptyPlan(true);
    }

    try {
      const now = Date.now();
      const dbById = new Map(dbAttachments.map((attachment) => [attachment.id, attachment]));
      const dbKeys = new Set(dbAttachments.map((attachment) => attachment.storageKey));
      const [staging, active, trash, manifests] = await Promise.all([
        listAll(STAGING_PREFIX),
        listAll(ACTIVE_PREFIX),
        listAll(TRASH_PREFIX),
        listAll(MANIFEST_PREFIX),
      ]);
      const plan = emptyPlan();
      const activeKeys = new Set(active.map((blob) => blob.pathname.slice(ACTIVE_PREFIX.length)));
      const trashKeys = new Set(trash.filter((blob) => !blob.pathname.startsWith(MANIFEST_PREFIX)).map((blob) => blob.pathname.slice(TRASH_PREFIX.length)));

      for (const blob of staging) {
        if (now - blob.uploadedAt.getTime() > maxStaleAgeMs) plan.deleteStaging.push(blob.pathname);
      }

      for (const attachment of dbAttachments) {
        if (!activeKeys.has(attachment.storageKey)) plan.missingDbFiles.push(attachment.storageKey);
      }

      for (const blob of active) {
        const storageKey = blob.pathname.slice(ACTIVE_PREFIX.length);
        if (!dbKeys.has(storageKey) && now - blob.uploadedAt.getTime() > maxStaleAgeMs) {
          plan.deleteActiveOrphans.push(blob.pathname);
        }
      }

      for (const manifestBlob of manifests) {
        try {
          const manifest = await readManifest(manifestBlob.pathname);
          if (!manifest) {
            plan.retainedForReview.push({ path: manifestBlob.pathname, reason: "Manifest disappeared during planning" });
            continue;
          }
          const row = manifest.attachmentId ? dbById.get(manifest.attachmentId) : dbAttachments.find((attachment) =>
            attachment.storageKey === manifest.originalStorageKey &&
            ((manifest.transactionId && attachment.transactionId === manifest.transactionId) ||
              (manifest.cashTransferId && attachment.cashTransferId === manifest.cashTransferId)),
          );
          const exactMatch = Boolean(row && row.storageKey === manifest.originalStorageKey);
          const referencedByDb = dbKeys.has(manifest.originalStorageKey);
          const hasTrashPayload = trashKeys.has(manifest.trashKey);
          const stale = now - new Date(manifest.stateChangedAt).getTime() > maxStaleAgeMs;

          if (manifest.state === "CLEANED" || manifest.state === "DB_DELETED") {
            if (referencedByDb) plan.retainedForReview.push({ path: manifestBlob.pathname, reason: `Conflict: ${manifest.state} manifest is still referenced by database` });
            else plan.deleteTrash.push({ manifestPath: manifestBlob.pathname, trashKey: manifest.trashKey });
          } else if (!hasTrashPayload) {
            if (exactMatch && activeKeys.has(row!.storageKey)) plan.deleteManifestOnly.push(manifestBlob.pathname);
            else if (stale) plan.deleteManifestOnly.push(manifestBlob.pathname);
            else plan.retainedForReview.push({ path: manifestBlob.pathname, reason: "Missing trash payload within stale threshold" });
          } else if (exactMatch) {
            plan.restoreTrash.push({ manifestPath: manifestBlob.pathname, trashKey: manifest.trashKey, storageKey: row!.storageKey });
          } else if (referencedByDb) {
            plan.retainedForReview.push({ path: manifestBlob.pathname, reason: "Trash payload key conflicts with database reference" });
          } else if (stale) {
            plan.deleteTrash.push({ manifestPath: manifestBlob.pathname, trashKey: manifest.trashKey });
          } else {
            plan.retainedForReview.push({ path: manifestBlob.pathname, reason: "Unmapped trash payload within stale threshold" });
          }
        } catch (error) {
          plan.retainedForReview.push({ path: manifestBlob.pathname, reason: `Malformed or unreadable trash manifest: ${String(error)}` });
        }
      }

      return plan;
    } catch (error) {
      console.warn("[VercelBlobAttachmentStorageService] Reconciliation failed closed due to Blob storage error:", error);
      const plan = emptyPlan(true);
      plan.retainedForReview.push({ path: "vercel-blob", reason: "Blob listing or metadata query failed" });
      return plan;
    }
  }

  public async applyReconciliation(plan: StorageReconciliationPlan): Promise<{ cleanedStaged: number; cleanedTrash: number; cleanedActive: number; missingDbFiles: string[] }> {
    if (plan.dbError) return { cleanedStaged: 0, cleanedTrash: 0, cleanedActive: 0, missingDbFiles: plan.missingDbFiles };

    let currentDbAttachments: StorageAttachmentRecord[];
    try {
      currentDbAttachments = await this.database.attachment.findMany({
        select: { id: true, storageKey: true, transactionId: true, cashTransferId: true },
      });
    } catch (error) {
      console.warn("[VercelBlobAttachmentStorageService] applyReconciliation failed closed:", error);
      return { cleanedStaged: 0, cleanedTrash: 0, cleanedActive: 0, missingDbFiles: plan.missingDbFiles };
    }
    const currentDbKeys = new Set(currentDbAttachments.map((attachment) => attachment.storageKey));
    let cleanedStaged = 0;
    let cleanedTrash = 0;
    let cleanedActive = 0;

    for (const pathname of plan.deleteStaging) {
      try {
        parseStagedKey(pathname);
        await del(pathname);
        cleanedStaged++;
      } catch {
        /* Retain uncertain objects for a later reconciliation run. */
      }
    }

    for (const item of plan.restoreTrash) {
      if (!currentDbKeys.has(item.storageKey)) continue;
      try {
        await this.restoreFromTrash(item.trashKey, item.storageKey);
      } catch {
        /* Retain failed restore for manual review. */
      }
    }

    for (const item of plan.deleteTrash) {
      try {
        const manifest = await readManifest(item.manifestPath);
        if (!manifest || currentDbKeys.has(manifest.originalStorageKey)) continue;
        await this.permanentlyDelete(item.trashKey);
        cleanedTrash++;
      } catch {
        /* Retain failed cleanup for a later reconciliation run. */
      }
    }

    for (const manifestPath of plan.deleteManifestOnly) {
      try {
        const manifest = await readManifest(manifestPath);
        if (manifest && currentDbKeys.has(manifest.originalStorageKey)) continue;
        await del(manifestPath);
        cleanedTrash++;
      } catch {
        /* Retain failed cleanup for a later reconciliation run. */
      }
    }

    for (const pathname of plan.deleteActiveOrphans) {
      try {
        const storageKey = pathname.slice(ACTIVE_PREFIX.length);
        if (currentDbKeys.has(storageKey)) continue;
        await del(pathname);
        cleanedActive++;
      } catch {
        /* Retain failed cleanup for a later reconciliation run. */
      }
    }

    return { cleanedStaged, cleanedTrash, cleanedActive, missingDbFiles: plan.missingDbFiles };
  }

  public async reconcile(maxStaleAgeMs = 60 * 60 * 1000) {
    return this.applyReconciliation(await this.planReconciliation(maxStaleAgeMs));
  }
}
