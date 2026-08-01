import "server-only";

import { prisma } from "../db/prisma";
import { requireManagementUser, requireOrgPortalUser, SessionUser } from "../auth/require-auth";
import { isManagementRole, isOrganizationPortalRole } from "../auth/rbac";
import {
  calculateAccountBalances,
  financialRowsToMovements,
  transferRowsToMovements,
  type AccountBalances,
} from "../domain/financial";
import {
  calculateEffectiveDateRange,
  decodeLedgerCursor,
  encodeLedgerCursor,
  parseLedgerQueryParams,
  ParsedLedgerQuery,
} from "../domain/query";
import {
  CashAccount,
  Prisma,
  Semester,
  TransactionType,
} from "@prisma/client";
import { CashTransferDto } from "../application/transfers";

export interface AttachmentDto {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface TransactionDto {
  id: string;
  organizationId: string;
  termId: string;
  type: TransactionType;
  documentNumber: string | null;
  transactionDate: Date;
  amountCents: number;
  cashAccount: CashAccount;
  categoryId: string;
  categoryName: string;
  counterpartyName: string | null;
  description: string;
  referenceDescription: string;
  eventActivityName: string | null;
  recordedByUserId: string;
  recordedByName: string;
  version: number;
  createdAt: Date;
  attachments: AttachmentDto[];
}

export type BalanceSnapshot = AccountBalances;

export interface CategoryDto {
  id: string;
  name: string;
  type: TransactionType;
  active: boolean;
}

export type TransactionFilters = ParsedLedgerQuery;

const attachmentSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
} as const;

const transactionInclude = {
  category: { select: { name: true } },
  recordedBy: { select: { fullName: true } },
  attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" as const } },
} as const;

const transferInclude = {
  recordedBy: { select: { fullName: true } },
  attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" as const } },
} as const;

type TransactionWithDetails = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;
type TransferWithDetails = Prisma.CashTransferGetPayload<{ include: typeof transferInclude }>;

function toAttachmentDto(attachment: {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}): AttachmentDto {
  return attachment;
}

function toTransactionDto(tx: TransactionWithDetails): TransactionDto {
  return {
    id: tx.id,
    organizationId: tx.organizationId,
    termId: tx.termId,
    type: tx.type,
    documentNumber: tx.documentNumber,
    transactionDate: tx.transactionDate,
    amountCents: tx.amountCents,
    cashAccount: tx.cashAccount,
    categoryId: tx.categoryId,
    categoryName: tx.category.name,
    counterpartyName: tx.counterpartyName,
    description: tx.description,
    referenceDescription: tx.referenceDescription,
    eventActivityName: tx.eventActivityName,
    recordedByUserId: tx.recordedByUserId,
    recordedByName: tx.recordedBy.fullName,
    version: tx.version,
    createdAt: tx.createdAt,
    attachments: tx.attachments.map(toAttachmentDto),
  };
}

function toTransferDto(transfer: TransferWithDetails): CashTransferDto & { attachments: AttachmentDto[] } {
  return {
    id: transfer.id,
    organizationId: transfer.organizationId,
    termId: transfer.termId,
    transferDate: transfer.transferDate,
    fromAccount: transfer.fromAccount,
    toAccount: transfer.toAccount,
    amountCents: transfer.amountCents,
    documentNumber: transfer.documentNumber,
    description: transfer.description,
    referenceDescription: transfer.referenceDescription,
    eventActivityName: transfer.eventActivityName,
    recordedByUserId: transfer.recordedByUserId,
    recordedByName: transfer.recordedBy.fullName,
    version: transfer.version,
    createdAt: transfer.createdAt,
    attachments: transfer.attachments.map(toAttachmentDto),
  };
}

export type LedgerEntry =
  | (TransactionDto & { kind: "TRANSACTION"; financialDate: Date })
  | ((CashTransferDto & { attachments: AttachmentDto[] }) & { kind: "TRANSFER"; financialDate: Date });

export interface LedgerQueryValidity {
  invalidTermSelection: boolean;
  invalidDateRange: boolean;
  invalidMonth: boolean;
  invalidCursor: boolean;
  invalidPageSize: boolean;
  invalidAcademicYear: boolean;
  invalidSemester: boolean;
  invalidType: boolean;
  invalidEntryType: boolean;
  invalidCashAccount: boolean;
  invalidCategoryId: boolean;
  invalidScalarFilter: boolean;
  invalidOrganization: boolean;
}

export interface LedgerPageSnapshotDto {
  selectedTerm: {
    id: string;
    academicYear: string;
    semester: Semester;
    openingCashOnHandCents: number;
    openingCashInBankCents: number;
    balanceForwardedCents: number;
    active: boolean;
  } | null;
  balances: BalanceSnapshot | null;
  transactions: TransactionDto[];
  transfers: (CashTransferDto & { attachments: AttachmentDto[] })[];
  entries: LedgerEntry[];
  categories: CategoryDto[];
  terms: { id: string; academicYear: string; semester: Semester; active: boolean }[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    pageSize: number;
    countOnPage: number;
  };
  queryValidity: LedgerQueryValidity;
}

function emptyValidity(query: ParsedLedgerQuery): LedgerQueryValidity {
  return {
    invalidTermSelection: query.invalidTermSelection,
    invalidDateRange: query.invalidDateRange,
    invalidMonth: query.invalidMonth,
    invalidCursor: query.invalidCursor,
    invalidPageSize: query.invalidPageSize,
    invalidAcademicYear: query.invalidAcademicYear,
    invalidSemester: query.invalidSemester,
    invalidType: query.invalidType,
    invalidEntryType: query.invalidEntryType,
    invalidCashAccount: query.invalidCashAccount,
    invalidCategoryId: query.invalidCategoryId,
    invalidScalarFilter: query.invalidScalarFilter,
    invalidOrganization: query.invalidOrganization,
  };
}

function emptySnapshot(query: ParsedLedgerQuery): LedgerPageSnapshotDto {
  return {
    selectedTerm: null,
    balances: null,
    transactions: [],
    transfers: [],
    entries: [],
    categories: [],
    terms: [],
    pagination: { hasMore: false, nextCursor: null, pageSize: query.pageSize, countOnPage: 0 },
    queryValidity: emptyValidity(query),
  };
}

export async function getDashboardBalancesForUser(
  user: SessionUser,
  academicYear?: string,
  semester?: Semester
): Promise<{
  term: {
    id: string;
    academicYear: string;
    semester: Semester;
    openingCashOnHandCents: number;
    openingCashInBankCents: number;
    balanceForwardedCents: number;
    active: boolean;
  };
  balances: BalanceSnapshot;
} | null> {
  if (!user || user.active === false || !user.organizationId || !isOrganizationPortalRole(user.role)) return null;
  if (Boolean(academicYear) !== Boolean(semester)) return null;
  const organizationId = user.organizationId;

  return prisma.$transaction(async (tx) => {
    const term = await tx.academicTerm.findFirst({
      where: academicYear && semester
        ? { organizationId, academicYear, semester }
        : { organizationId, active: true },
    });
    if (!term) return null;

    const transactions = await tx.transaction.findMany({
      where: { organizationId, termId: term.id, deletedAt: null },
      select: { type: true, amountCents: true, cashAccount: true },
    });
    const transfers = await tx.cashTransfer.findMany({
      where: { organizationId, termId: term.id, deletedAt: null },
      select: { amountCents: true, fromAccount: true, toAccount: true },
    });
    const balances = calculateAccountBalances(
      term.openingCashOnHandCents,
      term.openingCashInBankCents,
      [...financialRowsToMovements(transactions), ...transferRowsToMovements(transfers)]
    );

    return {
      term: {
        id: term.id,
        academicYear: term.academicYear,
        semester: term.semester,
        openingCashOnHandCents: term.openingCashOnHandCents,
        openingCashInBankCents: term.openingCashInBankCents,
        balanceForwardedCents: term.openingCashOnHandCents + term.openingCashInBankCents,
        active: term.active,
      },
      balances,
    };
  });
}

export async function getDashboardBalances(academicYear?: string, semester?: Semester) {
  const user = await requireOrgPortalUser();
  return getDashboardBalancesForUser(user, academicYear, semester);
}

export async function listCategoriesForType(type: TransactionType): Promise<CategoryDto[]> {
  await requireManagementUser();
  return prisma.transactionCategory.findMany({
    where: { type, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, active: true },
  });
}

export async function listTermsForLedger(): Promise<
  { id: string; academicYear: string; semester: Semester; active: boolean }[]
> {
  const user = await requireOrgPortalUser();
  return prisma.academicTerm.findMany({
    where: { organizationId: user.organizationId! },
    orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
    select: { id: true, academicYear: true, semester: true, active: true },
  });
}

function compareLedgerEntries(a: LedgerEntry, b: LedgerEntry): number {
  const dateDifference = b.financialDate.getTime() - a.financialDate.getTime();
  if (dateDifference !== 0) return dateDifference;
  const createdDifference = b.createdAt.getTime() - a.createdAt.getTime();
  if (createdDifference !== 0) return createdDifference;
  if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
  return a.id.localeCompare(b.id);
}

function compareToCursor(entry: LedgerEntry, cursor: ReturnType<typeof decodeLedgerCursor>): number {
  if (!cursor) return 1;
  const entryDate = entry.financialDate.getTime();
  const cursorDate = Date.parse(cursor.financialDate);
  if (entryDate !== cursorDate) return cursorDate - entryDate;
  const entryCreated = entry.createdAt.getTime();
  const cursorCreated = Date.parse(cursor.createdAt);
  if (entryCreated !== cursorCreated) return cursorCreated - entryCreated;
  if (entry.kind !== cursor.kind) return entry.kind.localeCompare(cursor.kind);
  return entry.id.localeCompare(cursor.id);
}

function matchesTransactionQuery(tx: TransactionDto, query: ParsedLedgerQuery, dateRange: ReturnType<typeof calculateEffectiveDateRange>): boolean {
  if (query.entryType === "TRANSFER") return false;
  if (query.type && tx.type !== query.type) return false;
  if (query.categoryId && tx.categoryId !== query.categoryId) return false;
  if (query.cashAccount && tx.cashAccount !== query.cashAccount) return false;
  if (query.eventActivityName && !(tx.eventActivityName || "").toLowerCase().includes(query.eventActivityName.toLowerCase())) return false;
  if (dateRange.gte && tx.transactionDate < dateRange.gte) return false;
  if (dateRange.lte && tx.transactionDate > dateRange.lte) return false;
  if (query.search) {
    const haystack = [tx.description, tx.counterpartyName, tx.documentNumber, tx.referenceDescription]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query.search.toLowerCase())) return false;
  }
  return true;
}

function matchesTransferQuery(
  transfer: CashTransferDto & { attachments: AttachmentDto[] },
  query: ParsedLedgerQuery,
  dateRange: ReturnType<typeof calculateEffectiveDateRange>
): boolean {
  if (query.entryType === "TRANSACTION") return false;
  if (query.type || query.categoryId) return false;
  if (query.cashAccount && transfer.fromAccount !== query.cashAccount && transfer.toAccount !== query.cashAccount) return false;
  if (query.eventActivityName && !(transfer.eventActivityName || "").toLowerCase().includes(query.eventActivityName.toLowerCase())) return false;
  if (dateRange.gte && transfer.transferDate < dateRange.gte) return false;
  if (dateRange.lte && transfer.transferDate > dateRange.lte) return false;
  if (query.search) {
    const haystack = [transfer.description, transfer.documentNumber, transfer.referenceDescription]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query.search.toLowerCase())) return false;
  }
  return true;
}

function buildLedgerCursorConditions(
  cursor: ReturnType<typeof decodeLedgerCursor>,
  kind: "TRANSACTION" | "TRANSFER",
  dateField: "transactionDate" | "transferDate"
): Record<string, unknown>[] {
  if (!cursor) return [];

  const cursorDate = new Date(cursor.financialDate);
  const cursorCreatedAt = new Date(cursor.createdAt);
  const conditions: Record<string, unknown>[] = [
    { [dateField]: { lt: cursorDate } },
    { [dateField]: cursorDate, createdAt: { lt: cursorCreatedAt } },
  ];

  if (kind === cursor.kind) {
    conditions.push({ [dateField]: cursorDate, createdAt: cursorCreatedAt, id: { gt: cursor.id } });
  } else if (kind === "TRANSFER") {
    // TRANSFER sorts after TRANSACTION when date and createdAt tie.
    conditions.push({ [dateField]: cursorDate, createdAt: cursorCreatedAt });
  }

  return conditions;
}

function applyLedgerDateAndCursorConditions(
  where: Prisma.TransactionWhereInput | Prisma.CashTransferWhereInput,
  dateField: "transactionDate" | "transferDate",
  dateRange: ReturnType<typeof calculateEffectiveDateRange>,
  cursor: ReturnType<typeof decodeLedgerCursor>,
  kind: "TRANSACTION" | "TRANSFER"
): void {
  const conditions: Record<string, unknown>[] = [];
  if (dateRange.gte || dateRange.lte) {
    conditions.push({
      [dateField]: {
        ...(dateRange.gte ? { gte: dateRange.gte } : {}),
        ...(dateRange.lte ? { lte: dateRange.lte } : {}),
      },
    });
  }
  const cursorConditions = buildLedgerCursorConditions(cursor, kind, dateField);
  if (cursorConditions.length > 0) conditions.push({ OR: cursorConditions });
  if (conditions.length > 0) {
    const existingAnd = where.AND
      ? (Array.isArray(where.AND) ? where.AND : [where.AND])
      : [];
    where.AND = [...existingAnd, ...conditions] as Prisma.TransactionWhereInput[];
  }
}

export async function getLedgerPageSnapshot(
  user: SessionUser,
  rawParams: Record<string, unknown> = {}
): Promise<LedgerPageSnapshotDto> {
  const query = parseLedgerQueryParams(rawParams);
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    return emptySnapshot(query);
  }

  return prisma.$transaction(async (tx) => {
    const terms = await tx.academicTerm.findMany({
      where: { organizationId: user.organizationId! },
      orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
      select: { id: true, academicYear: true, semester: true, active: true },
    });
    const categories = await tx.transactionCategory.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, active: true },
    });

    if (
      query.invalidTermSelection ||
      query.invalidAcademicYear ||
      query.invalidMonth ||
      query.invalidDateRange ||
      query.invalidCursor ||
      query.invalidPageSize ||
      query.invalidSemester ||
      query.invalidType ||
      query.invalidEntryType ||
      query.invalidCashAccount ||
      query.invalidCategoryId ||
      query.invalidScalarFilter ||
      query.invalidOrganization
    ) {
      const invalid = emptySnapshot(query);
      invalid.terms = terms;
      invalid.categories = categories;
      return invalid;
    }

    const selectedTerm = await tx.academicTerm.findFirst({
      where: query.academicYear && query.semester
        ? { organizationId: user.organizationId!, academicYear: query.academicYear, semester: query.semester }
        : { organizationId: user.organizationId!, active: true },
    });
    if (!selectedTerm) {
      const missing = emptySnapshot(query);
      missing.terms = terms;
      missing.categories = categories;
      return missing;
    }

    const dateRange = calculateEffectiveDateRange(query.month, query.dateFrom, query.dateTo);
    const cursor = decodeLedgerCursor(query.cursor);
    const balanceTransactionWhere: Prisma.TransactionWhereInput = {
      organizationId: user.organizationId!,
      termId: selectedTerm.id,
      deletedAt: null,
    };
    const balanceTransferWhere: Prisma.CashTransferWhereInput = {
      organizationId: user.organizationId!,
      termId: selectedTerm.id,
      deletedAt: null,
    };

    const transactionWhere: Prisma.TransactionWhereInput = { ...balanceTransactionWhere };
    if (query.type) transactionWhere.type = query.type;
    if (query.categoryId) transactionWhere.categoryId = query.categoryId;
    if (query.cashAccount) transactionWhere.cashAccount = query.cashAccount;
    if (query.eventActivityName) transactionWhere.eventActivityName = { contains: query.eventActivityName };
    if (query.search) {
      transactionWhere.OR = [
        { description: { contains: query.search } },
        { counterpartyName: { contains: query.search } },
        { documentNumber: { contains: query.search } },
        { referenceDescription: { contains: query.search } },
      ];
    }
    applyLedgerDateAndCursorConditions(transactionWhere, "transactionDate", dateRange, cursor, "TRANSACTION");

    const transferWhere: Prisma.CashTransferWhereInput = { ...balanceTransferWhere };
    const transferFilterConditions: Prisma.CashTransferWhereInput[] = [];
    if (query.cashAccount) {
      transferFilterConditions.push({
        OR: [{ fromAccount: query.cashAccount }, { toAccount: query.cashAccount }],
      });
    }
    if (query.eventActivityName) transferWhere.eventActivityName = { contains: query.eventActivityName };
    if (query.search) {
      transferFilterConditions.push({
        OR: [
          { description: { contains: query.search } },
          { documentNumber: { contains: query.search } },
          { referenceDescription: { contains: query.search } },
        ],
      });
    }
    if (transferFilterConditions.length > 0) transferWhere.AND = transferFilterConditions;
    applyLedgerDateAndCursorConditions(transferWhere, "transferDate", dateRange, cursor, "TRANSFER");

    const transactionRows = query.entryType === "TRANSFER"
      ? []
      : await tx.transaction.findMany({
          where: transactionWhere,
          include: transactionInclude,
          orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
          take: query.pageSize + 1,
        });
    const transferRows = query.entryType === "TRANSACTION" || query.type || query.categoryId
      ? []
      : await tx.cashTransfer.findMany({
          where: transferWhere,
          include: transferInclude,
          orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
          take: query.pageSize + 1,
        });

    const transactionTotals = await tx.transaction.groupBy({
      by: ["type", "cashAccount"],
      where: balanceTransactionWhere,
      _sum: { amountCents: true },
    });
    const transferTotals = await tx.cashTransfer.groupBy({
      by: ["fromAccount", "toAccount"],
      where: balanceTransferWhere,
      _sum: { amountCents: true },
    });
    const balances = calculateAccountBalances(
      selectedTerm.openingCashOnHandCents,
      selectedTerm.openingCashInBankCents,
      [
        ...transactionTotals.flatMap((row) => row._sum.amountCents === null ? [] : [{
          kind: row.type === TransactionType.INCOME ? "INCOME" as const : "EXPENSE" as const,
          amountCents: row._sum.amountCents,
          cashAccount: row.cashAccount,
        }]),
        ...transferTotals.flatMap((row) => row._sum.amountCents === null ? [] : [{
          kind: "TRANSFER" as const,
          amountCents: row._sum.amountCents,
          fromAccount: row.fromAccount,
          toAccount: row.toAccount,
        }]),
      ]
    );

    const transactions = transactionRows.map(toTransactionDto);
    const transfers = transferRows.map(toTransferDto);
    const entries: LedgerEntry[] = [
      ...transactions.filter((transaction) => matchesTransactionQuery(transaction, query, dateRange)).map((transaction) => ({
        ...transaction,
        kind: "TRANSACTION" as const,
        financialDate: transaction.transactionDate,
      })),
      ...transfers.filter((transfer) => matchesTransferQuery(transfer, query, dateRange)).map((transfer) => ({
        ...transfer,
        kind: "TRANSFER" as const,
        financialDate: transfer.transferDate,
      })),
    ].sort(compareLedgerEntries);

    const afterCursor = cursor ? entries.filter((entry) => compareToCursor(entry, cursor) > 0) : entries;
    const pageEntries = afterCursor.slice(0, query.pageSize);
    const hasMore = afterCursor.length > query.pageSize;
    const last = pageEntries[pageEntries.length - 1];
    const nextCursor = hasMore && last
      ? encodeLedgerCursor({
          financialDate: last.financialDate.toISOString(),
          createdAt: last.createdAt.toISOString(),
          kind: last.kind,
          id: last.id,
        })
      : null;

    return {
      selectedTerm: {
        id: selectedTerm.id,
        academicYear: selectedTerm.academicYear,
        semester: selectedTerm.semester,
        openingCashOnHandCents: selectedTerm.openingCashOnHandCents,
        openingCashInBankCents: selectedTerm.openingCashInBankCents,
        balanceForwardedCents: selectedTerm.openingCashOnHandCents + selectedTerm.openingCashInBankCents,
        active: selectedTerm.active,
      },
      balances,
      transactions: pageEntries.filter((entry): entry is Extract<LedgerEntry, { kind: "TRANSACTION" }> => entry.kind === "TRANSACTION"),
      transfers: pageEntries.filter((entry): entry is Extract<LedgerEntry, { kind: "TRANSFER" }> => entry.kind === "TRANSFER"),
      entries: pageEntries,
      categories,
      terms,
      pagination: { hasMore, nextCursor, pageSize: query.pageSize, countOnPage: pageEntries.length },
      queryValidity: emptyValidity(query),
    };
  });
}

export async function listLedgerTransactionsForUser(
  filters: Record<string, unknown>,
  user: SessionUser
): Promise<TransactionDto[]> {
  const snapshot = await getLedgerPageSnapshot(user, filters);
  return snapshot.transactions;
}

export async function listLedgerTransactions(filters: Record<string, unknown>): Promise<TransactionDto[]> {
  const user = await requireManagementUser();
  return listLedgerTransactionsForUser(filters, user);
}

export async function getTransactionForEditForUser(
  id: string,
  user: SessionUser
): Promise<TransactionDto | null> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) return null;
  const transaction = await prisma.transaction.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: transactionInclude,
  });
  return transaction ? toTransactionDto(transaction) : null;
}

export async function getTransactionForEdit(id: string): Promise<TransactionDto | null> {
  const user = await requireManagementUser();
  return getTransactionForEditForUser(id, user);
}
