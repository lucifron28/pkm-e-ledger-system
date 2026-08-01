import "server-only";
import { prisma } from "../db/prisma";
import { requireOrgPortalUser, requireOsaUser, SessionUser } from "../auth/require-auth";
import { Prisma, Role, Semester } from "@prisma/client";
import { isOrganizationPortalRole } from "../auth/rbac";
import {
  SCHEDULE_2_BUCKETS,
  Schedule2Bucket,
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



async function loadReportPackageInSnapshot(
  tx: Prisma.TransactionClient,
  organizationId: string,
  termWhere: Prisma.AcademicTermWhereInput
): Promise<ReportPackageDto | null> {
  const snapshotAt = new Date();
  const term = await tx.academicTerm.findFirst({
    where: { ...termWhere, organizationId },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  if (!term) return null;

  const transactions = await tx.transaction.findMany({
      where: {
        organizationId,
        termId: term.id,
        deletedAt: null,
      },
      include: {
        category: { select: { id: true, name: true, type: true, reportBucket: true } },
        attachments: {
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
  });

  const transfers = await tx.cashTransfer.findMany({
      where: {
        organizationId,
        termId: term.id,
        deletedAt: null,
      },
      select: {
        id: true,
        amountCents: true,
        fromAccount: true,
        toAccount: true,
        transferDate: true,
        documentNumber: true,
        description: true,
        attachments: {
          select: { originalName: true, mimeType: true, sizeBytes: true },
          orderBy: { createdAt: "asc" },
        },
      },
  });

  return buildReportPackage(term, transactions, transfers, snapshotAt);
}

async function _getReportPackageForTermInternal(
  organizationId: string,
  termId: string
): Promise<ReportPackageDto | null> {
  return prisma.$transaction((tx) =>
    loadReportPackageInSnapshot(tx, organizationId, { id: termId })
  );
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

  return prisma.$transaction((tx) =>
    loadReportPackageInSnapshot(
      tx,
      user.organizationId!,
      academicYear && semester
        ? { academicYear, semester }
        : { active: true }
    )
  );
}

export async function getReportPackageForOsa(
  orgSlugOrId: string,
  academicYear?: string,
  semester?: Semester
): Promise<ReportPackageDto | null> {
  await requireOsaUser();

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.findFirst({
      where: {
        active: true,
        OR: [{ id: orgSlugOrId }, { slug: orgSlugOrId }],
      },
      select: { id: true },
    });
    if (!organization) return null;

    return loadReportPackageInSnapshot(
      tx,
      organization.id,
      academicYear && semester
        ? { academicYear, semester }
        : { active: true }
    );
  });
}
