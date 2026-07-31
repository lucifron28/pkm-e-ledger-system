import test from "node:test";
import assert from "node:assert/strict";
import { Role } from "@prisma/client";
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
