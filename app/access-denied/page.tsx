import Link from "next/link";
import { IconLockX as LockX } from "@tabler/icons-react";
import { getSession } from "@/lib/auth/session";
import { PublicShell } from "@/components/ui/public-shell";
import { ButtonLink, StatusPanel } from "@/components/ui/patterns";

export default async function AccessDeniedPage() {
  const user = await getSession();
  const destination = user ? (user.role === "OSA" ? "/osa" : "/dashboard") : "/login";

  return (
    <PublicShell title="Access not available" subtitle="This account does not have permission to open the requested page.">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-700">
          <LockX size={28} aria-hidden="true" />
        </div>
        <StatusPanel title="Permission required" tone="danger">
          Return to your authorized workspace or sign in with another account.
        </StatusPanel>
        <ButtonLink href={destination}>Return to authorized home</ButtonLink>
        {!user && <Link href="/" className="ui-inline-link">Return to public home</Link>}
      </div>
    </PublicShell>
  );
}
