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
    console.error("Failed to write audit log:", error);
  }
}

interface AuditLogFilters {
  organizationId?: string | null;
  userId?: string | null;
  action?: AuditAction | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  pageSize?: number;
}

export async function getAuditLogs(filters: AuditLogFilters) {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.AuditLogWhereInput = {};

  if (filters.organizationId !== undefined) {
    where.organizationId = filters.organizationId;
  }
  if (filters.userId) {
    where.userId = filters.userId;
  }
  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) {
      where.createdAt.gte = new Date(filters.dateFrom + "T00:00:00.000Z");
    }
    if (filters.dateTo) {
      where.createdAt.lte = new Date(filters.dateTo + "T23:59:59.999Z");
    }
  }

  try {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              fullName: true,
              username: true,
            },
          },
          organization: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total, page, pageSize };
  } catch (error) {
    console.error("Error in getAuditLogs:", error);
    return { logs: [], total: 0, page, pageSize };
  }
}

export async function getRecentAuditLogs(limit: number = 10) {
  try {
    return await prisma.auditLog.findMany({
      include: {
        user: {
          select: {
            fullName: true,
            username: true,
          },
        },
        organization: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });
  } catch (error) {
    console.error("Error in getRecentAuditLogs:", error);
    return [];
  }
}
