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
  actorUsername?: string | null;
  actorFullName?: string | null;
  organizationNameSnapshot?: string | null;
  metadata?: Record<string, unknown> | null;
  tx?: Prisma.TransactionClient;
  throwOnError?: boolean;
}

const SENSITIVE_KEY_PATTERN =
  /(password|token|secret|hash|credential|cookie|authorization)/i;

/**
 * Recursively redacts sensitive keys from nested objects and arrays.
 */
export function redactSensitiveKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveKeys(item));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactSensitiveKeys(val);
      }
    }
    return result;
  }
  return value;
}

/**
 * Creates an immutable audit log entry.
 */
export async function createAuditLog(params: LogAuditParams): Promise<void> {
  const db = params.tx || prisma;

  let username = params.actorUsername || null;
  let fullName = params.actorFullName || null;
  let orgName = params.organizationNameSnapshot || null;

  if ((!username || !fullName) && params.userId) {
    try {
      const actor = await db.user.findUnique({
        where: { id: params.userId },
        select: { username: true, fullName: true, organization: { select: { name: true } } },
      });
      if (actor) {
        username = username || actor.username;
        fullName = fullName || actor.fullName;
        if (!orgName && actor.organization) {
          orgName = actor.organization.name;
        }
      }
    } catch {
      /* best effort */
    }
  }

  if (!orgName && params.organizationId) {
    try {
      const org = await db.organization.findUnique({
        where: { id: params.organizationId },
        select: { name: true },
      });
      if (org) orgName = org.name;
    } catch {
      /* best effort */
    }
  }

  const mergedMetadata = {
    ...(params.metadata || {}),
    actorUsername: username,
    actorFullName: fullName,
    actorRole: params.role || null,
    organizationNameSnapshot: orgName,
  };

  const redacted = redactSensitiveKeys(mergedMetadata);
  const safeMetadataJson = JSON.stringify(redacted);

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
    if (params.tx || params.throwOnError) {
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

export interface AuditLogPageDto {
  logs: AuditLogDto[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface AuditLogFilters {
  action?: AuditAction;
  dateFrom?: string;
  dateTo?: string;
  actorUserId?: string;
  cursor?: string;
  pageSize?: number;
}

export async function listAuditLogsForCurrentOrganization(
  filters: AuditLogFilters = {}
): Promise<AuditLogPageDto> {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return { logs: [], pagination: { hasMore: false, nextCursor: null } };
  }

  const pageSize = Math.min(Math.max(filters.pageSize || 50, 1), 100);
  const take = pageSize + 1;

  const where: Prisma.AuditLogWhereInput = {
    organizationId: user.organizationId,
  };

  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.actorUserId) {
    where.userId = filters.actorUserId;
  }

  if (filters.dateFrom || filters.dateTo) {
    let gte: Date | undefined = undefined;
    let lte: Date | undefined = undefined;

    if (filters.dateFrom) {
      const d = new Date(filters.dateFrom);
      if (!isNaN(d.getTime())) {
        gte = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
      }
    }

    if (filters.dateTo) {
      const d = new Date(filters.dateTo);
      if (!isNaN(d.getTime())) {
        lte = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
      }
    }

    where.createdAt = {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      user: { select: { id: true, username: true, fullName: true } },
      organization: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = logs.length > pageSize;
  const paginatedLogs = hasMore ? logs.slice(0, pageSize) : logs;
  const nextCursor =
    hasMore && paginatedLogs.length > 0
      ? paginatedLogs[paginatedLogs.length - 1].id
      : null;

  return {
    logs: paginatedLogs.map((log) => {
      let meta: Record<string, unknown> | null = null;
      if (log.metadataJson) {
        try { meta = JSON.parse(log.metadataJson); } catch { /* ignore */ }
      }
      return {
        id: log.id,
        action: log.action,
        userId: log.userId,
        username: log.user?.username ?? (meta?.actorUsername as string | null) ?? null,
        fullName: log.user?.fullName ?? (meta?.actorFullName as string | null) ?? null,
        role: log.role ?? (meta?.actorRole as Role | null) ?? null,
        organizationId: log.organizationId,
        organizationName: log.organization?.name ?? (meta?.organizationNameSnapshot as string | null) ?? null,
        createdAt: log.createdAt,
        entityType: log.entityType,
        entityId: log.entityId,
        metadataJson: log.metadataJson,
      };
    }),
    pagination: { hasMore, nextCursor },
  };
}
