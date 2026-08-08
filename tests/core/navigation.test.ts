import test from "node:test";
import assert from "node:assert/strict";
import { Role } from "@prisma/client";
import { getPortalNavLinks } from "../../lib/auth/rbac";

test("Navigation Matrix: TREASURER, ADVISER, AUDIT management roles return complete management links", () => {
  const managementRoles: Role[] = [Role.TREASURER, Role.ADVISER, Role.AUDIT];

  for (const role of managementRoles) {
    const links = getPortalNavLinks(role);
    const labels = links.map((l) => l.label);
    const hrefs = links.map((l) => l.href);

    assert.deepEqual(labels, [
      "Dashboard",
      "Term Settings",
      "Digital Ledger",
      "New Income",
      "New Expense",
      "Financial Reports",
      "Treasurer Log",
      "Account",
    ]);

    assert.deepEqual(hrefs, [
      "/dashboard",
      "/settings/term",
      "/ledger",
      "/ledger/income/new",
      "/ledger/expense/new",
      "/reports",
      "/audit-log",
      "/account",
    ]);
  }
});

test("Navigation Matrix: OFFICER and MEMBER transparency roles return transparency links only", () => {
  const transparencyRoles: Role[] = [Role.OFFICER, Role.MEMBER];

  for (const role of transparencyRoles) {
    const links = getPortalNavLinks(role);
    const labels = links.map((l) => l.label);
    const hrefs = links.map((l) => l.href);

    assert.deepEqual(labels, ["Dashboard", "Reports", "Account"]);
    assert.deepEqual(hrefs, ["/dashboard", "/reports", "/account"]);

    // Must not contain any management links
    assert.equal(labels.includes("Term Settings"), false);
    assert.equal(labels.includes("Digital Ledger"), false);
    assert.equal(labels.includes("New Income"), false);
    assert.equal(labels.includes("New Expense"), false);
    assert.equal(labels.includes("Treasurer Log"), false);
  }
});

test("Navigation Matrix: OSA monitoring role returns cross-org links with preserved org query", () => {
  const linksWithoutOrg = getPortalNavLinks(Role.OSA);
  assert.deepEqual(
    linksWithoutOrg.map((l) => l.label),
    ["OSA Overview", "Organization Ledger Summary", "Reports", "Account"]
  );
  assert.deepEqual(
    linksWithoutOrg.map((l) => l.href),
    ["/osa", "/ledger", "/reports", "/account"]
  );

  const linksWithOrg = getPortalNavLinks(Role.OSA, "org-123");
  assert.deepEqual(
    linksWithOrg.map((l) => l.href),
    ["/osa", "/ledger?org=org-123", "/reports?org=org-123", "/account"]
  );

  // Must not contain management links
  const labels = linksWithOrg.map((l) => l.label);
  assert.equal(labels.includes("Term Settings"), false);
  assert.equal(labels.includes("New Income"), false);
  assert.equal(labels.includes("Treasurer Log"), false);
});
