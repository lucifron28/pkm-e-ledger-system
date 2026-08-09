import { Role } from "@prisma/client";

export const MANAGEMENT_ROLES: Role[] = [Role.TREASURER, Role.ADVISER, Role.AUDIT];
export const TRANSPARENCY_ROLES: Role[] = [Role.OFFICER, Role.MEMBER];
export const MONITORING_ROLES: Role[] = [Role.OSA];
export const ORGANIZATION_PORTAL_ROLES: Role[] = [
  ...MANAGEMENT_ROLES,
  ...TRANSPARENCY_ROLES,
];

export function isOrganizationPortalRole(role: Role): boolean {
  return ORGANIZATION_PORTAL_ROLES.includes(role);
}

export function isManagementRole(role: Role): boolean {
  return MANAGEMENT_ROLES.includes(role);
}

export function isTransparencyRole(role: Role): boolean {
  return TRANSPARENCY_ROLES.includes(role);
}

export function isMonitoringRole(role: Role): boolean {
  return MONITORING_ROLES.includes(role);
}

// Transaction management (Treasurer, Adviser, Audit)
export function canRecordTransactions(role: Role): boolean {
  return isManagementRole(role);
}

export function canEditTransactions(role: Role): boolean {
  return isManagementRole(role);
}

export function canDeleteTransactions(role: Role): boolean {
  return isManagementRole(role);
}

export function canSetOpeningBalance(role: Role): boolean {
  return isManagementRole(role);
}

export function canUploadAttachments(role: Role): boolean {
  return isManagementRole(role);
}

// Audit Log / Treasurer Log access (Treasurer, Adviser, Audit)
export function canViewAuditLog(role: Role): boolean {
  return isManagementRole(role);
}

// Report generation (Treasurer, Adviser, Audit) - OSA cannot generate reports
export function canGenerateReport(role: Role): boolean {
  return isManagementRole(role);
}

// Detailed organization ledger view (Treasurer, Adviser, Audit)
export function canViewOrgLedger(role: Role): boolean {
  return isManagementRole(role);
}

// Financial summary dashboard view
export function canViewOrgSummary(role: Role): boolean {
  return isManagementRole(role) || isTransparencyRole(role) || isMonitoringRole(role);
}

// Available published reports viewing
export function canViewAvailableReports(role: Role): boolean {
  return isManagementRole(role) || isTransparencyRole(role) || isMonitoringRole(role);
}

// Multi-organization oversight switcher
export function canViewCrossOrganization(role: Role): boolean {
  return isMonitoringRole(role);
}

export interface NavLinkConfig {
  href: string;
  label: string;
}

export function getPortalNavLinks(role: Role, orgParam?: string): NavLinkConfig[] {
  const orgQuery = orgParam && orgParam.trim().length > 0 ? `?org=${encodeURIComponent(orgParam.trim())}` : "";

  if (isMonitoringRole(role)) {
    return [
      { href: "/osa", label: "OSA Overview" },
      { href: `/ledger${orgQuery}`, label: "Organization Ledger Summary" },
      { href: `/reports${orgQuery}`, label: "Reports" },
      { href: "/account", label: "Account" },
    ];
  }

  if (isTransparencyRole(role)) {
    return [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/reports", label: "Reports" },
      { href: "/account", label: "Account" },
    ];
  }

  if (isManagementRole(role)) {
    return [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/settings/term", label: "Term Settings" },
      { href: "/ledger", label: "Digital Ledger" },
      { href: "/ledger/income/new", label: "New Income" },
      { href: "/ledger/expense/new", label: "New Expense" },
      { href: "/reports", label: "Financial Reports" },
      { href: "/audit-log", label: "Treasurer Log" },
      { href: "/account", label: "Account" },
    ];
  }

  return [];
}
