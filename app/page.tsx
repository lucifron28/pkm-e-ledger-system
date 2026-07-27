import Link from "next/link";
import { getSession } from "@/lib/auth/session";

export default async function HomePage() {
  const sessionUser = await getSession();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 font-sans">
      {/* Header Bar */}
      <header className="bg-[#004aad] text-white shadow-md border-b-4 border-[#f9d818]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-[#f9d818] text-[#004aad] font-extrabold w-11 h-11 rounded-lg flex items-center justify-center text-xl shadow-inner">
              PKM
            </div>
            <div>
              <h1 className="font-bold text-xl leading-tight tracking-wide">
                PKM e-Ledger System
              </h1>
              <p className="text-xs text-blue-100 font-medium">
                Pambayang Kolehiyo ng Mauban — Student Organization Ledger
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {sessionUser ? (
              <Link
                href={sessionUser.role === "OSA" ? "/osa" : "/dashboard"}
                className="bg-[#f9d818] hover:bg-yellow-400 text-[#004aad] font-bold px-5 py-2.5 rounded-md shadow transition duration-150 text-sm"
              >
                Go to Portal →
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-white hover:text-yellow-300 font-semibold px-4 py-2 text-sm transition"
                >
                  Log In
                </Link>
                <Link
                  href="/register"
                  className="bg-[#f9d818] hover:bg-yellow-400 text-[#004aad] font-bold px-5 py-2.5 rounded-md shadow transition duration-150 text-sm"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col justify-center">
        <div className="text-center max-w-3xl mx-auto space-y-6">
          <div className="inline-block bg-blue-100 text-[#004aad] text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full border border-blue-200">
            Office of Student Affairs (OSA) Financial Platform
          </div>

          <h2 className="text-4xl sm:text-5xl font-extrabold text-[#004aad] leading-tight">
            Digitized Financial Record-Keeping & Oversight
          </h2>

          <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
            The PKM e-Ledger System provides secure balance tracking, receipt attachment management, immutable audit logging, and official financial report generation for all 14 recognized student organizations at Pambayang Kolehiyo ng Mauban.
          </p>

          <div className="pt-4 flex flex-wrap justify-center gap-4">
            {sessionUser ? (
              <Link
                href={sessionUser.role === "OSA" ? "/osa" : "/dashboard"}
                className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-8 py-3.5 rounded-lg shadow-lg transition text-base"
              >
                Open Financial Portal
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-8 py-3.5 rounded-lg shadow-lg transition text-base"
                >
                  Log In to Account
                </Link>
                <Link
                  href="/register"
                  className="bg-white hover:bg-slate-100 text-[#004aad] font-bold border-2 border-[#004aad] px-8 py-3.5 rounded-lg shadow transition text-base"
                >
                  Officer / Member Registration
                </Link>
              </>
            )}
          </div>
        </div>

        {/* System Features Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="w-12 h-12 bg-blue-50 text-[#004aad] rounded-lg flex items-center justify-center font-bold text-xl">
              14
            </div>
            <h3 className="font-bold text-slate-900 text-lg">Recognized Organizations</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Complete organization data isolation across all academic units and student groups.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="w-12 h-12 bg-blue-50 text-[#004aad] rounded-lg flex items-center justify-center font-bold text-xl">
              RBAC
            </div>
            <h3 className="font-bold text-slate-900 text-lg">Role-Based Access</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Strict permissions for Treasurers, Advisers, Auditors, Officers, Members, and OSA Personnel.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="w-12 h-12 bg-yellow-50 text-amber-700 rounded-lg flex items-center justify-center font-bold text-xl">
              Reports
            </div>
            <h3 className="font-bold text-slate-900 text-lg">Official Financial Package</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Automated generation of Summary Reports, Schedule 1 Collections, and Schedule 2 Expenses.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-1">
          <p>© {new Date().getFullYear()} Pambayang Kolehiyo ng Mauban — Office of Student Affairs.</p>
          <p className="text-slate-500">PKM e-Ledger System • Local-First Financial Record-Keeping Platform</p>
        </div>
      </footer>
    </div>
  );
}
