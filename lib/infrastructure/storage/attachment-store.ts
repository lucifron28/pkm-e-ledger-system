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
  storedName: string;
  relativeKey: string;
  storagePath: string;
}

export class AttachmentStorageService {
  private uploadsRoot: string;

  constructor(customUploadsRoot?: string) {
    this.uploadsRoot = path.resolve(customUploadsRoot || DEFAULT_UPLOADS_ROOT);
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
    const extension = originalName.split(".").pop()!.toLowerCase();
    const stageId = crypto.randomUUID();
    const stagingDir = this.getStagingDir();
    const stagedPath = path.join(stagingDir, `${stageId}.${extension}`);

    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(stagedPath, buffer);

    return {
      stageId,
      stagedPath,
      originalName,
      mimeType,
      sizeBytes: buffer.length,
      extension,
    };
  }

  public async commitUpload(stageId: string, extension: string): Promise<CommittedUploadResult> {
    const stagingDir = this.getStagingDir();
    const stagedPath = path.join(stagingDir, `${stageId}.${extension}`);

    if (!existsSync(stagedPath)) {
      throw new StorageConsistencyError(`Staged upload file missing for stageId: ${stageId}`);
    }

    const storedName = `${crypto.randomUUID()}.${extension}`;
    const storagePath = path.join(this.uploadsRoot, storedName);

    await fs.mkdir(this.uploadsRoot, { recursive: true });
    await fs.rename(stagedPath, storagePath);

    return {
      storedName,
      relativeKey: storedName,
      storagePath,
    };
  }

  public async discardStagedUpload(stageId: string, extension: string): Promise<void> {
    const stagingDir = this.getStagingDir();
    const stagedPath = path.join(stagingDir, `${stageId}.${extension}`);
    if (existsSync(stagedPath)) {
      try {
        await fs.unlink(stagedPath);
      } catch {
        /* best effort */
      }
    }
  }

  public async moveToTrash(storedName: string): Promise<string> {
    const activePath = this.resolveActivePath(storedName);
    if (!existsSync(activePath)) {
      throw new StorageConsistencyError(`Active attachment file missing: ${storedName}`);
    }

    const trashDir = this.getTrashDir();
    const trashId = crypto.randomUUID();
    const extension = storedName.split(".").pop() || "bin";
    const trashPath = path.join(trashDir, `${trashId}.${extension}`);

    await fs.mkdir(trashDir, { recursive: true });
    await fs.rename(activePath, trashPath);

    return `${trashId}.${extension}`;
  }

  public async restoreFromTrash(trashKey: string, storedName: string): Promise<void> {
    const trashDir = this.getTrashDir();
    const trashPath = path.join(trashDir, trashKey);

    if (!existsSync(trashPath)) {
      throw new StorageConsistencyError(`Trash file missing for key: ${trashKey}`);
    }

    const activePath = this.resolveActivePath(storedName);
    await fs.mkdir(this.uploadsRoot, { recursive: true });
    await fs.rename(trashPath, activePath);
  }

  public resolveActivePath(storedName: string): string {
    if (!storedName || typeof storedName !== "string" || !storedName.trim()) {
      throw new ValidationError("Invalid storage key.");
    }

    const sanitized = path.basename(storedName.trim());
    if (!sanitized || sanitized === "." || sanitized === "..") {
      throw new ValidationError("Invalid storage key.");
    }

    const resolved = path.resolve(this.uploadsRoot, sanitized);
    if (!resolved.startsWith(`${this.uploadsRoot}${path.sep}`)) {
      throw new ValidationError("Storage key containment check failed.");
    }

    return resolved;
  }
  public async deleteActiveFile(storedName: string): Promise<void> {
    try {
      const activePath = this.resolveActivePath(storedName);
      if (existsSync(activePath)) {
        await fs.unlink(activePath);
      }
    } catch {
      /* best effort */
    }
  }

  public async deleteTrashFile(trashKey: string): Promise<void> {
    await this.permanentlyDelete(trashKey);
  }

  public async permanentlyDelete(trashKey: string): Promise<void> {
    const trashDir = this.getTrashDir();
    const trashPath = path.join(trashDir, trashKey);
    if (existsSync(trashPath)) {
      try {
        await fs.unlink(trashPath);
      } catch {
        /* best effort */
      }
    }
  }

  public async reconcile(
    maxStaleAgeMs = 60 * 60 * 1000
  ): Promise<{ cleanedStaged: number; cleanedTrash: number; cleanedActive: number; missingDbFiles: string[] }> {
    let cleanedStaged = 0;
    let cleanedTrash = 0;
    let cleanedActive = 0;
    const missingDbFiles: string[] = [];
    const now = Date.now();

    // Clean stale staged files
    const stagingDir = this.getStagingDir();
    if (existsSync(stagingDir)) {
      const files = await fs.readdir(stagingDir);
      for (const file of files) {
        const filePath = path.join(stagingDir, file);
        try {
          const stat = await fs.stat(filePath);
          if (now - stat.mtimeMs > maxStaleAgeMs) {
            await fs.unlink(filePath);
            cleanedStaged++;
          }
        } catch {
          /* ignore */
        }
      }
    }

    // Consult DB metadata for active and trash files
    let dbStoredNames = new Set<string>();
    try {
      const dbAttachments = await prisma.attachment.findMany({
        select: { storedName: true },
      });
      dbStoredNames = new Set(dbAttachments.map((a) => a.storedName));
    } catch {
      /* fallback to file-only reconciliation if DB is unavailable */
    }

    // Clean or restore trash files
    const trashDir = this.getTrashDir();
    if (existsSync(trashDir)) {
      const files = await fs.readdir(trashDir);
      for (const file of files) {
        const filePath = path.join(trashDir, file);
        try {
          const stat = await fs.stat(filePath);
          // Check if DB still references this storedName (extract original storedName pattern or match)
          const matchedDbName = Array.from(dbStoredNames).find((name) => name.endsWith(path.extname(file)));
          if (matchedDbName && dbStoredNames.has(matchedDbName)) {
            // DB row still exists: restore from trash to active store
            await this.restoreFromTrash(file, matchedDbName);
          } else if (now - stat.mtimeMs > maxStaleAgeMs) {
            // Permanently delete unreferenced trash file after grace period
            await fs.unlink(filePath);
            cleanedTrash++;
          }
        } catch {
          /* ignore */
        }
      }
    }

    // Clean active files with no DB row references
    if (existsSync(this.uploadsRoot) && dbStoredNames.size > 0) {
      const files = await fs.readdir(this.uploadsRoot);
      for (const file of files) {
        if (file === "staging" || file === "trash") continue;
        if (!dbStoredNames.has(file)) {
          const filePath = path.join(this.uploadsRoot, file);
          try {
            const stat = await fs.stat(filePath);
            if (now - stat.mtimeMs > maxStaleAgeMs) {
              await fs.unlink(filePath);
              cleanedActive++;
            }
          } catch {
            /* ignore */
          }
        }
      }

      // Detect DB rows whose physical file is missing from disk
      for (const storedName of dbStoredNames) {
        try {
          const activePath = this.resolveActivePath(storedName);
          if (!existsSync(activePath)) {
            missingDbFiles.push(storedName);
          }
        } catch {
          missingDbFiles.push(storedName);
        }
      }
    }

    if (missingDbFiles.length > 0) {
      console.warn(`[AttachmentStorageService] Database records missing on disk: ${missingDbFiles.join(", ")}`);
    }

    return { cleanedStaged, cleanedTrash, cleanedActive, missingDbFiles };
  }
}

export const defaultAttachmentStorageService = new AttachmentStorageService();
