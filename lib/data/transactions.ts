import "server-only";
import { prisma } from "../db/prisma";
import { requireUser, requireManagementUser } from "../auth/require-auth";
import {
  TransactionType,
  CashAccount,
  Prisma,
} from "@prisma/client";

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
  recordedByUsername: string;
  recordedByFullName: string;
  deletedAt: Date | null;
  deleteReason: string | null;
  createdAt: Date;
}

export interface BalanceSnapshot {
  cashOnHandCents: number;
  cashInBankCents: number;
  totalIncomeCents: number;
  totalExpenseCents: number;
  remainingCents: number;
}

export interface CategoryDto {
  id: string;
  name: string;
  type: TransactionType;
  active: boolean;
}

function toTransactionDto(tx: Record<string, unknown>): TransactionDto {
  return {
    id: tx.id as string,
    organizationId: tx.organizationId as string,
    termId: tx.termId as string,
    type: tx.type as TransactionType,
    documentNumber: tx.documentNumber as string | null,
    transactionDate: tx.transactionDate as Date,
    amountCents: tx.amountCents as number,
    cashAccount: tx.cashAccount as CashAccount,
    categoryId: tx.categoryId as string,
    categoryName: (tx as { category: { name: string } }).category?.name ?? "",
    counterpartyName: tx.counterpartyName as string | null,
    description: tx.description as string,
    referenceDescription: tx.referenceDescription as string,
    eventActivityName: tx.eventActivityName as string | null,
    recordedByUsername: (tx as { recordedBy: { username: string } }).recordedBy?.username ?? "",
    recordedByFullName: (tx as { recordedBy: { fullName: string } }).recordedBy?.fullName ?? "",
    deletedAt: tx.deletedAt as Date | null,
    deleteReason: tx.deleteReason as string | null,
    createdAt: tx.createdAt as Date,
  };
}

/* ─── Private raw queries ─── */

async function _getAvailableBalance(
  organizationId: string,
  termId: string,
  cashAccount: CashAccount,
  excludeTransactionId?: string
): Promise<number> {
  const term = await prisma.academicTerm.findFirst({
    where: { id: termId, organizationId },
  });
  if (!term) return 0;

  const opening =
    cashAccount === CashAccount.CASH_ON_HAND
      ? term.openingCashOnHandCents
      : term.openingCashInBankCents;

  const txFilter: Prisma.TransactionWhereInput = {
    organizationId,
    termId,
    cashAccount,
    deletedAt: null,
    ...(excludeTransactionId ? { id: { not: excludeTransactionId } } : {}),
  };

  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...txFilter, type: TransactionType.INCOME },
      _sum: { amountCents: true },
    }),
    prisma.transaction.aggregate({
      where: { ...txFilter, type: TransactionType.EXPENSE },
      _sum: { amountCents: true },
    }),
  ]);

  return (
    opening +
    (incomeAgg._sum.amountCents ?? 0) -
    (expenseAgg._sum.amountCents ?? 0)
  );
}

async function _getBalanceSnapshot(
  organizationId: string,
  termId: string
): Promise<BalanceSnapshot> {
  const term = await prisma.academicTerm.findFirst({
    where: { id: termId, organizationId },
  });
  if (!term) return { cashOnHandCents: 0, cashInBankCents: 0, totalIncomeCents: 0, totalExpenseCents: 0, remainingCents: 0 };

  const baseFilter: Prisma.TransactionWhereInput = {
    organizationId,
    termId,
    deletedAt: null,
  };

  const [cohIncome, cohExpense, cibIncome, cibExpense] = await Promise.all([
    prisma.transaction.aggregate({ where: { ...baseFilter, type: TransactionType.INCOME, cashAccount: CashAccount.CASH_ON_HAND }, _sum: { amountCents: true } }),
    prisma.transaction.aggregate({ where: { ...baseFilter, type: TransactionType.EXPENSE, cashAccount: CashAccount.CASH_ON_HAND }, _sum: { amountCents: true } }),
    prisma.transaction.aggregate({ where: { ...baseFilter, type: TransactionType.INCOME, cashAccount: CashAccount.CASH_IN_BANK }, _sum: { amountCents: true } }),
    prisma.transaction.aggregate({ where: { ...baseFilter, type: TransactionType.EXPENSE, cashAccount: CashAccount.CASH_IN_BANK }, _sum: { amountCents: true } }),
  ]);

  const totalIncome = (cohIncome._sum.amountCents ?? 0) + (cibIncome._sum.amountCents ?? 0);
  const totalExpense = (cohExpense._sum.amountCents ?? 0) + (cibExpense._sum.amountCents ?? 0);
  const remaining =
    term.openingCashOnHandCents + term.openingCashInBankCents + totalIncome - totalExpense;

  return {
    cashOnHandCents:
      term.openingCashOnHandCents +
      (cohIncome._sum.amountCents ?? 0) -
      (cohExpense._sum.amountCents ?? 0),
    cashInBankCents:
      term.openingCashInBankCents +
      (cibIncome._sum.amountCents ?? 0) -
      (cibExpense._sum.amountCents ?? 0),
    totalIncomeCents: totalIncome,
    totalExpenseCents: totalExpense,
    remainingCents: remaining,
  };
}

async function _listCategories(type: TransactionType): Promise<CategoryDto[]> {
  const cats = await prisma.transactionCategory.findMany({
    where: { type, active: true },
    orderBy: { name: "asc" },
  });
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    active: c.active,
  }));
}

async function _getTransactionById(
  id: string,
  organizationId: string
): Promise<TransactionDto | null> {
  const tx = await prisma.transaction.findFirst({
    where: { id, organizationId },
    include: {
      category: { select: { name: true } },
      recordedBy: { select: { username: true, fullName: true } },
    },
  });
  if (!tx) return null;
  return toTransactionDto(tx as unknown as Record<string, unknown>);
}

export interface TransactionFilters {
  type?: TransactionType | null;
  categoryId?: string | null;
  cashAccount?: CashAccount | null;
  month?: string | null;
  eventActivityName?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
}

async function _listTransactions(
  organizationId: string,
  termId: string,
  filters: TransactionFilters
): Promise<TransactionDto[]> {
  const where: Prisma.TransactionWhereInput = {
    organizationId,
    termId,
    deletedAt: null,
  };

  if (filters.type) where.type = filters.type;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.cashAccount) where.cashAccount = filters.cashAccount;
  if (filters.eventActivityName) where.eventActivityName = filters.eventActivityName;

  if (filters.month) {
    const year = parseInt(filters.month.split("-")[0], 10);
    const month = parseInt(filters.month.split("-")[1], 10);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    where.transactionDate = { gte: start, lte: end };
  }

  if (filters.dateFrom || filters.dateTo) {
    where.transactionDate = {};
    if (filters.dateFrom) {
      (where.transactionDate as Prisma.DateTimeFilter).gte = new Date(`${filters.dateFrom}T00:00:00.000Z`);
    }
    if (filters.dateTo) {
      (where.transactionDate as Prisma.DateTimeFilter).lte = new Date(`${filters.dateTo}T23:59:59.999Z`);
    }
  }

  if (filters.search) {
    const term = filters.search;
    where.OR = [
      { description: { contains: term } },
      { counterpartyName: { contains: term } },
      { documentNumber: { contains: term } },
      { referenceDescription: { contains: term } },
    ];
  }

  const txs = await prisma.transaction.findMany({
    where,
    include: {
      category: { select: { name: true } },
      recordedBy: { select: { username: true, fullName: true } },
    },
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
  });

  return txs.map((t) => toTransactionDto(t as unknown as Record<string, unknown>));
}

async function _listDeletedTransactions(
  organizationId: string,
  take?: number
): Promise<TransactionDto[]> {
  const txs = await prisma.transaction.findMany({
    where: { organizationId, deletedAt: { not: null } },
    include: {
      category: { select: { name: true } },
      recordedBy: { select: { username: true, fullName: true } },
      deletedBy: { select: { username: true } },
    },
    orderBy: { deletedAt: "desc" },
    take: take ?? 50,
  });
  return txs.map((t) => toTransactionDto(t as unknown as Record<string, unknown>));
}

/* ─── Authorized wrappers ─── */

export async function getDashboardBalances(): Promise<BalanceSnapshot | null> {
  const user = await requireUser();
  if (!user.organizationId) return null;
  const term = await prisma.academicTerm.findFirst({
    where: { organizationId: user.organizationId, active: true },
  });
  if (!term) return null;
  return _getBalanceSnapshot(user.organizationId, term.id);
}

export async function getAvailableBalanceForAccount(
  cashAccount: CashAccount,
  excludeTransactionId?: string
): Promise<number> {
  const user = await requireManagementUser();
  if (!user.organizationId) return 0;
  const term = await prisma.academicTerm.findFirst({
    where: { organizationId: user.organizationId, active: true },
  });
  if (!term) return 0;
  return _getAvailableBalance(user.organizationId, term.id, cashAccount, excludeTransactionId);
}

export async function listCategoriesForType(
  type: TransactionType
): Promise<CategoryDto[]> {
  return _listCategories(type);
}

export async function listLedgerTransactions(
  filters: TransactionFilters
): Promise<TransactionDto[]> {
  const user = await requireManagementUser();
  if (!user.organizationId) return [];
  const term = await prisma.academicTerm.findFirst({
    where: { organizationId: user.organizationId, active: true },
  });
  if (!term) return [];
  return _listTransactions(user.organizationId, term.id, filters);
}

export async function getTransactionForEdit(
  id: string
): Promise<TransactionDto | null> {
  const user = await requireManagementUser();
  if (!user.organizationId) return null;
  return _getTransactionById(id, user.organizationId);
}

export async function listDeletedTransactionsForAudit(
  take?: number
): Promise<TransactionDto[]> {
  const user = await requireManagementUser();
  if (!user.organizationId) return [];
  return _listDeletedTransactions(user.organizationId, take);
}

/* Re-export for actions */
export { _getAvailableBalance, _getBalanceSnapshot, _listCategories, _getTransactionById };
