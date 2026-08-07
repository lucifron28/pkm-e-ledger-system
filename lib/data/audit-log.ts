import "server-only";
import crypto from "crypto";
import { prisma } from "../db/prisma";
import { requireManagementUser } from "../auth/require-auth";
import { AuditAction, CashAccount, Prisma, Role, Semester, TransactionType } from "@prisma/client";
import { parseStrictDate } from "../domain/query";
import { formatPesoFromCents } from "./money";

export interface TransactionSnapshot {
  id: string;
  organizationId: string;
  termId: string;
  type: TransactionType;
  transactionDate: string;
  cashAccount: CashAccount;
  amountCents: number;
  categoryId: string | null;
  categoryName: string | null;
  documentNumber: string | null;
  counterpartyName: string | null;
  description: string;
  referenceDescription: string;
  eventActivityName: string | null;
  recordedByUserId: string;
  createdAt: string;
  version: number;
}

export interface CashTransferSnapshot {
  id: string;
  organizationId: string;
  termId: string;
  transferDate: string;
  fromAccount: CashAccount;
  toAccount: CashAccount;
  amountCents: number;
  documentNumber: string | null;
  description: string;
  referenceDescription: string;
  eventActivityName: string | null;
  recordedByUserId: string;
  createdAt: string;
  version: number;
}

export interface TransactionCreateAuditMetadata {
  type: TransactionType;
  cashAccount: CashAccount;
  amountCents: number;
  categoryId?: string;
  categoryName?: string;
  documentNumber?: string | null;
  counterpartyName?: string | null;
  description?: string;
  referenceDescription?: string;
  eventActivityName?: string | null;
}

export interface TransactionEditAuditMetadata {
  before: TransactionSnapshot;
  after: TransactionSnapshot;
}

export interface TransactionDeleteAuditMetadata {
  deleteReason: string;
  before: TransactionSnapshot;
}

export interface CashTransferCreateAuditMetadata {
  amountCents: number;
  fromAccount: CashAccount;
  toAccount: CashAccount;
  documentNumber?: string | null;
  description: string;
  referenceDescription: string;
  eventActivityName?: string | null;
}

export interface CashTransferEditAuditMetadata {
  before: CashTransferSnapshot;
  after: CashTransferSnapshot;
}

export interface CashTransferDeleteAuditMetadata {
  deleteReason: string;
  before: CashTransferSnapshot;
}

export interface OpeningBalanceUpdateAuditMetadata {
  academicYear: string;
  semester: Semester;
  previousCashOnHandCents: number;
  newCashOnHandCents: number;
  previousCashInBankCents: number;
  newCashInBankCents: number;
  previousBalanceForwardedCents: number;
  newBalanceForwardedCents: number;
  operation: "CREATE" | "UPDATE";
}

export interface TermActivationAuditMetadata {
  academicYear: string;
  semester: Semester;
  previousActiveTermId: string | null;
}

export interface AttachmentUploadAuditMetadata {
  transactionId?: string | null;
  cashTransferId?: string | null;
  originalName: string;
  mimeType?: string;
  sizeBytes: number;
}

export interface AttachmentDeleteAuditMetadata {
  transactionId?: string | null;
  cashTransferId?: string | null;
  originalName: string;
}

export interface ReportGenerationAuditMetadata {
  reportType: "SUMMARY" | "PDF" | "EXCEL" | "PACKAGE";
  termId: string;
  format?: "PDF" | "EXCEL" | "HTML";
}

export type ActionSpecificAuditMetadata =
  | TransactionCreateAuditMetadata
  | TransactionEditAuditMetadata
  | TransactionDeleteAuditMetadata
  | CashTransferCreateAuditMetadata
  | CashTransferEditAuditMetadata
  | CashTransferDeleteAuditMetadata
  | OpeningBalanceUpdateAuditMetadata
  | TermActivationAuditMetadata
  | AttachmentUploadAuditMetadata
  | AttachmentDeleteAuditMetadata
  | ReportGenerationAuditMetadata;

/**
 * Maps every audited financial action to the metadata shape its audit entry
 * must carry. Actions without a mapping carry free-form metadata.
 */
export type AuditMetadataByAction = {
  ADDED_INCOME: TransactionCreateAuditMetadata;
  ADDED_EXPENSE: TransactionCreateAuditMetadata;
  EDITED_TRANSACTION: TransactionEditAuditMetadata;
  DELETED_TRANSACTION: TransactionDeleteAuditMetadata;
  CREATED_CASH_TRANSFER: CashTransferCreateAuditMetadata;
  EDITED_CASH_TRANSFER: CashTransferEditAuditMetadata;
  DELETED_CASH_TRANSFER: CashTransferDeleteAuditMetadata;
  CHANGED_OPENING_BALANCE: OpeningBalanceUpdateAuditMetadata;
  ACTIVATED_ACADEMIC_TERM: TermActivationAuditMetadata;
  UPLOADED_ATTACHMENT: AttachmentUploadAuditMetadata;
  DELETED_ATTACHMENT: AttachmentDeleteAuditMetadata;
  GENERATED_REPORT: ReportGenerationAuditMetadata;
};

/** Compile-time key: ensures the mapping covers every financial AuditAction. */
export type FinancialAuditAction = keyof Pick<
  AuditMetadataByAction,
  | "ADDED_INCOME"
  | "ADDED_EXPENSE"
  | "EDITED_TRANSACTION"
  | "DELETED_TRANSACTION"
  | "CREATED_CASH_TRANSFER"
  | "EDITED_CASH_TRANSFER"
  | "DELETED_CASH_TRANSFER"
  | "CHANGED_OPENING_BALANCE"
  | "ACTIVATED_ACADEMIC_TERM"
>;

/** Generic: selects the exact metadata type required for a given financial action. */
export type AuditMetadataFor<A extends FinancialAuditAction> = AuditMetadataByAction[A];

export type AuditActionWithMetadata = keyof AuditMetadataByAction;

/**
 * Mapped actions carry an exact, REQUIRED metadata shape. Actions without a
 * mapping carry optional free-form metadata.
 */
type MappedMetadataField<A extends AuditAction> = A extends AuditActionWithMetadata
  ? { metadata: AuditMetadataByAction[A] }
  : { metadata?: Record<string, unknown> | null };

export type LogAuditParams<A extends AuditAction = AuditAction> = MappedMetadataField<A> & {
  userId?: string | null;
  organizationId?: string | null;
  role?: Role | null;
  action: A;
  entityType?: string | null;
  entityId?: string | null;
  actorUsername?: string | null;
  actorFullName?: string | null;
  organizationNameSnapshot?: string | null;
  tx?: Prisma.TransactionClient;
  throwOnError?: boolean;
};

/**
 * Explicitly untyped/system audit API for events that are not covered by
 * AuditMetadataByAction (authentication events, registrations, system notices).
 * Use this deliberately; financial mutations must use the exact typed metadata
 * enforced by createAuditLog.
 */
export interface SystemAuditLogParams {
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
 *
 * When the action maps to a typed metadata shape (see AuditMetadataByAction),
 * the metadata parameter is required to be exactly that shape at compile time.
 */
export async function createAuditLog<A extends AuditAction>(
  params: LogAuditParams<A>
): Promise<void> {
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
        actorUsernameSnapshot: username,
        actorFullNameSnapshot: fullName,
        actorRoleSnapshot: params.role || null,
        organizationNameSnapshot: orgName,
      },
    });
  } catch (error) {
    if (params.tx || params.throwOnError) {
      throw error;
    }
    console.error("Failed to write audit log:", error);
  }
}

/**
 * Explicitly untyped/system audit entry for events not covered by the
 * AuditMetadataByAction mapping (e.g. LOGGED_IN, LOGGED_OUT,
 * CHANGED_PASSWORD, REGISTERED_USER). Mapped financial mutations must use the
 * typed createAuditLog API so their metadata stays exact and complete.
 */
export async function createSystemAuditLog(params: SystemAuditLogParams): Promise<void> {
  await createAuditLog(params);
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
  metadata?: Record<string, unknown> | null;
}

export interface AuditLogPageDto {
  logs: AuditLogDto[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
  invalidCursor?: boolean;
}

type AuditLogWithRelations = Prisma.AuditLogGetPayload<{
  include: {
    user: { select: { id: true; username: true; fullName: true } };
    organization: { select: { id: true; name: true } };
  };
}>;

export function toAuditLogDto(log: AuditLogWithRelations): AuditLogDto {
  let meta: Record<string, unknown> | null = null;
  if (log.metadataJson) {
    try {
      meta = JSON.parse(log.metadataJson);
    } catch {
      /* preserve row even when legacy metadata is malformed */
    }
  }
  return {
    id: log.id,
    action: log.action,
    userId: log.userId,
    username: log.actorUsernameSnapshot ?? (meta?.actorUsername as string | null) ?? log.user?.username ?? null,
    fullName: log.actorFullNameSnapshot ?? (meta?.actorFullName as string | null) ?? log.user?.fullName ?? null,
    role: log.actorRoleSnapshot ?? (meta?.actorRole as Role | null) ?? log.role ?? null,
    organizationId: log.organizationId,
    organizationName: log.organizationNameSnapshot ?? (meta?.organizationNameSnapshot as string | null) ?? log.organization?.name ?? null,
    createdAt: log.createdAt,
    entityType: log.entityType,
    entityId: log.entityId,
    metadataJson: log.metadataJson,
    metadata: meta,
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

export interface AuditCursorPayload {
  id: string;
  fingerprint: string;
}

export function buildAuditLogCursorFingerprint(organizationId: string, filters: AuditLogFilters): string {
  const parts = [
    "v1",
    organizationId,
    filters.action || "",
    filters.actorUserId || "",
    filters.dateFrom || "",
    filters.dateTo || "",
    String(filters.pageSize || 50),
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

export function encodeAuditCursor(id: string, fingerprint: string): string {
  return Buffer.from(JSON.stringify({ id, fingerprint }), "utf8").toString("base64url");
}

export function decodeAuditCursor(value: string | undefined, expectedFingerprint: string): string | null {
  if (!value || typeof value !== "string" || !value.trim()) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value.trim(), "base64url").toString("utf8"));
    if (typeof decoded.id === "string" && decoded.fingerprint === expectedFingerprint) {
      return decoded.id;
    }
  } catch {
    /* Invalid cursor format */
  }
  return null;
}

export async function listAuditLogsForCurrentOrganization(
  filters: AuditLogFilters = {}
): Promise<AuditLogPageDto> {
  const user = await requireManagementUser();
  if (!user.organizationId) {
    return { logs: [], pagination: { hasMore: false, nextCursor: null } };
  }

  const expectedFingerprint = buildAuditLogCursorFingerprint(user.organizationId, filters);
  let resolvedCursorId: string | null = null;

  if (filters.cursor) {
    resolvedCursorId = decodeAuditCursor(filters.cursor, expectedFingerprint);
    if (!resolvedCursorId) {
      return { logs: [], pagination: { hasMore: false, nextCursor: null }, invalidCursor: true };
    }
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
    try {
      let gte: Date | undefined = undefined;
      let lte: Date | undefined = undefined;

      if (filters.dateFrom) {
        const d = parseStrictDate(filters.dateFrom);
        gte = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
      }

      if (filters.dateTo) {
        const d = parseStrictDate(filters.dateTo);
        lte = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
      }

      if (gte && lte && gte > lte) return { logs: [], pagination: { hasMore: false, nextCursor: null } };

      where.createdAt = {
        ...(gte ? { gte } : {}),
        ...(lte ? { lte } : {}),
      };
    } catch {
      return { logs: [], pagination: { hasMore: false, nextCursor: null } };
    }
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      user: { select: { id: true, username: true, fullName: true } },
      organization: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    ...(resolvedCursorId ? { cursor: { id: resolvedCursorId }, skip: 1 } : {}),
  });

  const hasMore = logs.length > pageSize;
  const paginatedLogs = hasMore ? logs.slice(0, pageSize) : logs;
  const lastId = paginatedLogs.length > 0 ? paginatedLogs[paginatedLogs.length - 1].id : null;
  const nextCursor = hasMore && lastId ? encodeAuditCursor(lastId, expectedFingerprint) : null;

  return {
    logs: paginatedLogs.map(toAuditLogDto),
    pagination: { hasMore, nextCursor },
  };
}

export async function listOrganizationUsers(
  organizationId: string
): Promise<Array<{ id: string; fullName: string; username: string }>> {
  return prisma.user.findMany({
    where: { organizationId, active: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, username: true },
  });
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  ADDED_INCOME: "Recorded Income",
  ADDED_EXPENSE: "Recorded Expense",
  EDITED_TRANSACTION: "Edited Transaction",
  DELETED_TRANSACTION: "Deleted Transaction",
  CREATED_CASH_TRANSFER: "Transferred Cash",
  EDITED_CASH_TRANSFER: "Edited Cash Transfer",
  DELETED_CASH_TRANSFER: "Deleted Cash Transfer",
  CHANGED_OPENING_BALANCE: "Updated Opening Balances",
  ACTIVATED_ACADEMIC_TERM: "Activated Academic Term",
  UPLOADED_ATTACHMENT: "Uploaded Attachment",
  DELETED_ATTACHMENT: "Deleted Attachment",
  GENERATED_REPORT: "Generated Report",
  LOGGED_IN: "User Login",
  LOGGED_OUT: "User Logout",
  CHANGED_PASSWORD: "Password Changed",
  REGISTERED_USER: "User Registered",
  CREATED_ORGANIZATION: "Created Organization",
  TOGGLED_ORGANIZATION_STATUS: "Toggled Organization Status",
  CREATED_CATEGORY: "Created Category",
  UPDATED_CATEGORY: "Updated Category",
  TOGGLED_CATEGORY_STATUS: "Toggled Category Status",
};

export function formatHumanReadableSummary(log: {
  action: AuditAction | string;
  metadata?: Record<string, unknown> | null;
}): string {
  const meta = (log.metadata || {}) as Record<string, unknown>;
  const before = meta.before as Record<string, unknown> | undefined;
  const after = meta.after as Record<string, unknown> | undefined;

  switch (log.action) {
    case AuditAction.ADDED_INCOME:
      return `Recorded Income of ${meta.amountCents !== undefined ? formatPesoFromCents(Number(meta.amountCents)) : "N/A"} (${meta.cashAccount || "Cash"}) from ${meta.counterpartyName || meta.description || "payor"}`;

    case AuditAction.ADDED_EXPENSE:
      return `Recorded Expense of ${meta.amountCents !== undefined ? formatPesoFromCents(Number(meta.amountCents)) : "N/A"} (${meta.cashAccount || "Cash"}) to ${meta.counterpartyName || meta.description || "payee"}`;

    case AuditAction.EDITED_TRANSACTION: {
      if (before && after) {
        const changes: string[] = [];
        if (before.type !== after.type) changes.push(`type: ${before.type} -> ${after.type}`);
        if (before.amountCents !== after.amountCents) changes.push(`amount: ${formatPesoFromCents(Number(before.amountCents))} -> ${formatPesoFromCents(Number(after.amountCents))}`);
        if (before.cashAccount !== after.cashAccount) changes.push(`account: ${before.cashAccount} -> ${after.cashAccount}`);
        if (before.transactionDate !== after.transactionDate) changes.push(`date: ${before.transactionDate} -> ${after.transactionDate}`);
        if (before.categoryId !== after.categoryId || before.categoryName !== after.categoryName) changes.push("category updated");
        if (before.documentNumber !== after.documentNumber) changes.push("document number updated");
        if (before.description !== after.description) changes.push("description updated");
        if (before.referenceDescription !== after.referenceDescription) changes.push("reference updated");
        if (before.counterpartyName !== after.counterpartyName) changes.push("payor/payee updated");
        if (before.eventActivityName !== after.eventActivityName) changes.push("event/activity updated");
        if (changes.length > 0) {
          return `Edited transaction (${changes.join(", ")})`;
        }
      }
      return `Edited transaction details`;
    }

    case AuditAction.DELETED_TRANSACTION:
      return `Soft-deleted transaction (Reason: ${meta.deleteReason || "N/A"})`;

    case AuditAction.CREATED_CASH_TRANSFER:
      return `Transferred ${meta.amountCents !== undefined ? formatPesoFromCents(Number(meta.amountCents)) : "N/A"} from ${meta.fromAccount || "account"} to ${meta.toAccount || "account"}`;

    case AuditAction.EDITED_CASH_TRANSFER: {
      if (before && after) {
        const changes: string[] = [];
        if (before.amountCents !== after.amountCents) changes.push(`amount: ${formatPesoFromCents(Number(before.amountCents))} -> ${formatPesoFromCents(Number(after.amountCents))}`);
        if (before.fromAccount !== after.fromAccount || before.toAccount !== after.toAccount) {
          changes.push(`accounts: ${before.fromAccount}->${before.toAccount} to ${after.fromAccount}->${after.toAccount}`);
        }
        if (before.transferDate !== after.transferDate) changes.push(`date: ${before.transferDate} -> ${after.transferDate}`);
        if (before.documentNumber !== after.documentNumber) changes.push("document number updated");
        if (before.description !== after.description) changes.push("description updated");
        if (before.referenceDescription !== after.referenceDescription) changes.push("reference updated");
        if (before.eventActivityName !== after.eventActivityName) changes.push("event/activity updated");
        if (changes.length > 0) {
          return `Edited cash transfer (${changes.join(", ")})`;
        }
      }
      return `Edited cash transfer details`;
    }

    case AuditAction.DELETED_CASH_TRANSFER:
      return `Soft-deleted cash transfer (Reason: ${meta.deleteReason || "N/A"})`;

    case AuditAction.CHANGED_OPENING_BALANCE: {
      const cohPrev = meta.previousCashOnHandCents ?? meta.openingCashOnHandCents;
      const cohNew = meta.newCashOnHandCents ?? meta.openingCashOnHandCents;
      const cibPrev = meta.previousCashInBankCents ?? meta.openingCashInBankCents;
      const cibNew = meta.newCashInBankCents ?? meta.openingCashInBankCents;

      const cohStr = cohPrev !== undefined && cohNew !== undefined && cohPrev !== cohNew
        ? `COH: ${formatPesoFromCents(Number(cohPrev))} -> ${formatPesoFromCents(Number(cohNew))}`
        : `COH: ${cohNew !== undefined ? formatPesoFromCents(Number(cohNew)) : "N/A"}`;

      const cibStr = cibPrev !== undefined && cibNew !== undefined && cibPrev !== cibNew
        ? `CIB: ${formatPesoFromCents(Number(cibPrev))} -> ${formatPesoFromCents(Number(cibNew))}`
        : `CIB: ${cibNew !== undefined ? formatPesoFromCents(Number(cibNew)) : "N/A"}`;

      return `Updated Opening Balances (${cohStr}, ${cibStr})`;
    }

    case AuditAction.ACTIVATED_ACADEMIC_TERM:
      return `Activated Academic Term (${meta.academicYear || ""} ${meta.semester || ""})`;

    case AuditAction.UPLOADED_ATTACHMENT:
      return `Uploaded receipt/supporting file: ${meta.originalName || "attachment"}`;

    case AuditAction.DELETED_ATTACHMENT:
      return `Deleted attachment: ${meta.originalName || "attachment"}`;

    case AuditAction.GENERATED_REPORT:
      return `Generated official financial report package`;

    case AuditAction.LOGGED_IN:
      return `User signed into system`;

    case AuditAction.LOGGED_OUT:
      return `User signed out of system`;

    case AuditAction.CHANGED_PASSWORD:
      return `Updated account password`;

    case AuditAction.REGISTERED_USER: {
      const name = (meta.actorFullName || meta.registeredFullName || meta.fullName) as string | undefined;
      const username = (meta.actorUsername || meta.registeredUsername || meta.username) as string | undefined;
      const role = (meta.requestedRole || meta.role) as string | undefined;

      const userDisplay = name && username ? `${name} (${username})` : username || name || "User";
      const roleDisplay = role ? ` as ${role}` : "";
      return `Registered new user account ${userDisplay}${roleDisplay}`;
    }

    case AuditAction.CREATED_ORGANIZATION:
      return `Created organization (${meta.name || "organization"})`;

    case AuditAction.TOGGLED_ORGANIZATION_STATUS:
      return `Toggled organization status`;

    case AuditAction.CREATED_CATEGORY:
      return `Created category (${meta.name || "category"})`;

    case AuditAction.UPDATED_CATEGORY:
      return `Updated category (${meta.name || "category"})`;

    case AuditAction.TOGGLED_CATEGORY_STATUS:
      return `Toggled category status`;

    default:
      return AUDIT_ACTION_LABELS[log.action as AuditAction] || String(log.action);
  }
}
