import "server-only";
import { prisma } from "../db/prisma";
import { requireManagementUser } from "../auth/require-auth";
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

export interface AuditLogDto {
  id: string;
  action: AuditAction;
  userId: string | null;
  username: string | null;
  fullName: string | null;
  role: Role | null;
  organizationId: string | null;
  organizationName: string | null;
  createdAt: Date;
  entityType: string | null;
  entityId: string | null;
  metadataJson: string | null;
}

export async function listAuditLogsForCurrentOrganization(
  limit = 200
): Promise<AuditLogDto[]> {
  const user = await requireManagementUser();
  if (!user.organizationId) return [];

  const logs = await prisma.auditLog.findMany({
    where: { organizationId: user.organizationId },
    include: {
      user: { select: { id: true, username: true, fullName: true } },
      organization: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    userId: log.userId,
    username: log.user?.username ?? null,
    fullName: log.user?.fullName ?? null,
    role: log.role,
    organizationId: log.organizationId,
    organizationName: log.organization?.name ?? null,
    createdAt: log.createdAt,
    entityType: log.entityType,
    entityId: log.entityId,
    metadataJson: log.metadataJson,
  }));
}
