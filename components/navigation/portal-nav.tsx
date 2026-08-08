"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { Role } from "@prisma/client";
import { getPortalNavLinks } from "@/lib/auth/rbac";
import { logoutAction } from "@/lib/actions/logout";

interface PortalNavProps {
  role: Role;
  userName?: string;
  userOrgName?: string;
}

export function PortalNav({ role, userName, userOrgName }: PortalNavProps) {
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeMenu]);

  const linkClass = (isActive: boolean) =>
    `px-3 py-2 rounded text-sm font-semibold hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f9d818] transition whitespace-nowrap ${
      isActive ? "bg-blue-900 text-[#f9d818]" : "text-white"
    }`;

  const mobileLinkClass = (isActive: boolean) =>
    `block px-3 py-2 rounded text-base font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f9d818] transition ${
      isActive ? "bg-blue-900 text-[#f9d818] font-bold" : "text-white"
    }`;

  // Desktop nav excludes duplicate Account button since header right controls render Account
  const desktopLinks = navLinks.filter((link) => link.href !== "/account");

  return (
    <>
      {/* Desktop Navigation - xl and wider */}
      <nav aria-label="Desktop Navigation" className="hidden xl:flex items-center space-x-1 font-semibold">
        {desktopLinks.map((link) => {
          const isActive = pathname === link.href.split("?")[0];
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? "page" : undefined}
              className={linkClass(isActive)}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile / Compact Menu Toggle Button - below xl */}
      <div className="xl:hidden flex items-center">
        <button
          ref={buttonRef}
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

      {/* Mobile / Compact Menu Overlay Dropdown - below xl */}
      {isOpen && (
        <div
          id="mobile-menu"
          className="xl:hidden absolute top-16 left-0 w-full bg-[#004aad] border-b-4 border-[#f9d818] shadow-xl z-50 px-4 pt-2 pb-4 space-y-2"
        >
          {userName && (
            <div className="px-3 py-2 border-b border-blue-700 text-xs mb-2">
              <div className="font-bold text-white text-sm">{userName}</div>
              <div className="text-yellow-300 font-semibold">{role} • {userOrgName || "Office of Student Affairs"}</div>
            </div>
          )}
          {navLinks.map((link) => {
            const isActive = pathname === link.href.split("?")[0];
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setIsOpen(false)}
                className={mobileLinkClass(isActive)}
              >
                {link.label}
              </Link>
            );
          })}
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
