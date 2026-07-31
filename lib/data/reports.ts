import "server-only";
import { prisma } from "../db/prisma";
import { requireOrgPortalUser, requireOsaUser, SessionUser } from "../auth/require-auth";
import { Role, Semester } from "@prisma/client";
import { isOrganizationPortalRole } from "../auth/rbac";
import {
  SCHEDULE_2_BUCKETS,
  Schedule2Bucket,
  getSchedule2BucketKey,
  buildReportPackage,
  CollectionItemDto,
  CollectionCategoryGroupDto,
  ExpenseBucketSummaryDto,
  ExpenseRowItemDto,
  AttachmentReferenceDto,
  ReportPackageDto,
} from "../domain/reports";

export {
  SCHEDULE_2_BUCKETS,
  getSchedule2BucketKey,
};
export type {
  Schedule2Bucket,
  CollectionItemDto,
  CollectionCategoryGroupDto,
  ExpenseBucketSummaryDto,
  ExpenseRowItemDto,
  AttachmentReferenceDto,
  ReportPackageDto,
};



async function _getReportPackageForTermInternal(
  organizationId: string,
  termId: string
): Promise<ReportPackageDto | null> {
  const term = await prisma.academicTerm.findFirst({
    where: { id: termId, organizationId },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  if (!term) return null;

  const transactions = await prisma.transaction.findMany({
    where: {
      organizationId,
      termId: term.id,
      deletedAt: null,
    },
    include: {
      category: { select: { id: true, name: true, type: true } },
      attachments: {
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
  });

  return buildReportPackage(term, transactions);
}

export async function getReportPackageForUser(
  user: SessionUser,
  termId: string
): Promise<ReportPackageDto | null> {
  if (!user || user.active === false || !user.organizationId || user.role === Role.OSA || !isOrganizationPortalRole(user.role)) {
    return null;
  }
  return _getReportPackageForTermInternal(user.organizationId, termId);
}

export async function getReportPackageForTerm(
  termId: string
): Promise<ReportPackageDto | null> {
  const user = await requireOrgPortalUser();
  return getReportPackageForUser(user, termId);
}
export async function getReportPackageForCurrentUser(
  academicYear?: string,
  semester?: Semester
): Promise<ReportPackageDto | null> {
  const user = await requireOrgPortalUser();

  let term;
  if (academicYear && semester) {
    term = await prisma.academicTerm.findFirst({
      where: { organizationId: user.organizationId, academicYear, semester },
      select: { id: true },
    });
  } else {
    term = await prisma.academicTerm.findFirst({
      where: { organizationId: user.organizationId, active: true },
      select: { id: true },
    });
  }

  if (!term) return null;
  return _getReportPackageForTermInternal(user.organizationId, term.id);
}

export async function getReportPackageForOsa(
  orgSlugOrId: string,
  academicYear?: string,
  semester?: Semester
): Promise<ReportPackageDto | null> {
  await requireOsaUser();

  const organization = await prisma.organization.findFirst({
    where: {
      active: true,
      OR: [{ id: orgSlugOrId }, { slug: orgSlugOrId }],
    },
    select: { id: true },
  });
  if (!organization) return null;

  let term;
  if (academicYear && semester) {
    term = await prisma.academicTerm.findFirst({
      where: { organizationId: organization.id, academicYear, semester },
      select: { id: true },
    });
  } else {
    term = await prisma.academicTerm.findFirst({
      where: { organizationId: organization.id, active: true },
      select: { id: true },
    });
  }

  if (!term) return null;
  return _getReportPackageForTermInternal(organization.id, term.id);
}
