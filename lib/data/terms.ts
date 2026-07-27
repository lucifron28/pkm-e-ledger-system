import "server-only";
import { prisma } from "../db/prisma";
import { requireUser, requireManagementUser } from "../auth/require-auth";
import { Semester } from "@prisma/client";
import { calculateBalanceForwarded } from "./money";
export { SEMESTER_LABELS, getSemesterLabel, validateAcademicYear } from "./term-labels";

export interface TermDto {
  id: string;
  academicYear: string;
  semester: Semester;
  openingCashOnHandCents: number;
  openingCashInBankCents: number;
  balanceForwardedCents: number;
  active: boolean;
  createdAt: Date;
}

function toTermDto(term: {
  id: string;
  academicYear: string;
  semester: Semester;
  openingCashOnHandCents: number;
  openingCashInBankCents: number;
  active: boolean;
  createdAt: Date;
}): TermDto {
  return {
    id: term.id,
    academicYear: term.academicYear,
    semester: term.semester,
    openingCashOnHandCents: term.openingCashOnHandCents,
    openingCashInBankCents: term.openingCashInBankCents,
    balanceForwardedCents: calculateBalanceForwarded(
      term.openingCashOnHandCents,
      term.openingCashInBankCents
    ),
    active: term.active,
    createdAt: term.createdAt,
  };
}

/* Private raw-queries — never exported */
async function _listTermsForOrganization(
  organizationId: string
): Promise<TermDto[]> {
  const terms = await prisma.academicTerm.findMany({
    where: { organizationId },
    orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
  });
  return terms.map(toTermDto);
}

async function _getActiveTermForOrganization(
  organizationId: string
): Promise<TermDto | null> {
  const term = await prisma.academicTerm.findFirst({
    where: { organizationId, active: true },
  });
  return term ? toTermDto(term) : null;
}

async function _getTermById(
  termId: string,
  organizationId: string
): Promise<TermDto | null> {
  const term = await prisma.academicTerm.findFirst({
    where: { id: termId, organizationId },
  });
  return term ? toTermDto(term) : null;
}

/**
 * Returns the active term for the currently authenticated user's organization.
 * Uses requireUser — safe for any authenticated role.
 */
export async function getActiveTermForCurrentUser(): Promise<TermDto | null> {
  const user = await requireUser();
  if (!user.organizationId) return null;
  return _getActiveTermForOrganization(user.organizationId);
}

/**
 * Lists all terms for the currently authenticated management user's organization.
 */
export async function listTermsForCurrentUser(): Promise<TermDto[]> {
  const user = await requireManagementUser();
  if (!user.organizationId) return [];
  return _listTermsForOrganization(user.organizationId);
}

/**
 * Retrieves a single term by ID, scoped to the authenticated management user's organization.
 */
export async function getTermByIdForCurrentUser(
  termId: string
): Promise<TermDto | null> {
  const user = await requireManagementUser();
  if (!user.organizationId) return null;
  return _getTermById(termId, user.organizationId);
}
