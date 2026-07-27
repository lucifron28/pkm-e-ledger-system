import "server-only";
import { prisma } from "../db/prisma";
import { AuditAction, Prisma, Role } from "@prisma/client";

export interface LogAuditParams {
  userId?: string | null;
  organizationId?: string | null;
  role?: Role | null;
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  tx?: Prisma.TransactionClient;
}

/**
 * Creates an immutable audit log entry.
 * Ensures passwords, session tokens, hashes, and secrets are NEVER logged in metadata.
 */
export async function createAuditLog(params: LogAuditParams): Promise<void> {
  const db = params.tx || prisma;
  
  // Sanitize metadata to prevent any accidental leakage of sensitive keys
  let safeMetadataJson: string | null = null;
  if (params.metadata) {
    const safeObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(params.metadata)) {
      if (
        !key.toLowerCase().includes("password") &&
        !key.toLowerCase().includes("token") &&
        !key.toLowerCase().includes("secret") &&
        !key.toLowerCase().includes("hash")
      ) {
        safeObj[key] = val;
      }
    }
    safeMetadataJson = JSON.stringify(safeObj);
  }

  try {
    await db.auditLog.create({
      data: {
        userId: params.userId || null,
        organizationId: params.organizationId || null,
        role: params.role || null,
        action: params.action,
        entityType: params.entityType || null,
        entityId: params.entityId || null,
        metadataJson: safeMetadataJson,
      },
    });
  } catch (error) {
    if (params.tx) {
      throw error;
    }
    console.error("Failed to write audit log:", error);
  }
}
