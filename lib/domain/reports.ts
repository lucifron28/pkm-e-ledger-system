import { CashAccount, ExpenseReportBucket, Semester, TransactionType } from "@prisma/client";
import {
  assertNoOverflow,
  calculateAccountBalances,
  financialRowsToMovements,
  transferRowsToMovements,
  TransferRow,
} from "./financial";
import { getSemesterLabel } from "./term-labels";
export { getSemesterLabel };

export const EXPENSE_REPORT_BUCKETS: ExpenseReportBucket[] = [
  ExpenseReportBucket.SUPPLIES,
  ExpenseReportBucket.EQUIPMENT,
  ExpenseReportBucket.TRANSPORTATION,
  ExpenseReportBucket.MEALS,
  ExpenseReportBucket.SERVICE,
  ExpenseReportBucket.MISC,
  ExpenseReportBucket.DONATION,
  ExpenseReportBucket.OTHERS,
];

export const EXPENSE_BUCKET_LABELS: Record<ExpenseReportBucket, string> = {
  SUPPLIES: "Supplies",
  EQUIPMENT: "Equipment",
  TRANSPORTATION: "Transportation",
  MEALS: "Meals",
  SERVICE: "Service",
  MISC: "Misc",
  DONATION: "Donation",
  OTHERS: "Others",
};

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

export function reportBucketToSchedule2Bucket(bucket: ExpenseReportBucket): Schedule2Bucket {
  return EXPENSE_BUCKET_LABELS[bucket] as Schedule2Bucket;
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
  bucketName: string;
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
  transactionId: string | null;
  cashTransferId: string | null;
  entryType: "TRANSACTION" | "CASH_TRANSFER";
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
  asOfDate: Date;

  openingCashOnHandCents: number;
  openingCashInBankCents: number;
  balanceForwardedCents: number;

  totalIncomeCents: number;
  totalIncomeCashOnHandCents: number;
  totalIncomeCashInBankCents: number;

  totalExpenseCents: number;
  totalExpenseCashOnHandCents: number;
  totalExpenseCashInBankCents: number;

  totalTransferInCOHCents: number;
  totalTransferInCIBCents: number;

  totalCashAvailableCents: number;

  endingCashOnHandCents: number;
  endingCashInBankCents: number;
  endingBalanceCents: number;

  collectionGroups: CollectionCategoryGroupDto[];
  totalCollectionItemsCount: number;

  expenseCategories: ExpenseBucketSummaryDto[];
  expenseRows: ExpenseRowItemDto[];

  attachments: AttachmentReferenceDto[];

  signatories: {
    treasurerTitle: string;
    auditorTitle: string;
    osaCoordinatorTitle: string;
    organizationPresidentTitle: string;
    adviserTitle: string;
    accountantTitle: string;
  };
}

export interface RawReportInputTerm {
  id: string;
  academicYear: string;
  semester: Semester;
  openingCashOnHandCents: number;
  openingCashInBankCents: number;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface RawReportInputAttachment {
  id?: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface RawReportInputTransaction {
  id: string;
  type: TransactionType;
  transactionDate: Date;
  amountCents: number;
  cashAccount: CashAccount;
  documentNumber: string | null;
  counterpartyName: string | null;
  description: string;
  referenceDescription: string;
  categoryId: string;
  category: {
    id: string;
    name: string;
    type?: TransactionType;
    reportBucket?: ExpenseReportBucket;
  };
  attachments: RawReportInputAttachment[];
}

export interface RawReportInputTransfer extends TransferRow {
  transferDate?: Date;
  documentNumber?: string | null;
  description?: string;
  attachments?: RawReportInputAttachment[];
}

export function buildReportPackage(
  term: {
    id: string;
    academicYear: string;
    semester: Semester;
    openingCashOnHandCents: number;
    openingCashInBankCents: number;
    organization: { id: string; name: string; slug: string };
  },
  transactions: RawReportInputTransaction[],
  transfers: RawReportInputTransfer[] = [],
  asOfDate: Date = new Date()
): ReportPackageDto {
  const result = buildReportPackageDto(term.organization.name, term, transactions, transfers, asOfDate);
  result.organizationId = term.organization.id;
  result.organizationSlug = term.organization.slug;
  return result;
}

export function buildReportPackageDto(
  organizationName: string,
  term: {
    id: string;
    academicYear: string;
    semester: Semester;
    openingCashOnHandCents: number;
    openingCashInBankCents: number;
    organization?: { id: string; name: string; slug: string };
  },
  transactions: RawReportInputTransaction[],
  transfers: RawReportInputTransfer[] = [],
  asOfDate: Date = new Date()
): ReportPackageDto {
  const openingCashOnHandCents = assertNoOverflow(term.openingCashOnHandCents);
  const openingCashInBankCents = assertNoOverflow(term.openingCashInBankCents);
  const balanceForwardedCents = assertNoOverflow(openingCashOnHandCents + openingCashInBankCents);

  let totalIncomeCents = 0;
  let totalIncomeCashOnHandCents = 0;
  let totalIncomeCashInBankCents = 0;

  let totalExpenseCents = 0;
  let totalExpenseCashOnHandCents = 0;
  let totalExpenseCashInBankCents = 0;

  const incomeTransactions = transactions.filter((t) => t.type === TransactionType.INCOME);
  const expenseTransactions = transactions.filter((t) => t.type === TransactionType.EXPENSE);

  for (const t of incomeTransactions) {
    totalIncomeCents = assertNoOverflow(totalIncomeCents + t.amountCents);
    if (t.cashAccount === "CASH_ON_HAND") {
      totalIncomeCashOnHandCents = assertNoOverflow(totalIncomeCashOnHandCents + t.amountCents);
    } else {
      totalIncomeCashInBankCents = assertNoOverflow(totalIncomeCashInBankCents + t.amountCents);
    }
  }

  for (const t of expenseTransactions) {
    totalExpenseCents = assertNoOverflow(totalExpenseCents + t.amountCents);
    if (t.cashAccount === "CASH_ON_HAND") {
      totalExpenseCashOnHandCents = assertNoOverflow(totalExpenseCashOnHandCents + t.amountCents);
    } else {
      totalExpenseCashInBankCents = assertNoOverflow(totalExpenseCashInBankCents + t.amountCents);
    }
  }

  const totalCashAvailableCents = assertNoOverflow(balanceForwardedCents + totalIncomeCents);

  const movements = [
    ...financialRowsToMovements(transactions),
    ...transferRowsToMovements(transfers),
  ];

  const balances = calculateAccountBalances(
    openingCashOnHandCents,
    openingCashInBankCents,
    movements
  );

  const endingCashOnHandCents = assertNoOverflow(balances.cashOnHandCents);
  const endingCashInBankCents = assertNoOverflow(balances.cashInBankCents);
  const endingBalanceCents = assertNoOverflow(balances.remainingCents);

  const incomeCategoryMap = new Map<string, { categoryName: string; items: CollectionItemDto[]; totalCents: number }>();
  let totalCollectionItemsCount = 0;

  for (const t of incomeTransactions) {
    const catId = t.categoryId;
    const catName = t.category.name;

    if (!incomeCategoryMap.has(catId)) {
      incomeCategoryMap.set(catId, { categoryName: catName, items: [], totalCents: 0 });
    }

    const group = incomeCategoryMap.get(catId)!;
    group.totalCents = assertNoOverflow(group.totalCents + t.amountCents);
    group.items.push({
      sequenceNumber: group.items.length + 1,
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
      totalCents: assertNoOverflow(val.totalCents),
      items: val.items,
    })
  );

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
    const mappedBucket = reportBucketToSchedule2Bucket(t.category.reportBucket || ExpenseReportBucket.OTHERS);

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

    bucketCents[mappedBucket] = t.amountCents;
    bucketTotals[mappedBucket] = assertNoOverflow(bucketTotals[mappedBucket] + t.amountCents);

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
    bucketName: bKey === "Misc" ? "Miscellaneous" : bKey,
    totalCents: assertNoOverflow(bucketTotals[bKey]),
  }));

  const attachments: AttachmentReferenceDto[] = [];
  for (const t of transactions) {
    for (const att of t.attachments) {
      attachments.push({
        transactionId: t.id,
        cashTransferId: null,
        entryType: "TRANSACTION",
        transactionDate: t.transactionDate,
        documentNumber: t.documentNumber,
        description: t.description,
        originalName: att.originalName,
        mimeType: att.mimeType || "application/octet-stream",
        sizeBytes: att.sizeBytes,
      });
    }
  }
  for (const transfer of transfers) {
    for (const att of transfer.attachments || []) {
      attachments.push({
        transactionId: null,
        cashTransferId: transfer.id || null,
        entryType: "CASH_TRANSFER",
        transactionDate: transfer.transferDate || new Date(0),
        documentNumber: transfer.documentNumber || null,
        description: transfer.description || "Cash transfer",
        originalName: att.originalName,
        mimeType: att.mimeType || "application/octet-stream",
        sizeBytes: att.sizeBytes,
      });
    }
  }

  return {
    organizationId: term.organization?.id || "",
    organizationName: organizationName || term.organization?.name || "",
    organizationSlug: term.organization?.slug || "",
    termId: term.id,
    academicYear: term.academicYear,
    semester: term.semester,
    semesterLabel: getSemesterLabel(term.semester),
    asOfDate,

    openingCashOnHandCents,
    openingCashInBankCents,
    balanceForwardedCents,

    totalIncomeCents,
    totalIncomeCashOnHandCents,
    totalIncomeCashInBankCents,

    totalExpenseCents,
    totalExpenseCashOnHandCents,
    totalExpenseCashInBankCents,

    totalTransferInCOHCents: balances.totalTransferInCOHCents,
    totalTransferInCIBCents: balances.totalTransferInCIBCents,

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
      osaCoordinatorTitle: "OSS / OSA Coordinator",
      organizationPresidentTitle: "Organization President",
      adviserTitle: "Faculty Adviser",
      accountantTitle: "PKM Accountant",
    },
  };
}
