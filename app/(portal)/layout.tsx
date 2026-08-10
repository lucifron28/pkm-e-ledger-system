import { requireUser } from "@/lib/auth/require-auth";
import { logoutAction } from "@/lib/actions/logout";
import { isMonitoringRole } from "@/lib/auth/rbac";
import { PortalNav } from "@/components/navigation/portal-nav";
import { PkmLogo } from "@/components/branding/pkm-logo";
import { IconBuildingCommunity as BuildingCommunity, IconLogout2 as Logout2, IconUserCircle as UserCircle } from "@tabler/icons-react";
import { Suspense } from "react";
import Link from "next/link";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const isMonitoring = isMonitoringRole(user.role);
  const organizationName = user.organizationName || "Office of Student Affairs";

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <a href="#main-content" className="ui-skip-link">Skip to main content</a>
      <header className="portal-topbar">
        <div className="portal-topbar-inner">
          <Link href={isMonitoring ? "/osa" : "/dashboard"} className="portal-brand">
            <PkmLogo size={38} priority className="h-9 w-9 rounded bg-white p-0.5" />
            <span>
              <strong>PKM e-Ledger</strong>
              <small>Financial records portal</small>
            </span>
          </Link>

          <div className="portal-topbar-context">
            <BuildingCommunity size={18} aria-hidden="true" />
            <span title={organizationName}>{organizationName}</span>
          </div>

          <div className="portal-user-tools">
            <div className="portal-user-summary">
              <UserCircle size={18} aria-hidden="true" />
              <span className="truncate" title={user.fullName}>{user.fullName}</span>
              <span className="portal-role-badge">{user.role}</span>
            </div>
            <Link href="/account" className="portal-tool-link">Account</Link>
            <form action={logoutAction}>
              <button type="submit" className="portal-logout-button">
                <Logout2 size={16} aria-hidden="true" />
                <span>Log out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="portal-layout">
        <aside className="portal-sidebar" aria-label="Portal navigation sidebar">
          <div className="portal-sidebar-context">
            <span className="ui-eyebrow">Current workspace</span>
            <strong>{organizationName}</strong>
            <span>{user.role} access</span>
          </div>
          <Suspense fallback={<div className="portal-nav-loading">Loading navigation...</div>}>
            <PortalNav role={user.role} userName={user.fullName} userOrgName={user.organizationName || undefined} />
          </Suspense>
          <div className="portal-sidebar-note">
            <span>PKM e-Ledger System</span>
            <span>Review balances using the selected academic term.</span>
          </div>
        </aside>

        <div className="portal-main-column">
          <Suspense fallback={null}>
            <PortalNav role={user.role} userName={user.fullName} userOrgName={user.organizationName || undefined} />
          </Suspense>
          <main id="main-content" className="portal-main-content">
            {children}
          </main>
          <footer className="portal-footer">
            Pambayang Kolehiyo ng Mauban - PKM e-Ledger System - Office of Student Affairs
          </footer>
        </div>
      </div>
    </div>
  );
}
