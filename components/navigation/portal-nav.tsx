"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Role } from "@prisma/client";
import {
  isManagementRole,
  isTransparencyRole,
  isMonitoringRole,
} from "@/lib/auth/rbac";

interface PortalNavProps {
  role: Role;
}

export function PortalNav({ role }: PortalNavProps) {
  const searchParams = useSearchParams();
  const orgParam = searchParams.get("org");
  const orgQuery = orgParam && orgParam.trim().length > 0 ? `?org=${encodeURIComponent(orgParam.trim())}` : "";

  if (isMonitoringRole(role)) {
    return (
      <nav className="hidden md:flex items-center space-x-4 text-sm font-semibold">
        <Link href="/osa" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
          OSA Overview
        </Link>
        <Link href={`/ledger${orgQuery}`} className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
          Organization Ledger Summary
        </Link>
        <Link href={`/reports${orgQuery}`} className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
          Reports
        </Link>
        <Link href="/account" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
          Account
        </Link>
      </nav>
    );
  }

  if (isTransparencyRole(role)) {
    return (
      <nav className="hidden md:flex items-center space-x-4 text-sm font-semibold">
        <Link href="/dashboard" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
          Dashboard
        </Link>
        <Link href="/reports" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
          Reports
        </Link>
        <Link href="/account" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
          Account
        </Link>
      </nav>
    );
  }

  if (isManagementRole(role)) {
    return (
      <nav className="hidden md:flex items-center space-x-4 text-sm font-semibold">
        <Link href="/dashboard" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
          Dashboard
        </Link>
        <Link href="/settings/term" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
          Term Settings
        </Link>
        <Link href="/ledger" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
          Digital Ledger
        </Link>
        <Link href="/reports" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
          Financial Reports
        </Link>
        <Link href="/audit-log" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
          Treasurer Log
        </Link>
        <Link href="/account" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
          Account
        </Link>
      </nav>
    );
  }

  return null;
}
