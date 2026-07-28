import "server-only";
import { prisma } from "../db/prisma";
import { requireManagementUser } from "../auth/require-auth";
import { calculateAccountBalances } from "../domain/financial";
import { Semester, TransactionType } from "@prisma/client";

export const SCHEDULE_2_BUCKETS = [
  "Supplies",
  "Equipment",
  "Transportation",
  "Meals",
  "Service",
  "Misc",
  "Donation",
  "Others",
] as const;

export type Schedule2Bucket = (typeof SCHEDULE_2_BUCKETS)[number];

export function getSchedule2BucketKey(categoryName: string): Schedule2Bucket {
  const lower = categoryName.trim().toLowerCase();
  if (lower.includes("suppl")) return "Supplies";
  if (lower.includes("equip")) return "Equipment";
  if (lower.includes("transport")) return "Transportation";
  if (lower.includes("meal") || lower.includes("food")) return "Meals";
  if (lower.includes("servic")) return "Service";
  if (lower.includes("misc")) return "Misc";
  if (lower.includes("donat")) return "Donation";
  return "Others";
}

export interface CollectionItemDto {
  sequenceNumber: number;
  transactionId: string;
  transactionDate: Date;
  documentNumber: string | null;
  payorName: string;
  description: string;
  referenceDescription: string;
  amountCents: number;
}

export interface CollectionCategoryGroupDto {
  categoryId: string;
  categoryName: string;
  totalCents: number;
  items: CollectionItemDto[];
}

export interface ExpenseBucketSummaryDto {
  bucketKey: Schedule2Bucket;
  bucketName: Schedule2Bucket;
  totalCents: number;
}

export interface ExpenseRowItemDto {
  sequenceNumber: number;
  transactionId: string;
  transactionDate: Date;
  documentNumber: string | null;
  payeeName: string;
  description: string;
  referenceDescription: string;
  amountCents: number;
  categoryId: string;
  categoryName: string;
  mappedBucket: Schedule2Bucket;
  categoryBucketCents: Record<Schedule2Bucket, number>;
}

export interface AttachmentReferenceDto {
  transactionId: string;
  transactionDate: Date;
  documentNumber: string | null;
  description: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ReportPackageDto {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  termId: string;
  academicYear: string;
  semester: Semester;
  semesterLabel: string;

  // Balances in Cents
  openingCashOnHandCents: number;
  openingCashInBankCents: number;
  balanceForwardedCents: number;

  totalIncomeCents: number;
  totalIncomeCashOnHandCents: number;
  totalIncomeCashInBankCents: number;

  totalExpenseCents: number;
  totalExpenseCashOnHandCents: number;
  totalExpenseCashInBankCents: number;

  totalCashAvailableCents: number;

  endingCashOnHandCents: number;
  endingCashInBankCents: number;
  endingBalanceCents: number;

  // Collections (Income)
  collectionGroups: CollectionCategoryGroupDto[];
  totalCollectionItemsCount: number;

  // Expenses (Fixed 8 Schedule 2 Buckets)
  expenseCategories: ExpenseBucketSummaryDto[];
  expenseRows: ExpenseRowItemDto[];

  // Attachment references
  attachments: AttachmentReferenceDto[];

  // Signatures metadata
  signatories: {
    treasurerTitle: string;
    auditorTitle: string;
    adviserTitle: string;
    presidentOsaTitle: string;
  };
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

export async function getReportPackageForTerm(
  termId: string
): Promise<ReportPackageDto | null> {
  const user = await requireManagementUser();
  if (!user.organizationId) return null;

  const term = await prisma.academicTerm.findFirst({
    where: { id: termId, organizationId: user.organizationId },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  if (!term) return null;

  // Fetch active transactions for the organization and term
  const transactions = await prisma.transaction.findMany({
    where: {
      organizationId: user.organizationId,
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

  // Opening Balances
  const openingCashOnHandCents = term.openingCashOnHandCents;
  const openingCashInBankCents = term.openingCashInBankCents;
  const balanceForwardedCents = openingCashOnHandCents + openingCashInBankCents;

  // Compute Income & Expense subtotals per cash account
  let totalIncomeCents = 0;
  let totalIncomeCashOnHandCents = 0;
  let totalIncomeCashInBankCents = 0;

  let totalExpenseCents = 0;
  let totalExpenseCashOnHandCents = 0;
  let totalExpenseCashInBankCents = 0;

  const incomeTransactions = transactions.filter((t) => t.type === TransactionType.INCOME);
  const expenseTransactions = transactions.filter((t) => t.type === TransactionType.EXPENSE);

  for (const t of incomeTransactions) {
    totalIncomeCents += t.amountCents;
    if (t.cashAccount === "CASH_ON_HAND") {
      totalIncomeCashOnHandCents += t.amountCents;
    } else {
      totalIncomeCashInBankCents += t.amountCents;
    }
  }

  for (const t of expenseTransactions) {
    totalExpenseCents += t.amountCents;
    if (t.cashAccount === "CASH_ON_HAND") {
      totalExpenseCashOnHandCents += t.amountCents;
    } else {
      totalExpenseCashInBankCents += t.amountCents;
    }
  }

  const totalCashAvailableCents = balanceForwardedCents + totalIncomeCents;

  const balances = calculateAccountBalances(
    openingCashOnHandCents,
    openingCashInBankCents,
    transactions.map((t) => ({
      type: t.type,
      amountCents: t.amountCents,
      cashAccount: t.cashAccount,
    }))
  );

  const endingCashOnHandCents = balances.cashOnHandCents;
  const endingCashInBankCents = balances.cashInBankCents;
  const endingBalanceCents = balances.remainingCents;

  // Group Schedule 1 Collections by Income Category
  const incomeCategoryMap = new Map<string, { categoryName: string; items: CollectionItemDto[]; totalCents: number }>();
  let collectionSeq = 1;
  let totalCollectionItemsCount = 0;

  for (const t of incomeTransactions) {
    const catId = t.categoryId;
    const catName = t.category.name;

    if (!incomeCategoryMap.has(catId)) {
      incomeCategoryMap.set(catId, { categoryName: catName, items: [], totalCents: 0 });
    }

    const group = incomeCategoryMap.get(catId)!;
    group.totalCents += t.amountCents;
    group.items.push({
      sequenceNumber: collectionSeq++,
      transactionId: t.id,
      transactionDate: t.transactionDate,
      documentNumber: t.documentNumber,
      payorName: t.counterpartyName || t.description,
      description: t.description,
      referenceDescription: t.referenceDescription,
      amountCents: t.amountCents,
    });
    totalCollectionItemsCount++;
  }

  const collectionGroups: CollectionCategoryGroupDto[] = Array.from(incomeCategoryMap.entries()).map(
    ([catId, val]) => ({
      categoryId: catId,
      categoryName: val.categoryName,
      totalCents: val.totalCents,
      items: val.items,
    })
  );

  // Group Schedule 2 Expenses using the 8 fixed buckets in exact order
  const bucketTotals: Record<Schedule2Bucket, number> = {
    Supplies: 0,
    Equipment: 0,
    Transportation: 0,
    Meals: 0,
    Service: 0,
    Misc: 0,
    Donation: 0,
    Others: 0,
  };

  let expenseSeq = 1;
  const expenseRows: ExpenseRowItemDto[] = [];

  for (const t of expenseTransactions) {
    const catName = t.category.name;
    const mappedBucket = getSchedule2BucketKey(catName);

    const bucketCents: Record<Schedule2Bucket, number> = {
      Supplies: 0,
      Equipment: 0,
      Transportation: 0,
      Meals: 0,
      Service: 0,
      Misc: 0,
      Donation: 0,
      Others: 0,
    };

    // Exactly one bucket contains amountCents, all others 0
    bucketCents[mappedBucket] = t.amountCents;
    bucketTotals[mappedBucket] += t.amountCents;

    expenseRows.push({
      sequenceNumber: expenseSeq++,
      transactionId: t.id,
      transactionDate: t.transactionDate,
      documentNumber: t.documentNumber,
      payeeName: t.counterpartyName || t.description,
      description: t.description,
      referenceDescription: t.referenceDescription,
      amountCents: t.amountCents,
      categoryId: t.categoryId,
      categoryName: catName,
      mappedBucket,
      categoryBucketCents: bucketCents,
    });
  }

  const expenseCategories: ExpenseBucketSummaryDto[] = SCHEDULE_2_BUCKETS.map((bKey) => ({
    bucketKey: bKey,
    bucketName: bKey,
    totalCents: bucketTotals[bKey],
  }));

  // Attachments reference list
  const attachments: AttachmentReferenceDto[] = [];
  for (const t of transactions) {
    for (const att of t.attachments) {
      attachments.push({
        transactionId: t.id,
        transactionDate: t.transactionDate,
        documentNumber: t.documentNumber,
        description: t.description,
        originalName: att.originalName,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
      });
    }
  }

  return {
    organizationId: term.organizationId,
    organizationName: term.organization.name,
    organizationSlug: term.organization.slug,
    termId: term.id,
    academicYear: term.academicYear,
    semester: term.semester,
    semesterLabel: getSemesterLabel(term.semester),

    openingCashOnHandCents,
    openingCashInBankCents,
    balanceForwardedCents,

    totalIncomeCents,
    totalIncomeCashOnHandCents,
    totalIncomeCashInBankCents,

    totalExpenseCents,
    totalExpenseCashOnHandCents,
    totalExpenseCashInBankCents,

    totalCashAvailableCents,

    endingCashOnHandCents,
    endingCashInBankCents,
    endingBalanceCents,

    collectionGroups,
    totalCollectionItemsCount,

    expenseCategories,
    expenseRows,

    attachments,

    signatories: {
      treasurerTitle: "Organization Treasurer",
      auditorTitle: "Organization Auditor",
      adviserTitle: "Faculty Adviser",
      presidentOsaTitle: "President / OSA Representative",
    },
  };
}

export async function getReportPackageForCurrentUser(
  academicYear?: string,
  semester?: Semester
): Promise<ReportPackageDto | null> {
  const user = await requireManagementUser();
  if (!user.organizationId) return null;

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
  return getReportPackageForTerm(term.id);
}
