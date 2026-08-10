"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { TablerIcon } from "@tabler/icons-react";
import {
  IconArchive as Archive,
  IconBook2 as Book2,
  IconClipboardList as ClipboardList,
  IconFileAnalytics as FileAnalytics,
  IconLayoutDashboard as LayoutDashboard,
  IconLock as Lock,
  IconMenu2 as Menu2,
  IconReceipt as Receipt,
  IconSettings as Settings,
  IconShieldCheck as ShieldCheck,
  IconX as X,
} from "@tabler/icons-react";
import { Role } from "@prisma/client";
import { getPortalNavLinks } from "@/lib/auth/rbac";
import { logoutAction } from "@/lib/actions/logout";

interface PortalNavProps {
  role: Role;
  userName?: string;
  userOrgName?: string;
  mode: "desktop" | "mobile";
}

const iconsByPath: Record<string, TablerIcon> = {
  "/dashboard": LayoutDashboard,
  "/osa": ShieldCheck,
  "/settings/term": Settings,
  "/ledger": Book2,
  "/ledger/income/new": Receipt,
  "/ledger/expense/new": Receipt,
  "/reports": FileAnalytics,
  "/audit-log": ClipboardList,
  "/account": Lock,
};

function getIcon(path: string): TablerIcon {
  return iconsByPath[path] || Archive;
}

export function PortalNav({ role, userName, userOrgName, mode }: PortalNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const orgParam = searchParams.get("org") || undefined;
  const navLinks = getPortalNavLinks(role, orgParam);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeMenu]);

  const isActive = (href: string) => pathname === href.split("?")[0];

  const links = navLinks.map((link) => {
    const Icon = getIcon(link.href.split("?")[0]);
    const active = isActive(link.href);
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active ? "page" : undefined}
        onClick={closeMenu}
        className={`portal-nav-link ${active ? "portal-nav-link-active" : ""}`}
      >
        <Icon size={18} stroke={1.8} aria-hidden="true" />
        <span>{link.label}</span>
      </Link>
    );
  });

  return (
    <>
      {mode === "desktop" && (
        <nav aria-label="Portal navigation" className="hidden lg:flex lg:flex-col lg:gap-1">
          {links}
        </nav>
      )}

      {mode === "mobile" && (
        <div className="lg:hidden portal-mobile-nav">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-controls="portal-mobile-menu"
            className="portal-mobile-toggle"
          >
            {isOpen ? <X size={19} aria-hidden="true" /> : <Menu2 size={19} aria-hidden="true" />}
            <span>{isOpen ? "Close navigation" : "Open navigation"}</span>
          </button>

          {isOpen && (
            <div id="portal-mobile-menu" className="portal-mobile-menu">
              {userName && (
                <div className="portal-mobile-user">
                  <span className="portal-mobile-user-name">{userName}</span>
                  <span>{role} - {userOrgName || "Office of Student Affairs"}</span>
                </div>
              )}
              {links}
              <form action={logoutAction} className="mt-2 border-t border-blue-800 pt-2">
                <button type="submit" className="portal-mobile-logout">
                  <Lock size={18} aria-hidden="true" />
                  <span>Log out</span>
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}
