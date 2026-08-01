import "server-only";
import { prisma } from "../db/prisma";
import { requireManagementUser, requireOrgPortalUser, SessionUser } from "../auth/require-auth";
import { isManagementRole } from "../auth/rbac";
import {
  calculateAccountBalances,
  financialRowsToMovements,
  transferRowsToMovements,
  type AccountBalances,
} from "../domain/financial";
import {
  calculateEffectiveDateRange,
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
}

export type BalanceSnapshot = AccountBalances;

export interface CategoryDto {
  id: string;
  name: string;
  type: TransactionType;
  active: boolean;
}

export type TransactionFilters = ParsedLedgerQuery;

const transactionInclude = {
  category: { select: { name: true } },
  recordedBy: { select: { fullName: true } },
} as const;

type TransactionWithDetails = Prisma.TransactionGetPayload<{
  include: typeof transactionInclude;
}>;

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
  if (!user || user.active === false || !user.organizationId) return null;

  return prisma.$transaction(async (tx) => {
    let term;
    if (academicYear && semester) {
      term = await tx.academicTerm.findFirst({
        where: { organizationId: user.organizationId!, academicYear, semester },
      });
    } else {
      term = await tx.academicTerm.findFirst({
        where: { organizationId: user.organizationId!, active: true },
      });
    }

    if (!term) return null;

    const transactions = await tx.transaction.findMany({
      where: { organizationId: user.organizationId!, termId: term.id, deletedAt: null },
      select: { type: true, amountCents: true, cashAccount: true },
    });

    const transfers = await tx.cashTransfer.findMany({
      where: { organizationId: user.organizationId!, termId: term.id, deletedAt: null },
      select: { amountCents: true, fromAccount: true, toAccount: true },
    });

    const movements = [
      ...financialRowsToMovements(transactions),
      ...transferRowsToMovements(transfers),
    ];

    const balances = calculateAccountBalances(
      term.openingCashOnHandCents,
      term.openingCashInBankCents,
      movements
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

export async function getDashboardBalances(
  academicYear?: string,
  semester?: Semester
) {
  const user = await requireOrgPortalUser();
  return getDashboardBalancesForUser(user, academicYear, semester);
}

export async function listCategoriesForType(type: TransactionType): Promise<CategoryDto[]> {
  await requireManagementUser();
  const categories = await prisma.transactionCategory.findMany({
    where: { type, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, active: true },
  });
  return categories;
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
  transfers: CashTransferDto[];
  categories: CategoryDto[];
  terms: { id: string; academicYear: string; semester: Semester; active: boolean }[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export async function getLedgerPageSnapshot(
  user: SessionUser,
  rawParams: Record<string, unknown> = {}
): Promise<LedgerPageSnapshotDto> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    return {
      selectedTerm: null,
      balances: null,
      transactions: [],
      transfers: [],
      categories: [],
      terms: [],
      pagination: { hasMore: false, nextCursor: null },
    };
  }

  const query = parseLedgerQueryParams(rawParams);

  return prisma.$transaction(async (tx) => {
    const terms = await tx.academicTerm.findMany({
      where: { organizationId: user.organizationId! },
      orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
      select: { id: true, academicYear: true, semester: true, active: true },
    });

    let selectedTermRecord;
    if (query.academicYear && query.semester) {
      selectedTermRecord = await tx.academicTerm.findFirst({
        where: { organizationId: user.organizationId!, academicYear: query.academicYear, semester: query.semester },
      });
    } else {
      selectedTermRecord = await tx.academicTerm.findFirst({
        where: { organizationId: user.organizationId!, active: true },
      });
    }

    if (!selectedTermRecord) {
      const categories = await tx.transactionCategory.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, type: true, active: true },
      });
      return {
        selectedTerm: null,
        balances: null,
        transactions: [],
        transfers: [],
        categories,
        terms,
        pagination: { hasMore: false, nextCursor: null },
      };
    }

    const termId = selectedTermRecord.id;

    // Load active transactions and transfers for selected term balance calculation
    const allActiveTxs = await tx.transaction.findMany({
      where: { organizationId: user.organizationId!, termId, deletedAt: null },
      select: { type: true, amountCents: true, cashAccount: true },
    });

    const allActiveTransfers = await tx.cashTransfer.findMany({
      where: { organizationId: user.organizationId!, termId, deletedAt: null },
      select: { amountCents: true, fromAccount: true, toAccount: true },
    });

    const movements = [
      ...financialRowsToMovements(allActiveTxs),
      ...transferRowsToMovements(allActiveTransfers),
    ];

    const balances = calculateAccountBalances(
      selectedTermRecord.openingCashOnHandCents,
      selectedTermRecord.openingCashInBankCents,
      movements
    );

    // Filtered transaction query building with date range intersection
    const dateRange = calculateEffectiveDateRange(query.month, query.dateFrom, query.dateTo);

    if (dateRange.invalid) {
      const categories = await tx.transactionCategory.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, type: true, active: true },
      });
      return {
        selectedTerm: {
          id: selectedTermRecord.id,
          academicYear: selectedTermRecord.academicYear,
          semester: selectedTermRecord.semester,
          openingCashOnHandCents: selectedTermRecord.openingCashOnHandCents,
          openingCashInBankCents: selectedTermRecord.openingCashInBankCents,
          balanceForwardedCents: selectedTermRecord.openingCashOnHandCents + selectedTermRecord.openingCashInBankCents,
          active: selectedTermRecord.active,
        },
        balances,
        transactions: [],
        transfers: [],
        categories,
        terms,
        pagination: { hasMore: false, nextCursor: null },
      };
    }

    const txWhere: Prisma.TransactionWhereInput = {
      organizationId: user.organizationId!,
      termId,
      deletedAt: null,
    };

    if (query.type) txWhere.type = query.type;
    if (query.categoryId) txWhere.categoryId = query.categoryId;
    if (query.cashAccount) txWhere.cashAccount = query.cashAccount;
    if (query.eventActivityName) txWhere.eventActivityName = { contains: query.eventActivityName };

    if (dateRange.gte || dateRange.lte) {
      txWhere.transactionDate = {
        ...(dateRange.gte ? { gte: dateRange.gte } : {}),
        ...(dateRange.lte ? { lte: dateRange.lte } : {}),
      };
    }

    if (query.search) {
      txWhere.OR = [
        { description: { contains: query.search } },
        { counterpartyName: { contains: query.search } },
        { documentNumber: { contains: query.search } },
        { referenceDescription: { contains: query.search } },
      ];
    }

    // Cursor pagination (fetch 1 extra row to check hasMore)
    const limit = query.pageSize;
    const fetchTake = limit + 1;

    const txsRaw = await tx.transaction.findMany({
      where: txWhere,
      take: fetchTake,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: transactionInclude,
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });

    const hasMore = txsRaw.length > limit;
    const paginatedTxs = hasMore ? txsRaw.slice(0, limit) : txsRaw;
    const nextCursor = hasMore && paginatedTxs.length > 0 ? paginatedTxs[paginatedTxs.length - 1].id : null;

    const categories = await tx.transactionCategory.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, active: true },
    });

    const transfersRaw = await tx.cashTransfer.findMany({
      where: { organizationId: user.organizationId!, termId, deletedAt: null },
      include: { recordedBy: { select: { fullName: true } } },
      orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
    });

    return {
      selectedTerm: {
        id: selectedTermRecord.id,
        academicYear: selectedTermRecord.academicYear,
        semester: selectedTermRecord.semester,
        openingCashOnHandCents: selectedTermRecord.openingCashOnHandCents,
        openingCashInBankCents: selectedTermRecord.openingCashInBankCents,
        balanceForwardedCents: selectedTermRecord.openingCashOnHandCents + selectedTermRecord.openingCashInBankCents,
        active: selectedTermRecord.active,
      },
      balances,
      transactions: paginatedTxs.map(toTransactionDto),
      transfers: transfersRaw.map((tr) => ({
        id: tr.id,
        organizationId: tr.organizationId,
        termId: tr.termId,
        transferDate: tr.transferDate,
        fromAccount: tr.fromAccount,
        toAccount: tr.toAccount,
        amountCents: tr.amountCents,
        documentNumber: tr.documentNumber,
        description: tr.description,
        referenceDescription: tr.referenceDescription,
        eventActivityName: tr.eventActivityName,
        recordedByUserId: tr.recordedByUserId,
        recordedByName: tr.recordedBy.fullName,
        version: tr.version,
        createdAt: tr.createdAt,
      })),
      categories,
      terms,
      pagination: {
        hasMore,
        nextCursor,
      },
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

export async function listLedgerTransactions(
  filters: Record<string, unknown>
): Promise<TransactionDto[]> {
  const user = await requireManagementUser();
  return listLedgerTransactionsForUser(filters, user);
}

export async function getTransactionForEditForUser(
  id: string,
  user: SessionUser
): Promise<TransactionDto | null> {
  if (!user || user.active === false || !user.organizationId || !isManagementRole(user.role)) {
    return null;
  }
  const transaction = await prisma.transaction.findFirst({
    where: { id, organizationId: user.organizationId },
    include: transactionInclude,
  });
  return transaction ? toTransactionDto(transaction) : null;
}

export async function getTransactionForEdit(id: string): Promise<TransactionDto | null> {
  const user = await requireManagementUser();
  return getTransactionForEditForUser(id, user);
}
