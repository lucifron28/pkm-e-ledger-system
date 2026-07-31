"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Role } from "@prisma/client";
import {
  isManagementRole,
  isTransparencyRole,
  isMonitoringRole,
} from "@/lib/auth/rbac";
import { logoutAction } from "@/lib/actions/logout";

interface PortalNavProps {
  role: Role;
  userName?: string;
  userOrgName?: string;
}

export function PortalNav({ role, userName, userOrgName }: PortalNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const searchParams = useSearchParams();
  const orgParam = searchParams.get("org");
  const orgQuery = orgParam && orgParam.trim().length > 0 ? `?org=${encodeURIComponent(orgParam.trim())}` : "";

  const linkClass =
    "px-3 py-2 rounded text-sm font-semibold hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f9d818] transition whitespace-nowrap";
  const mobileLinkClass =
    "block px-3 py-2 rounded text-base font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f9d818] transition";

  const navLinks = isMonitoringRole(role)
    ? [
        { href: "/osa", label: "OSA Overview" },
        { href: `/ledger${orgQuery}`, label: "Organization Ledger Summary" },
        { href: `/reports${orgQuery}`, label: "Reports" },
        { href: "/account", label: "Account" },
      ]
    : isTransparencyRole(role)
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/reports", label: "Reports" },
        { href: "/account", label: "Account" },
      ]
    : isManagementRole(role)
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/settings/term", label: "Term Settings" },
        { href: "/ledger", label: "Digital Ledger" },
        { href: "/reports", label: "Financial Reports" },
        { href: "/audit-log", label: "Treasurer Log" },
        { href: "/account", label: "Account" },
      ]
    : [];

  return (
    <>
      {/* Desktop Navigation */}
      <nav aria-label="Desktop Navigation" className="hidden md:flex items-center space-x-1 font-semibold">
        {navLinks.map((link) => (
          <Link key={link.href} href={link.href} className={linkClass}>
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Mobile Menu Toggle Button */}
      <div className="md:hidden flex items-center">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls="mobile-menu"
          aria-label="Toggle navigation menu"
          className="inline-flex items-center justify-center p-2 rounded-md text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f9d818] transition"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu Overlay Dropdown */}
      {isOpen && (
        <div id="mobile-menu" className="md:hidden absolute top-16 left-0 w-full bg-[#004aad] border-b-4 border-[#f9d818] shadow-xl z-50 px-4 pt-2 pb-4 space-y-2">
          {userName && (
            <div className="px-3 py-2 border-b border-blue-700 text-xs mb-2">
              <div className="font-bold text-white text-sm">{userName}</div>
              <div className="text-yellow-300 font-semibold">{role} • {userOrgName || "Office of Student Affairs"}</div>
            </div>
          )}
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setIsOpen(false)}
              className={mobileLinkClass}
            >
              {link.label}
            </Link>
          ))}
          <form action={logoutAction} className="pt-2">
            <button
              type="submit"
              className="w-full text-left bg-[#f9d818] hover:bg-yellow-400 text-[#004aad] font-bold px-3 py-2 rounded shadow transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Logout
            </button>
          </form>
        </div>
      )}
    </>
  );
}
