import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-pkm-surface text-pkm-ink">
      <header className="border-b border-pkm-border bg-white">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded bg-pkm-blue text-sm font-bold text-white">
              PKM
            </span>
            <span className="font-semibold text-pkm-blue">
              PKM e-Ledger System
            </span>
          </Link>
          <div className="flex items-center gap-5 text-sm font-medium">
            <a className="text-pkm-muted hover:text-pkm-blue" href="#about">
              About the System
            </a>
            <Link
              className="rounded bg-pkm-blue px-4 py-2 text-white hover:bg-pkm-blue-dark"
              href="/login"
            >
              Login
            </Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-77px)] w-full max-w-6xl content-center gap-10 px-6 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="max-w-2xl">
          <p className="mb-4 text-sm font-semibold uppercase text-pkm-blue">
            Pambayang Kolehiyo ng Mauban
          </p>
          <h1 className="text-4xl font-bold leading-tight text-pkm-ink sm:text-5xl">
            Welcome to the PKM e-Ledger System
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-pkm-muted">
            A web-based platform for recording, monitoring, and summarizing
            student organization funds efficiently and transparently.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="rounded bg-pkm-blue px-5 py-3 text-sm font-semibold text-white hover:bg-pkm-blue-dark"
              href="/login"
            >
              Login
            </Link>
            <a
              className="rounded border border-pkm-border bg-white px-5 py-3 text-sm font-semibold text-pkm-blue hover:border-pkm-blue"
              href="#about"
            >
              About the System
            </a>
          </div>
        </div>

        <div
          id="about"
          className="border-l-4 border-pkm-yellow bg-white p-7 shadow-sm"
        >
          <h2 className="text-xl font-semibold text-pkm-blue">
            Authorized financial transparency
          </h2>
          <ul className="mt-5 space-y-4 text-sm leading-6 text-pkm-muted">
            <li>
              This system is intended for authorized student organization users
              only.
            </li>
            <li>
              Financial records shall be managed by authorized Treasurer,
              Adviser, and Audit users.
            </li>
            <li>
              Officers and members may only view financial summaries and
              reports.
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
