import "server-only";
import { prisma } from "../db/prisma";
import { requireManagementUser, requireUser } from "../auth/require-auth";
import { calculateAccountBalances, type AccountBalances } from "../domain/financial";
import {
  CashAccount,
  Prisma,
  Semester,
  TransactionType,
} from "@prisma/client";

export interface AttachmentDto {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface TransactionDto {
  id: string;
  termId: string;
  academicYear: string;
  semester: Semester;
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
  createdAt: Date;
  deletedAt: Date | null;
  deleteReason: string | null;
  attachments: AttachmentDto[];
}

export type BalanceSnapshot = AccountBalances;

export interface CategoryDto {
  id: string;
  name: string;
  type: TransactionType;
  active: boolean;
}

export interface TransactionFilters {
  academicYear?: string | null;
  semester?: Semester | null;
  type?: TransactionType | null;
  categoryId?: string | null;
  cashAccount?: CashAccount | null;
  month?: string | null;
  eventActivityName?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
}

const transactionInclude = {
  category: { select: { name: true } },
  term: { select: { academicYear: true, semester: true } },
  recordedBy: { select: { username: true, fullName: true } },
  attachments: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

type TransactionWithDetails = Prisma.TransactionGetPayload<{
  include: typeof transactionInclude;
}>;

function toTransactionDto(tx: TransactionWithDetails): TransactionDto {
  return {
    id: tx.id,
    termId: tx.termId,
    academicYear: tx.term.academicYear,
    semester: tx.term.semester,
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
    recordedByUsername: tx.recordedBy.username,
    recordedByFullName: tx.recordedBy.fullName,
    createdAt: tx.createdAt,
    deletedAt: tx.deletedAt,
    deleteReason: tx.deleteReason,
    attachments: tx.attachments,
  };
}

async function getRowsForTerm(organizationId: string, termId: string) {
  return prisma.transaction.findMany({
    where: { organizationId, termId, deletedAt: null },
    select: { type: true, amountCents: true, cashAccount: true },
  });
}

async function getBalanceSnapshotForTerm(
  organizationId: string,
  termId: string
): Promise<BalanceSnapshot | null> {
  const term = await prisma.academicTerm.findFirst({
    where: { id: termId, organizationId },
    select: { openingCashOnHandCents: true, openingCashInBankCents: true },
  });
  if (!term) return null;
  const rows = await getRowsForTerm(organizationId, termId);
  return calculateAccountBalances(term.openingCashOnHandCents, term.openingCashInBankCents, rows);
}

export async function getDashboardBalances(): Promise<BalanceSnapshot | null> {
  const user = await requireUser();
  if (!user.organizationId) return null;
  const term = await prisma.academicTerm.findFirst({
    where: { organizationId: user.organizationId, active: true },
    select: { id: true },
  });
  if (!term) return null;
  return getBalanceSnapshotForTerm(user.organizationId, term.id);
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
  const user = await requireManagementUser();
  if (!user.organizationId) return [];
  return prisma.academicTerm.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
    select: { id: true, academicYear: true, semester: true, active: true },
  });
}

function parseValidFilterDate(value?: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export async function listLedgerTransactions(
  filters: TransactionFilters
): Promise<TransactionDto[]> {
  const user = await requireManagementUser();
  if (!user.organizationId) return [];

  const activeTerm = await prisma.academicTerm.findFirst({
    where: { organizationId: user.organizationId, active: true },
    select: { academicYear: true, semester: true },
  });
  if (!activeTerm) return [];

  const term = await prisma.academicTerm.findFirst({
    where: {
      organizationId: user.organizationId,
      academicYear: filters.academicYear ?? activeTerm.academicYear,
      semester: filters.semester ?? activeTerm.semester,
    },
    select: { id: true },
  });
  if (!term) return [];

  const where: Prisma.TransactionWhereInput = {
    organizationId: user.organizationId,
    termId: term.id,
    deletedAt: null,
  };
  if (filters.type) where.type = filters.type;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.cashAccount) where.cashAccount = filters.cashAccount;
  if (filters.eventActivityName) where.eventActivityName = { contains: filters.eventActivityName.trim() };

  if (filters.month) {
    const trimmedMonth = filters.month.trim();
    const match = /^(\d{4})-(\d{2})$/.exec(trimmedMonth);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (month >= 1 && month <= 12) {
        where.transactionDate = {
          gte: new Date(Date.UTC(year, month - 1, 1)),
          lte: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
        };
      }
    }
  }

  const validFrom = parseValidFilterDate(filters.dateFrom);
  const validTo = parseValidFilterDate(filters.dateTo);
  if (validFrom || validTo) {
    where.transactionDate = {
      ...(validFrom ? { gte: validFrom } : {}),
      ...(validTo ? { lte: new Date(validTo.getTime() + 86399999) } : {}),
    };
  }

  if (filters.search) {
    const searchTrimmed = filters.search.trim();
    if (searchTrimmed) {
      where.OR = [
        { description: { contains: searchTrimmed } },
        { counterpartyName: { contains: searchTrimmed } },
        { documentNumber: { contains: searchTrimmed } },
        { referenceDescription: { contains: searchTrimmed } },
      ];
    }
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: transactionInclude,
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
  });
  return transactions.map(toTransactionDto);
}

export async function getTransactionForEdit(id: string): Promise<TransactionDto | null> {
  const user = await requireManagementUser();
  if (!user.organizationId) return null;
  const transaction = await prisma.transaction.findFirst({
    where: { id, organizationId: user.organizationId },
    include: transactionInclude,
  });
  return transaction ? toTransactionDto(transaction) : null;
}

export async function listTransactionAttachments(transactionId: string): Promise<AttachmentDto[]> {
  const user = await requireManagementUser();
  if (!user.organizationId) return [];
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!transaction) return [];
  return prisma.attachment.findMany({
    where: { transactionId },
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}
