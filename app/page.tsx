import Link from "next/link";
import { IconArrowRight as ArrowRight, IconFileAnalytics as FileAnalytics, IconShieldCheck as ShieldCheck } from "@tabler/icons-react";
import { getSession } from "@/lib/auth/session";
import { PkmLogo } from "@/components/branding/pkm-logo";
import { ButtonLink, Panel } from "@/components/ui/patterns";

export default async function HomePage() {
  const sessionUser = await getSession();
  const portalHref = sessionUser?.role === "OSA" ? "/osa" : "/dashboard";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <a href="#main-content" className="ui-skip-link">Skip to main content</a>
      <header className="border-b border-blue-900 bg-[#004aad] text-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <Link href="/" className="flex min-h-11 items-center gap-3">
            <PkmLogo size={40} priority className="h-10 w-10 rounded bg-white p-0.5" />
            <span className="grid gap-0.5">
              <strong className="text-sm font-extrabold tracking-tight sm:text-base">PKM e-Ledger</strong>
              <small className="text-[11px] font-semibold text-blue-100">Student organization financial records</small>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {sessionUser ? (
              <ButtonLink href={portalHref} variant="secondary" className="border-blue-200 bg-white text-[#004aad] hover:bg-blue-50">
                Open portal <ArrowRight size={16} aria-hidden="true" />
              </ButtonLink>
            ) : (
              <>
                <Link href="/login" className="inline-flex min-h-11 items-center rounded-md px-3 text-xs font-extrabold text-white hover:bg-blue-800">Sign in</Link>
                <ButtonLink href="/register" variant="secondary" className="border-blue-200 bg-white text-[#004aad] hover:bg-blue-50">Register</ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-center lg:py-20">
        <section className="max-w-2xl space-y-6">
          <p className="ui-eyebrow text-[#004aad]">Office of Student Affairs</p>
          <h1 className="text-4xl font-black leading-tight tracking-tight text-slate-950 sm:text-5xl">
            One reliable place for organization financial records.
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Record collections and expenses, track Cash on Hand and Cash in Bank, preserve supporting documents, and prepare official financial report packages.
          </p>
          <div className="flex flex-wrap gap-3">
            {sessionUser ? (
              <ButtonLink href={portalHref}>Continue to portal <ArrowRight size={17} aria-hidden="true" /></ButtonLink>
            ) : (
              <ButtonLink href="/login">Sign in to your account <ArrowRight size={17} aria-hidden="true" /></ButtonLink>
            )}
            <ButtonLink href="/register" variant="secondary">Create view-only account</ButtonLink>
          </div>
        </section>

        <Panel title="Designed for accountable review" description="Clear context, traceable records, and official report structure in every workflow.">
          <div className="space-y-4">
            <div className="flex gap-3 border-b border-slate-200 pb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-[#004aad]"><ShieldCheck size={21} aria-hidden="true" /></div>
              <div><h2 className="font-extrabold text-slate-900">Role-aware access</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">Each workspace exposes only the actions appropriate to the user&apos;s role.</p></div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"><FileAnalytics size={21} aria-hidden="true" /></div>
              <div><h2 className="font-extrabold text-slate-900">Official report package</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">Summary, Schedule 1 Collections, Schedule 2 Expenses, signatures, and attachment references.</p></div>
            </div>
          </div>
        </Panel>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-xs text-slate-500">
        Pambayang Kolehiyo ng Mauban - PKM e-Ledger System - Office of Student Affairs
      </footer>
    </div>
  );
}
