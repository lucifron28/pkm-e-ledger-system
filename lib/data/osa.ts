import "server-only";
import { prisma } from "../db/prisma";
import { requireOsaUser, SessionUser } from "../auth/require-auth";
import {
  calculateAccountBalances,
  financialRowsToMovements,
  transferRowsToMovements,
} from "../domain/financial";
import { getSemesterLabel } from "../domain/term-labels";
import { Role, Semester, TransactionType } from "@prisma/client";

export interface OsaOrganizationSummaryDto {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  hasActiveTerm: boolean;
  termId: string | null;
  academicYear: string | null;
  semester: Semester | null;
  semesterLabel: string | null;
  openingCashOnHandCents: number;
  openingCashInBankCents: number;
  balanceForwardedCents: number;
  totalIncomeCents: number;
  totalExpenseCents: number;
  endingCashOnHandCents: number;
  endingCashInBankCents: number;
  remainingCents: number;
  lastActivityDate: Date | null;
}

export interface CategorySubtotalDto {
  categoryId: string;
  categoryName: string;
  type: TransactionType;
  totalCents: number;
}

export interface OsaLedgerSummaryDto {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  termId: string;
  academicYear: string;
  semester: Semester;
  semesterLabel: string;
  active: boolean;
  openingCashOnHandCents: number;
  openingCashInBankCents: number;
  balanceForwardedCents: number;
  totalIncomeCents: number;
  totalExpenseCents: number;
  endingCashOnHandCents: number;
  endingCashInBankCents: number;
  remainingCents: number;
  incomeCategoryTotals: CategorySubtotalDto[];
  expenseCategoryTotals: CategorySubtotalDto[];
  lastActivityDate: Date | null;
}

export async function validateOsaOrganizationForUser(
  orgSlugOrId: string,
  user: SessionUser
) {
  if (!user || user.active === false || user.role !== Role.OSA) {
    throw new Error("Access denied: OSA monitoring access required.");
  }
  if (typeof orgSlugOrId !== "string" || !orgSlugOrId.trim()) return null;

  return prisma.organization.findFirst({
    where: {
      active: true,
      OR: [{ id: orgSlugOrId.trim() }, { slug: orgSlugOrId.trim() }],
    },
    select: { id: true, name: true, slug: true },
  });
}

export async function validateOsaOrganization(orgSlugOrId: string) {
  const user = await requireOsaUser();
  return validateOsaOrganizationForUser(orgSlugOrId, user);
}

/**
 * Returns a list of safe financial summaries for all active recognized organizations (OSA only).
 * Uses a single read transaction to eliminate N+1 queries.
 */
export async function listOsaOrganizationsOverview(): Promise<OsaOrganizationSummaryDto[]> {
  await requireOsaUser();

  return prisma.$transaction(async (tx) => {
    const organizations = await tx.organization.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    });

    if (organizations.length === 0) return [];

    const orgIds = organizations.map((o) => o.id);
    const activeTerms = await tx.academicTerm.findMany({
      where: { organizationId: { in: orgIds }, active: true },
    });

    const activeTermMap = new Map(activeTerms.map((t) => [t.organizationId, t]));
    const activeTermIds = activeTerms.map((t) => t.id);

    const transactions = activeTermIds.length > 0
      ? await tx.transaction.findMany({
          where: { termId: { in: activeTermIds }, deletedAt: null },
          select: { termId: true, type: true, amountCents: true, cashAccount: true, transactionDate: true },
          orderBy: { transactionDate: "desc" },
        })
      : [];

    const transfers = activeTermIds.length > 0
      ? await tx.cashTransfer.findMany({
          where: { termId: { in: activeTermIds }, deletedAt: null },
          select: { termId: true, amountCents: true, fromAccount: true, toAccount: true, transferDate: true },
          orderBy: { transferDate: "desc" },
        })
      : [];

    const txsByTerm = new Map<string, typeof transactions>();
    for (const t of transactions) {
      if (!txsByTerm.has(t.termId)) txsByTerm.set(t.termId, []);
      txsByTerm.get(t.termId)!.push(t);
    }

    const transfersByTerm = new Map<string, typeof transfers>();
    for (const tr of transfers) {
      if (!transfersByTerm.has(tr.termId)) transfersByTerm.set(tr.termId, []);
      transfersByTerm.get(tr.termId)!.push(tr);
    }

    const result: OsaOrganizationSummaryDto[] = [];

    for (const org of organizations) {
      const activeTerm = activeTermMap.get(org.id);

      if (!activeTerm) {
        result.push({
          organizationId: org.id,
          organizationName: org.name,
          organizationSlug: org.slug,
          hasActiveTerm: false,
          termId: null,
          academicYear: null,
          semester: null,
          semesterLabel: null,
          openingCashOnHandCents: 0,
          openingCashInBankCents: 0,
          balanceForwardedCents: 0,
          totalIncomeCents: 0,
          totalExpenseCents: 0,
          endingCashOnHandCents: 0,
          endingCashInBankCents: 0,
          remainingCents: 0,
          lastActivityDate: null,
        });
        continue;
      }

      const termTxs = txsByTerm.get(activeTerm.id) || [];
      const termTransfers = transfersByTerm.get(activeTerm.id) || [];

      const movements = [
        ...financialRowsToMovements(termTxs),
        ...transferRowsToMovements(termTransfers),
      ];

      const balances = calculateAccountBalances(
        activeTerm.openingCashOnHandCents,
        activeTerm.openingCashInBankCents,
        movements
      );

      let lastActivityDate: Date | null = null;
      if (termTxs.length > 0 && termTransfers.length > 0) {
        lastActivityDate = termTxs[0].transactionDate > termTransfers[0].transferDate ? termTxs[0].transactionDate : termTransfers[0].transferDate;
      } else if (termTxs.length > 0) {
        lastActivityDate = termTxs[0].transactionDate;
      } else if (termTransfers.length > 0) {
        lastActivityDate = termTransfers[0].transferDate;
      }

      result.push({
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
        hasActiveTerm: true,
        termId: activeTerm.id,
        academicYear: activeTerm.academicYear,
        semester: activeTerm.semester,
        semesterLabel: getSemesterLabel(activeTerm.semester),

        openingCashOnHandCents: activeTerm.openingCashOnHandCents,
        openingCashInBankCents: activeTerm.openingCashInBankCents,
        balanceForwardedCents: activeTerm.openingCashOnHandCents + activeTerm.openingCashInBankCents,

        totalIncomeCents: balances.totalIncomeCents,
        totalExpenseCents: balances.totalExpenseCents,

        endingCashOnHandCents: balances.cashOnHandCents,
        endingCashInBankCents: balances.cashInBankCents,
        remainingCents: balances.remainingCents,

        lastActivityDate,
      });
    }

    return result;
  });
}

export async function listTermsForOsaOrganization(
  orgSlugOrId: string
): Promise<{ id: string; academicYear: string; semester: Semester; active: boolean }[]> {
  const org = await validateOsaOrganization(orgSlugOrId);
  if (!org) return [];

  return prisma.academicTerm.findMany({
    where: { organizationId: org.id },
    orderBy: [{ academicYear: "desc" }, { semester: "desc" }],
    select: { id: true, academicYear: true, semester: true, active: true },
  });
}

export async function getOsaLedgerSummaryForUser(
  orgSlugOrId: string,
  user: SessionUser,
  academicYear?: string,
  semester?: Semester
): Promise<OsaLedgerSummaryDto | null> {
  if (!user || user.active === false || user.role !== Role.OSA) {
    throw new Error("Access denied: OSA monitoring access required.");
  }
  const organizationKey = typeof orgSlugOrId === "string" ? orgSlugOrId.trim() : "";
  if (!organizationKey) return null;

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.findFirst({
      where: {
        active: true,
        OR: [{ id: organizationKey }, { slug: organizationKey }],
      },
      select: { id: true, name: true, slug: true },
    });
    if (!org) return null;

    let term;
    if (academicYear && semester) {
      term = await tx.academicTerm.findFirst({
        where: { organizationId: org.id, academicYear, semester },
      });
    } else {
      term = await tx.academicTerm.findFirst({
        where: { organizationId: org.id, active: true },
      });
    }

    if (!term) return null;

    const transactions = await tx.transaction.findMany({
      where: { organizationId: org.id, termId: term.id, deletedAt: null },
      include: { category: { select: { id: true, name: true, type: true } } },
      orderBy: { transactionDate: "desc" },
    });

    const transfers = await tx.cashTransfer.findMany({
      where: { organizationId: org.id, termId: term.id, deletedAt: null },
      select: { amountCents: true, fromAccount: true, toAccount: true, transferDate: true },
      orderBy: { transferDate: "desc" },
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

    const incomeCategoryMap = new Map<string, { categoryName: string; totalCents: number }>();
    const expenseCategoryMap = new Map<string, { categoryName: string; totalCents: number }>();

    for (const t of transactions) {
      const map = t.type === TransactionType.INCOME ? incomeCategoryMap : expenseCategoryMap;
      const catId = t.categoryId;
      const catName = t.category.name;

      if (!map.has(catId)) {
        map.set(catId, { categoryName: catName, totalCents: 0 });
      }
      map.get(catId)!.totalCents += t.amountCents;
    }

    const incomeCategoryTotals: CategorySubtotalDto[] = Array.from(incomeCategoryMap.entries()).map(
      ([id, v]) => ({
        categoryId: id,
        categoryName: v.categoryName,
        type: TransactionType.INCOME,
        totalCents: v.totalCents,
      })
    );

    const expenseCategoryTotals: CategorySubtotalDto[] = Array.from(expenseCategoryMap.entries()).map(
      ([id, v]) => ({
        categoryId: id,
        categoryName: v.categoryName,
        type: TransactionType.EXPENSE,
        totalCents: v.totalCents,
      })
    );

    let lastActivityDate: Date | null = null;
    if (transactions.length > 0 && transfers.length > 0) {
      lastActivityDate = transactions[0].transactionDate > transfers[0].transferDate ? transactions[0].transactionDate : transfers[0].transferDate;
    } else if (transactions.length > 0) {
      lastActivityDate = transactions[0].transactionDate;
    } else if (transfers.length > 0) {
      lastActivityDate = transfers[0].transferDate;
    }

    return {
      organizationId: org.id,
      organizationName: org.name,
      organizationSlug: org.slug,
      termId: term.id,
      academicYear: term.academicYear,
      semester: term.semester,
      semesterLabel: getSemesterLabel(term.semester),
      active: term.active,

      openingCashOnHandCents: term.openingCashOnHandCents,
      openingCashInBankCents: term.openingCashInBankCents,
      balanceForwardedCents: term.openingCashOnHandCents + term.openingCashInBankCents,

      totalIncomeCents: balances.totalIncomeCents,
      totalExpenseCents: balances.totalExpenseCents,

      endingCashOnHandCents: balances.cashOnHandCents,
      endingCashInBankCents: balances.cashInBankCents,
      remainingCents: balances.remainingCents,

      incomeCategoryTotals,
      expenseCategoryTotals,

      lastActivityDate,
    };
  });
}

export async function getOsaLedgerSummary(
  orgSlugOrId: string,
  academicYear?: string,
  semester?: Semester
): Promise<OsaLedgerSummaryDto | null> {
  const user = await requireOsaUser();
  return getOsaLedgerSummaryForUser(orgSlugOrId, user, academicYear, semester);
}
