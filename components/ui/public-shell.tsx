import Link from "next/link";
import type { ReactNode } from "react";
import { PkmLogo } from "@/components/branding/pkm-logo";

export function PublicShell({
  title,
  subtitle,
  children,
  width = "md",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  width?: "md" | "lg";
}) {
  return (
    <div className="public-shell">
      <div className={`public-shell-inner ${width === "lg" ? "public-shell-wide" : ""}`}>
        <Link href="/" className="public-brand">
          <PkmLogo size={72} priority className="h-[4.5rem] w-[4.5rem] rounded-lg bg-white p-1" />
          <span>
            <strong>PKM e-Ledger</strong>
            <small>Pambayang Kolehiyo ng Mauban</small>
          </span>
        </Link>
        <div className="public-heading">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="public-form-panel">{children}</div>
        <p className="public-footer">Office of Student Affairs - Financial record-keeping system</p>
      </div>
    </div>
  );
}
