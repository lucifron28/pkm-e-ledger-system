import "server-only";
import { prisma } from "../db/prisma";
import { requireOrgPortalUser, requireManagementUser, SessionUser } from "../auth/require-auth";
import { isOrganizationPortalRole } from "../auth/rbac";
import { Role, Semester } from "@prisma/client";
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
  version: number;
  createdAt: Date;
}

function toTermDto(term: {
  id: string;
  academicYear: string;
  semester: Semester;
  openingCashOnHandCents: number;
  openingCashInBankCents: number;
  active: boolean;
  version: number;
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
    version: term.version,
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
 * Uses requireOrgPortalUser — safe for organization portal roles.
 */
export async function getActiveTermForUser(user: SessionUser): Promise<TermDto | null> {
  if (!user || user.active === false || !user.organizationId || user.role === Role.OSA || !isOrganizationPortalRole(user.role)) {
    return null;
  }
  return _getActiveTermForOrganization(user.organizationId);
}

export async function getActiveTermForCurrentUser(): Promise<TermDto | null> {
  const user = await requireOrgPortalUser();
  return getActiveTermForUser(user);
}

export async function listTermsForUser(user: SessionUser): Promise<TermDto[]> {
  if (!user || user.active === false || !user.organizationId || user.role === Role.OSA || !isOrganizationPortalRole(user.role)) {
    return [];
  }
  return _listTermsForOrganization(user.organizationId);
}

export async function listTermsForCurrentUser(): Promise<TermDto[]> {
  const user = await requireOrgPortalUser();
  return listTermsForUser(user);
}

export async function getTermByIdForUser(
  termId: string,
  user: SessionUser
): Promise<TermDto | null> {
  if (!user || user.active === false || !user.organizationId || user.role === Role.OSA || !isOrganizationPortalRole(user.role)) {
    return null;
  }
  return _getTermById(termId, user.organizationId);
}

export async function getTermByIdForCurrentUser(
  termId: string
): Promise<TermDto | null> {
  const user = await requireManagementUser();
  return getTermByIdForUser(termId, user);
}
