import "server-only";
import { prisma } from "../db/prisma";
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

export async function listTermsForOrganization(
  organizationId: string
): Promise<TermDto[]> {
  const terms = await prisma.academicTerm.findMany({
    where: { organizationId },
    orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
  });

  return terms.map(toTermDto);
}

export async function getActiveTermForOrganization(
  organizationId: string
): Promise<TermDto | null> {
  const term = await prisma.academicTerm.findFirst({
    where: { organizationId, active: true },
  });

  return term ? toTermDto(term) : null;
}

export async function getTermById(
  termId: string,
  organizationId: string
): Promise<TermDto | null> {
  const term = await prisma.academicTerm.findFirst({
    where: { id: termId, organizationId },
  });

  return term ? toTermDto(term) : null;
}
