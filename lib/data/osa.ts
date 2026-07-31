import "server-only";
import { prisma } from "../db/prisma";
import { requireOsaUser, SessionUser } from "../auth/require-auth";
import { calculateAccountBalances } from "../domain/financial";
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

function getSemesterLabel(semester: Semester): string {
  switch (semester) {
    case Semester.FIRST_SEMESTER:
      return "1st Semester";
    case Semester.SECOND_SEMESTER:
      return "2nd Semester";
    case Semester.MIDYEAR_SUMMER:
      return "Midyear / Summer";
    default:
      return semester;
  }
}

/**
 * Validates that an organization exists by ID or slug and is active.
 * Only callable by authenticated OSA users.
 */
export async function validateOsaOrganizationForUser(
  orgSlugOrId: string,
  user: SessionUser
) {
  if (user.role !== Role.OSA) {
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
 * Returns a list of safe financial summaries for all active recognized organizations.
 * Callable strictly by OSA monitoring role.
 */
export async function listOsaOrganizationsOverview(): Promise<OsaOrganizationSummaryDto[]> {
  await requireOsaUser();

  const organizations = await prisma.organization.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  const result: OsaOrganizationSummaryDto[] = [];

  for (const org of organizations) {
    // Find active term for org
    const activeTerm = await prisma.academicTerm.findFirst({
      where: { organizationId: org.id, active: true },
    });

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

    // Fetch active (non-deleted) transactions for active term
    const rows = await prisma.transaction.findMany({
      where: { organizationId: org.id, termId: activeTerm.id, deletedAt: null },
      select: { type: true, amountCents: true, cashAccount: true, transactionDate: true },
      orderBy: { transactionDate: "desc" },
    });

    const balances = calculateAccountBalances(
      activeTerm.openingCashOnHandCents,
      activeTerm.openingCashInBankCents,
      rows
    );

    const lastActivityDate = rows.length > 0 ? rows[0].transactionDate : null;

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
}

/**
 * Returns academic terms for a specific active organization (OSA only).
 */
export async function listTermsForOsaOrganization(
  orgSlugOrId: string
): Promise<{ id: string; academicYear: string; semester: Semester; active: boolean }[]> {
  const org = await validateOsaOrganization(orgSlugOrId);
  if (!org) return [];

  return prisma.academicTerm.findMany({
    where: { organizationId: org.id },
    orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
    select: { id: true, academicYear: true, semester: true, active: true },
  });
}

/**
 * Returns a summarized ledger DTO for a specific organization and academic term (OSA only).
 * Contains NO individual transaction rows.
 */
export async function getOsaLedgerSummaryForUser(
  orgSlugOrId: string,
  user: SessionUser,
  academicYear?: string,
  semester?: Semester
): Promise<OsaLedgerSummaryDto | null> {
  const org = await validateOsaOrganizationForUser(orgSlugOrId, user);
  if (!org) return null;

  let term;
  if (academicYear && semester) {
    term = await prisma.academicTerm.findFirst({
      where: { organizationId: org.id, academicYear, semester },
    });
  } else {
    term = await prisma.academicTerm.findFirst({
      where: { organizationId: org.id, active: true },
    });
  }

  if (!term) return null;

  const transactions = await prisma.transaction.findMany({
    where: { organizationId: org.id, termId: term.id, deletedAt: null },
    include: { category: { select: { id: true, name: true, type: true } } },
    orderBy: { transactionDate: "desc" },
  });

  const balances = calculateAccountBalances(
    term.openingCashOnHandCents,
    term.openingCashInBankCents,
    transactions.map((t) => ({ type: t.type, amountCents: t.amountCents, cashAccount: t.cashAccount }))
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

  const lastActivityDate = transactions.length > 0 ? transactions[0].transactionDate : null;

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
}

export async function getOsaLedgerSummary(
  orgSlugOrId: string,
  academicYear?: string,
  semester?: Semester
): Promise<OsaLedgerSummaryDto | null> {
  const user = await requireOsaUser();
  return getOsaLedgerSummaryForUser(orgSlugOrId, user, academicYear, semester);
}
