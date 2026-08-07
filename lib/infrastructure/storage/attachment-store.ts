import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import { StorageConsistencyError, ValidationError } from "../../domain/errors";
import { prisma } from "../../db/prisma";

const DEFAULT_UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

export interface StagedUploadResult {
  stageId: string;
  stagedPath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  extension: string;
}

export interface CommittedUploadResult {
  storageKey: string;
  relativeKey: string;
}

export interface StorageAttachmentRecord {
  id: string;
  storageKey: string;
  transactionId: string | null;
  cashTransferId: string | null;
}

export interface StorageDatabase {
  attachment: {
    findMany(args: { select: { id: true; storageKey: true; transactionId: true; cashTransferId: true } }): Promise<StorageAttachmentRecord[]>;
  };
}

export type TrashOperationState = "PREPARED" | "MOVED" | "DB_DELETED" | "CLEANED";

interface TrashManifest {
  version: 1;
  state: TrashOperationState;
  trashKey: string;
  originalStorageKey: string;
  attachmentId: string | null;
  transactionId: string | null;
  cashTransferId: string | null;
  operationTimestamp: string;
  stateChangedAt: string;
}

export interface TrashMoveOwner {
  attachmentId?: string | null;
  transactionId?: string | null;
  cashTransferId?: string | null;
}

const defaultStorageDatabase = prisma as unknown as StorageDatabase;

export class AttachmentStorageService {
  private uploadsRoot: string;
  private database: StorageDatabase;

  constructor(customUploadsRoot?: string, database: StorageDatabase = defaultStorageDatabase) {
    this.uploadsRoot = path.resolve(customUploadsRoot || DEFAULT_UPLOADS_ROOT);
    this.database = database;
  }

  public getStagingDir(): string {
    return path.join(this.uploadsRoot, "staging");
  }

  public getTrashDir(): string {
    return path.join(this.uploadsRoot, "trash");
  }

  public async stageUpload(
    buffer: Uint8Array,
    originalName: string,
    mimeType: string
  ): Promise<StagedUploadResult> {
    const extension = path.extname(originalName).replace(/^\./, "").toLowerCase();
    if (!extension) throw new ValidationError("Attachment file extension is required.");

    const stageId = crypto.randomUUID();
    const stagingDir = this.getStagingDir();
    const stagedPath = path.join(stagingDir, `${stageId}.${extension}`);

    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(stagedPath, buffer);

    return { stageId, stagedPath, originalName, mimeType, sizeBytes: buffer.length, extension };
  }

  public async commitUpload(stageId: string, extension: string): Promise<CommittedUploadResult> {
    const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (!safeExtension) throw new ValidationError("Attachment file extension is required.");

    const stagedPath = path.join(this.getStagingDir(), `${stageId}.${safeExtension}`);
    if (!existsSync(stagedPath)) {
      throw new StorageConsistencyError(`Staged upload file missing for stageId: ${stageId}`);
    }

    const storageKey = `${crypto.randomUUID()}.${safeExtension}`;
    const activePath = this.resolveActivePath(storageKey);
    await fs.mkdir(this.uploadsRoot, { recursive: true });
    await fs.rename(stagedPath, activePath);

    return { storageKey, relativeKey: storageKey };
  }

  public async discardStagedUpload(stageId: string, extension: string): Promise<void> {
    const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const stagedPath = path.join(this.getStagingDir(), `${stageId}.${safeExtension}`);
    if (existsSync(stagedPath)) {
      try {
        await fs.unlink(stagedPath);
      } catch {
        /* best effort cleanup */
      }
    }
  }

  public async moveToTrash(storageKey: string, owner: TrashMoveOwner = {}): Promise<string> {
    const activePath = this.resolveActivePath(storageKey);
    if (!existsSync(activePath)) {
      throw new StorageConsistencyError(`Active attachment file missing: ${storageKey}`);
    }

    const trashId = crypto.randomUUID();
    const extension = path.extname(storageKey).replace(/^\./, "") || "bin";
    const trashKey = `${trashId}.${extension}`;
    const trashPath = this.resolveTrashPath(trashKey);
    const manifestPath = this.getManifestPath(trashKey);
    const temporaryManifestPath = `${manifestPath}.${crypto.randomUUID()}.tmp`;
    const manifest: TrashManifest = {
      version: 1,
      state: "PREPARED",
      trashKey,
      originalStorageKey: path.basename(storageKey),
      attachmentId: owner.attachmentId || null,
      transactionId: owner.transactionId || null,
      cashTransferId: owner.cashTransferId || null,
      operationTimestamp: new Date().toISOString(),
      stateChangedAt: new Date().toISOString(),
    };

    await fs.mkdir(this.getTrashDir(), { recursive: true });
    try {
      await fs.writeFile(temporaryManifestPath, JSON.stringify(manifest), "utf8");
      await fs.rename(temporaryManifestPath, manifestPath);
    } catch (error) {
      try {
        if (existsSync(temporaryManifestPath)) await fs.unlink(temporaryManifestPath);
      } catch {
        /* best effort cleanup */
      }
      throw new StorageConsistencyError(`Trash manifest could not be persisted: ${String(error)}`);
    }

    try {
      await fs.rename(activePath, trashPath);
    } catch (error) {
      try {
        if (existsSync(manifestPath)) await fs.unlink(manifestPath);
      } catch {
        /* reconciliation can remove a stale PREPARED manifest */
      }
      throw new StorageConsistencyError(`Attachment could not be moved to trash: ${String(error)}`);
    }

    try {
      await this.updateTrashState(trashKey, "MOVED");
    } catch (error) {
      // Leave PREPARED manifest and moved file identifiable for reconciliation.
      throw new StorageConsistencyError(`Trash state could not be advanced: ${String(error)}`);
    }

    return trashKey;
  }

  public async restoreFromTrash(trashKey: string, storageKey: string): Promise<void> {
    const trashPath = this.resolveTrashPath(trashKey);
    const manifestPath = this.getManifestPath(trashKey);
    if (!existsSync(trashPath)) {
      throw new StorageConsistencyError(`Trash file missing for key: ${trashKey}`);
    }

    if (!existsSync(manifestPath)) {
      throw new StorageConsistencyError(`Trash manifest missing for key: ${trashKey}`);
    }
    const manifest = await this.readManifest(manifestPath);
    if (
      manifest.trashKey !== path.basename(trashKey) ||
      manifest.originalStorageKey !== path.basename(storageKey) ||
      (manifest.state !== "PREPARED" && manifest.state !== "MOVED")
    ) {
      throw new StorageConsistencyError(`Trash mapping does not match attachment storage key: ${trashKey}`);
    }

    const activePath = this.resolveActivePath(storageKey);
    if (existsSync(activePath)) {
      throw new StorageConsistencyError(`Active attachment file already exists: ${storageKey}`);
    }
    await fs.mkdir(this.uploadsRoot, { recursive: true });
    await fs.rename(trashPath, activePath);
    await fs.unlink(manifestPath);
  }

  public resolveActivePath(storageKey: string): string {
    return this.resolveContainedFile(this.uploadsRoot, storageKey, "storage key");
  }

  private resolveTrashPath(trashKey: string): string {
    return this.resolveContainedFile(this.getTrashDir(), trashKey, "trash key");
  }

  private resolveContainedFile(root: string, key: string, label: string): string {
    if (!key || typeof key !== "string" || !key.trim()) {
      throw new ValidationError(`Invalid ${label}.`);
    }
    const sanitized = path.basename(key.trim());
    if (!sanitized || sanitized === "." || sanitized === "..") {
      throw new ValidationError(`Invalid ${label}.`);
    }
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, sanitized);
    if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new ValidationError(`${label} containment check failed.`);
    }
    return resolved;
  }

  private getManifestPath(trashKey: string): string {
    const base = path.basename(trashKey, path.extname(trashKey));
    return path.join(this.getTrashDir(), `${base}.json`);
  }

  private async readManifest(manifestPath: string): Promise<TrashManifest> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    } catch (error) {
      throw new StorageConsistencyError(`Trash manifest could not be read: ${String(error)}`);
    }
    const manifest = parsed as Partial<TrashManifest>;
    const state = manifest.state || "MOVED";
    if (
      manifest.version !== 1 ||
      !["PREPARED", "MOVED", "DB_DELETED", "CLEANED"].includes(state) ||
      typeof manifest.trashKey !== "string" ||
      typeof manifest.originalStorageKey !== "string" ||
      typeof manifest.operationTimestamp !== "string"
    ) {
      throw new StorageConsistencyError("Trash manifest is invalid.");
    }
    return {
      ...manifest,
      state: state as TrashOperationState,
      stateChangedAt: manifest.stateChangedAt || manifest.operationTimestamp,
    } as TrashManifest;
  }

  private async updateTrashState(trashKey: string, state: TrashOperationState): Promise<void> {
    const manifestPath = this.getManifestPath(trashKey);
    const manifest = await this.readManifest(manifestPath);
    const nextManifest: TrashManifest = {
      ...manifest,
      state,
      stateChangedAt: new Date().toISOString(),
    };
    const temporaryManifestPath = `${manifestPath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryManifestPath, JSON.stringify(nextManifest), "utf8");
      await fs.rename(temporaryManifestPath, manifestPath);
    } finally {
      try {
        if (existsSync(temporaryManifestPath)) await fs.unlink(temporaryManifestPath);
      } catch {
        /* best effort cleanup */
      }
    }
  }

  public async deleteActiveFile(storageKey: string): Promise<void> {
    const activePath = this.resolveActivePath(storageKey);
    if (existsSync(activePath)) await fs.unlink(activePath);
  }

  public async permanentlyDelete(trashKey: string): Promise<void> {
    const trashPath = this.resolveTrashPath(trashKey);
    const manifestPath = this.getManifestPath(trashKey);

    if (existsSync(manifestPath)) {
      await this.updateTrashState(trashKey, "DB_DELETED");
    }
    if (existsSync(trashPath)) await fs.unlink(trashPath);
    if (existsSync(manifestPath)) {
      await this.updateTrashState(trashKey, "CLEANED");
      await fs.unlink(manifestPath);
    }
  }

  public async reconcile(
    maxStaleAgeMs = 60 * 60 * 1000
  ): Promise<{ cleanedStaged: number; cleanedTrash: number; cleanedActive: number; missingDbFiles: string[] }> {
    let cleanedStaged = 0;
    let cleanedTrash = 0;
    let cleanedActive = 0;
    const missingDbFiles: string[] = [];

    let dbAttachments: StorageAttachmentRecord[];
    try {
      dbAttachments = await this.database.attachment.findMany({
        select: { id: true, storageKey: true, transactionId: true, cashTransferId: true },
      });
    } catch (error) {
      console.warn("[AttachmentStorageService] Reconciliation failed closed due to database error:", error);
      return { cleanedStaged: 0, cleanedTrash: 0, cleanedActive: 0, missingDbFiles: [] };
    }

    const now = Date.now();
    const dbById = new Map(dbAttachments.map((attachment) => [attachment.id, attachment]));
    const dbKeys = new Set(dbAttachments.map((attachment) => attachment.storageKey));

    const stagingDir = this.getStagingDir();
    if (existsSync(stagingDir)) {
      for (const file of await fs.readdir(stagingDir)) {
        const filePath = path.join(stagingDir, file);
        try {
          const stat = await fs.stat(filePath);
          if (now - stat.mtimeMs > maxStaleAgeMs) {
            await fs.unlink(filePath);
            cleanedStaged++;
          }
        } catch {
          /* ignore individual cleanup failures */
        }
      }
    }

    const trashDir = this.getTrashDir();
    if (existsSync(trashDir)) {
      const files = await fs.readdir(trashDir);
      for (const manifestFile of files.filter((file) => file.endsWith(".json"))) {
        const manifestPath = path.join(trashDir, manifestFile);
        try {
          const manifest = await this.readManifest(manifestPath);
          const trashPath = this.resolveTrashPath(manifest.trashKey);
          const row = manifest.attachmentId
            ? dbById.get(manifest.attachmentId)
            : dbAttachments.find((attachment) =>
                attachment.storageKey === manifest.originalStorageKey &&
                ((manifest.transactionId && attachment.transactionId === manifest.transactionId) ||
                  (manifest.cashTransferId && attachment.cashTransferId === manifest.cashTransferId))
              );
          const exactMatch = row && row.storageKey === manifest.originalStorageKey;

          if (manifest.state === "CLEANED") {
            if (existsSync(trashPath)) await fs.unlink(trashPath);
            await fs.unlink(manifestPath);
            cleanedTrash++;
          } else if (manifest.state === "DB_DELETED") {
            await this.permanentlyDelete(manifest.trashKey);
            cleanedTrash++;
          } else if (!existsSync(trashPath)) {
            if (exactMatch && existsSync(this.resolveActivePath(row!.storageKey))) {
              await fs.unlink(manifestPath);
              cleanedTrash++;
            } else if (now - new Date(manifest.stateChangedAt).getTime() > maxStaleAgeMs) {
              await fs.unlink(manifestPath);
              cleanedTrash++;
            }
          } else if (manifest.state === "PREPARED") {
            await this.updateTrashState(manifest.trashKey, "MOVED");
            if (exactMatch) {
              await this.restoreFromTrash(manifest.trashKey, row!.storageKey);
            } else if (now - new Date(manifest.stateChangedAt).getTime() > maxStaleAgeMs) {
              await this.permanentlyDelete(manifest.trashKey);
              cleanedTrash++;
            }
          } else if (exactMatch) {
            await this.restoreFromTrash(manifest.trashKey, row.storageKey);
          } else if (now - new Date(manifest.stateChangedAt).getTime() > maxStaleAgeMs) {
            await this.permanentlyDelete(manifest.trashKey);
            cleanedTrash++;
          }
        } catch {
          /* Leave malformed or unmapped trash in place for manual inspection. */
        }
      }
    }

    if (existsSync(this.uploadsRoot)) {
      for (const file of await fs.readdir(this.uploadsRoot)) {
        if (file === "staging" || file === "trash") continue;
        const filePath = path.join(this.uploadsRoot, file);
        try {
          const stat = await fs.stat(filePath);
          if (!stat.isFile()) continue;
          if (!dbKeys.has(file) && now - stat.mtimeMs > maxStaleAgeMs) {
            await fs.unlink(filePath);
            cleanedActive++;
          }
        } catch {
          /* ignore individual cleanup failures */
        }
      }

      for (const attachment of dbAttachments) {
        try {
          if (!existsSync(this.resolveActivePath(attachment.storageKey))) {
            missingDbFiles.push(attachment.storageKey);
          }
        } catch {
          missingDbFiles.push(attachment.storageKey);
        }
      }
    } else {
      for (const attachment of dbAttachments) {
        missingDbFiles.push(attachment.storageKey);
      }
    }

    if (missingDbFiles.length > 0) {
      console.warn(`[AttachmentStorageService] Database records missing on disk: ${missingDbFiles.join(", ")}`);
    }

    return { cleanedStaged, cleanedTrash, cleanedActive, missingDbFiles };
  }
}

export const defaultAttachmentStorageService = new AttachmentStorageService();
