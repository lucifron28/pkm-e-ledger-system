import { requireUser } from "@/lib/auth/require-auth";
import { logoutAction } from "@/lib/actions/logout";
import { isMonitoringRole } from "@/lib/auth/rbac";
import Link from "next/link";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const isMonitoring = isMonitoringRole(user.role);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Top Header Navigation */}
      <header className="bg-[#004aad] text-white shadow border-b-4 border-[#f9d818]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <Link href={isMonitoring ? "/osa" : "/dashboard"} className="flex items-center space-x-2.5">
              <span className="bg-[#f9d818] text-[#004aad] font-extrabold w-9 h-9 rounded-lg flex items-center justify-center text-base shadow-inner">
                PKM
              </span>
              <span className="font-extrabold text-lg tracking-tight">e-Ledger</span>
            </Link>

            {/* Navigation links based on role */}
            <nav className="hidden md:flex items-center space-x-4 text-sm font-semibold">
              {isMonitoring ? (
                <Link href="/osa" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
                  OSA Monitoring Overview
                </Link>
              ) : (
                <Link href="/dashboard" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
                  Financial Dashboard
                </Link>
              )}
              <Link href="/account" className="px-3 py-1.5 rounded hover:bg-blue-800 transition">
                Account Settings
              </Link>
            </nav>
          </div>

          {/* Right Header User & Organization Info */}
          <div className="flex items-center space-x-4 text-xs">
            <div className="hidden sm:block text-right">
              <div className="font-bold text-white text-sm leading-tight">{user.fullName}</div>
              <div className="text-blue-100 flex items-center justify-end space-x-1.5">
                <span className="bg-blue-900 text-yellow-300 font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px]">
                  {user.role}
                </span>
                <span>• {user.organizationName || "Office of Student Affairs"}</span>
              </div>
            </div>

            <Link
              href="/account"
              className="bg-blue-800 hover:bg-blue-900 text-white px-3 py-1.5 rounded font-medium transition border border-blue-700"
            >
              Account
            </Link>

            <form action={logoutAction}>
              <button
                type="submit"
                className="bg-[#f9d818] hover:bg-yellow-400 text-[#004aad] font-bold px-3 py-1.5 rounded shadow transition"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-slate-100 border-t border-slate-200 text-slate-500 text-xs py-4">
        <div className="max-w-7xl mx-auto px-4 text-center">
          Pambayang Kolehiyo ng Mauban — PKM e-Ledger System • Office of Student Affairs
        </div>
      </footer>
    </div>
  );
}
