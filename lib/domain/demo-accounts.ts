import { Role } from "@prisma/client";

/** Default credential created by the fictional demo seed only. */
export const DEMO_ACCOUNT_DEFAULT_PASSWORD = "password";

export interface DemoAccountExportRow {
  fullName: string;
  username: string;
  role: Role;
  organizationName: string | null;
  active: boolean;
}

const SEEDED_DEMO_USERNAME_PATTERN = /^demo_(?:treasurer|adviser|audit|officer|member)_[a-z0-9-]+$/;

export function isSeededDemoUsername(username: string): boolean {
  return username === "demo_osa" || SEEDED_DEMO_USERNAME_PATTERN.test(username);
}

export function getDemoAccountAccessLabel(role: Role): string {
  if (role === Role.TREASURER || role === Role.ADVISER || role === Role.AUDIT) {
    return "Create, edit, delete financial records, cash transfers, opening balances, attachments, reports, and audit log.";
  }

  if (role === Role.OFFICER || role === Role.MEMBER) {
    return "View-only summaries and reports.";
  }

  return "Cross-organization view-only summaries and reports.";
}
