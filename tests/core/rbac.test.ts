import test from "node:test";
import assert from "node:assert/strict";
import { Role } from "@prisma/client";
import { computeRequestHash } from "../../lib/application/idempotency";
import { withTransientRetry } from "../../lib/infrastructure/db/retry";
import { ConcurrentModificationError } from "../../lib/domain/errors";
import {
  MANAGEMENT_ROLES,
  TRANSPARENCY_ROLES,
  MONITORING_ROLES,
  ORGANIZATION_PORTAL_ROLES,
  isOrganizationPortalRole,
  isManagementRole,
  isTransparencyRole,
  isMonitoringRole,
  canRecordTransactions,
  canEditTransactions,
  canDeleteTransactions,
  canSetOpeningBalance,
  canUploadAttachments,
  canViewAuditLog,
  canGenerateReport,
  canViewOrgLedger,
  canViewOrgSummary,
  canViewAvailableReports,
  canViewCrossOrganization,
} from "../../lib/auth/rbac";

const ALL_ROLES: Role[] = [
  Role.TREASURER,
  Role.ADVISER,
  Role.AUDIT,
  Role.OFFICER,
  Role.MEMBER,
  Role.OSA,
];

test("RBAC: Role collections completeness", () => {
  assert.deepEqual(MANAGEMENT_ROLES, [Role.TREASURER, Role.ADVISER, Role.AUDIT]);
  assert.deepEqual(TRANSPARENCY_ROLES, [Role.OFFICER, Role.MEMBER]);
  assert.deepEqual(MONITORING_ROLES, [Role.OSA]);
  assert.equal(ORGANIZATION_PORTAL_ROLES.length, 5);
});

test("RBAC: Test every permission function for all six roles", () => {
  for (const role of ALL_ROLES) {
    const isMgmt = (MANAGEMENT_ROLES as readonly Role[]).includes(role);
    const isTransp = (TRANSPARENCY_ROLES as readonly Role[]).includes(role);
    const isMon = role === Role.OSA;

    assert.equal(isManagementRole(role), isMgmt, `${role} isManagementRole`);
    assert.equal(isTransparencyRole(role), isTransp, `${role} isTransparencyRole`);
    assert.equal(isMonitoringRole(role), isMon, `${role} isMonitoringRole`);
    assert.equal(isOrganizationPortalRole(role), isMgmt || isTransp, `${role} isOrganizationPortalRole`);

    // Mutation permissions (Management only)
    assert.equal(canRecordTransactions(role), isMgmt, `${role} canRecordTransactions`);
    assert.equal(canEditTransactions(role), isMgmt, `${role} canEditTransactions`);
    assert.equal(canDeleteTransactions(role), isMgmt, `${role} canDeleteTransactions`);
    assert.equal(canSetOpeningBalance(role), isMgmt, `${role} canSetOpeningBalance`);
    assert.equal(canUploadAttachments(role), isMgmt, `${role} canUploadAttachments`);

    // Audit Log & Detailed Ledger (Management only)
    assert.equal(canViewAuditLog(role), isMgmt, `${role} canViewAuditLog`);
    assert.equal(canViewOrgLedger(role), isMgmt, `${role} canViewOrgLedger`);

    // PDF/XLSX & Report Generation (Management only - OSA cannot generate reports)
    assert.equal(canGenerateReport(role), isMgmt, `${role} canGenerateReport`);

    // Summary & Available Reports (All roles can view summaries/reports)
    assert.equal(canViewOrgSummary(role), true, `${role} canViewOrgSummary`);
    assert.equal(canViewAvailableReports(role), true, `${role} canViewAvailableReports`);

    // Multi-organization oversight (OSA only)
    assert.equal(canViewCrossOrganization(role), isMon, `${role} canViewCrossOrganization`);
  }
});

test("Infrastructure: computeRequestHash produces deterministic hashes and detects payload changes", () => {
  const hash1 = computeRequestHash("CREATE_TRANSACTION", { amountCents: 5000, type: "INCOME" });
  const hash2 = computeRequestHash("CREATE_TRANSACTION", { amountCents: 5000, type: "INCOME" });
  const hash3 = computeRequestHash("CREATE_TRANSACTION", { amountCents: 9000, type: "INCOME" });

  assert.equal(hash1, hash2, "Identical request payload must produce identical hash");
  assert.notEqual(hash1, hash3, "Different request payload must produce different hash");
});

test("Infrastructure: withTransientRetry retries transient errors and re-throws non-retryable domain errors", async () => {
  let attempts = 0;
  const successVal = await withTransientRetry(async () => {
    attempts++;
    if (attempts < 2) {
      const err = new Error("database is locked");
      throw err;
    }
    return "SUCCESS";
  });
  assert.equal(successVal, "SUCCESS");
  assert.equal(attempts, 2);

  await assert.rejects(
    async () => {
      await withTransientRetry(async () => {
        throw new ConcurrentModificationError();
      });
    },
    (err: unknown) => err instanceof ConcurrentModificationError
  );
});
