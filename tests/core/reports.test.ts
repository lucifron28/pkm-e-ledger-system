import test from "node:test";
import assert from "node:assert/strict";
import { CashAccount, Semester, TransactionType } from "@prisma/client";
import {
  SCHEDULE_2_BUCKETS,
  getSchedule2BucketKey,
  buildReportPackage,
  RawReportInputTerm,
  RawReportInputTransaction,
} from "../../lib/domain/reports";

test("Reports Domain: Fixed Schedule 2 Bucket Order and Count", () => {
  assert.equal(SCHEDULE_2_BUCKETS.length, 8);
  assert.deepEqual(SCHEDULE_2_BUCKETS, [
    "Supplies",
    "Equipment",
    "Transportation",
    "Meals",
    "Service",
    "Misc",
    "Donation",
    "Others",
  ]);
});

test("Reports Domain: Category mapping to Schedule 2 Buckets", () => {
  assert.equal(getSchedule2BucketKey("Office Supplies"), "Supplies");
  assert.equal(getSchedule2BucketKey("IT Equipment"), "Equipment");
  assert.equal(getSchedule2BucketKey("Travel Fare"), "Transportation");
  assert.equal(getSchedule2BucketKey("Catering & Meals"), "Meals");
  assert.equal(getSchedule2BucketKey("Janitorial Service"), "Service");
  assert.equal(getSchedule2BucketKey("Miscellaneous Expenses"), "Misc");
  assert.equal(getSchedule2BucketKey("Charity Donation"), "Donation");
  assert.equal(getSchedule2BucketKey("Events and Seminars"), "Others");
  assert.equal(getSchedule2BucketKey("Unsupported Category"), "Others");
});

test("Reports Domain: Real report package builder calculations and DTO invariants", () => {
  const rawTerm: RawReportInputTerm = {
    id: "term-101",
    academicYear: "2025-2026",
    semester: Semester.FIRST_SEMESTER,
    openingCashOnHandCents: 500000, // 5,000.00
    openingCashInBankCents: 1000000, // 10,000.00
    organization: {
      id: "org-1",
      name: "JPCS",
      slug: "jpcs",
    },
  };

  const rawTransactions: RawReportInputTransaction[] = [
    {
      id: "tx-1",
      type: TransactionType.INCOME,
      transactionDate: new Date("2025-08-01"),
      amountCents: 200000, // 2,000.00
      cashAccount: CashAccount.CASH_ON_HAND,
      documentNumber: "OR-001",
      counterpartyName: "Member Fees",
      description: "Membership Dues",
      referenceDescription: "Collection",
      categoryId: "cat-inc-1",
      category: { id: "cat-inc-1", name: "Membership Dues", type: TransactionType.INCOME },
      attachments: [
        {
          id: "att-db-id-1",
          originalName: "membership_deposit.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048576,
          storedName: "secret-uuid-1.pdf",
          storagePath: "/var/uploads/secret-uuid-1.pdf",
        },
      ],
    },
    {
      id: "tx-2",
      type: TransactionType.EXPENSE,
      transactionDate: new Date("2025-08-05"),
      amountCents: 300000, // 3,000.00
      cashAccount: CashAccount.CASH_ON_HAND,
      documentNumber: "VOUCHER-01",
      counterpartyName: "Paper Store",
      description: "Office Paper",
      referenceDescription: "Receipt #12",
      categoryId: "cat-exp-1",
      category: { id: "cat-exp-1", name: "Office Supplies", type: TransactionType.EXPENSE },
      attachments: [],
    },
    {
      id: "tx-3",
      type: TransactionType.EXPENSE,
      transactionDate: new Date("2025-08-10"),
      amountCents: 150000, // 1,500.00
      cashAccount: CashAccount.CASH_IN_BANK,
      documentNumber: "VOUCHER-02",
      counterpartyName: "Unknown Vendor",
      description: "Special Project Fee",
      referenceDescription: "Receipt #13",
      categoryId: "cat-exp-2",
      category: { id: "cat-exp-2", name: "Custom Special Category", type: TransactionType.EXPENSE },
      attachments: [],
    },
  ];

  const report = buildReportPackage(rawTerm, rawTransactions);

  // 1. Ledger totals match report totals
  assert.equal(report.balanceForwardedCents, 1500000);
  assert.equal(report.totalIncomeCents, 200000);
  assert.equal(report.totalExpenseCents, 450000);
  assert.equal(report.totalCashAvailableCents, 1700000);
  assert.equal(report.endingBalanceCents, 1250000); // 1500000 + 200000 - 450000
  assert.equal(report.endingCashOnHandCents, 400000); // 500000 + 200000 - 300000
  assert.equal(report.endingCashInBankCents, 850000); // 1000000 - 150000

  // 2. Schedule 1 grouping
  assert.equal(report.collectionGroups.length, 1);
  assert.equal(report.collectionGroups[0].categoryName, "Membership Dues");
  assert.equal(report.collectionGroups[0].totalCents, 200000);
  assert.equal(report.totalCollectionItemsCount, 1);

  // 3. Schedule 2 fixed 8 buckets in exact order
  assert.equal(report.expenseCategories.length, 8);
  assert.deepEqual(
    report.expenseCategories.map((c) => c.bucketKey),
    [...SCHEDULE_2_BUCKETS]
  );

  // 4. Unsupported category mapped to "Others"
  const expenseCustom = report.expenseRows.find((r) => r.transactionId === "tx-3");
  assert.ok(expenseCustom);
  assert.equal(expenseCustom.mappedBucket, "Others");
  assert.equal(expenseCustom.categoryBucketCents["Others"], 150000);

  // 5. Exactly one non-zero bucket per expense row
  for (const row of report.expenseRows) {
    const nonZeroBuckets = Object.entries(row.categoryBucketCents).filter(([, val]) => val > 0);
    assert.equal(nonZeroBuckets.length, 1, "Each expense row must have exactly one non-zero bucket");
    assert.equal(nonZeroBuckets[0][1], row.amountCents);
  }

  // 6. Four signature labels
  assert.equal(report.signatories.treasurerTitle, "Organization Treasurer");
  assert.equal(report.signatories.auditorTitle, "Organization Auditor");
  assert.equal(report.signatories.adviserTitle, "Faculty Adviser");
  assert.equal(report.signatories.presidentOsaTitle, "President / OSA Representative");

  // 7. Attachment DTO security: storagePath, storedName, and db id omitted
  assert.equal(report.attachments.length, 1);
  const attRef = report.attachments[0];
  assert.equal(attRef.originalName, "membership_deposit.pdf");
  assert.equal(attRef.mimeType, "application/pdf");
  assert.equal(attRef.sizeBytes, 2048576);
  assert.equal("storagePath" in attRef, false, "Report attachment DTO must not include storagePath");
  assert.equal("storedName" in attRef, false, "Report attachment DTO must not include storedName");
  assert.equal("id" in attRef, false, "Report attachment DTO must not include attachment database ID");
});
