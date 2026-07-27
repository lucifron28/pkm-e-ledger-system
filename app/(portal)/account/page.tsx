import { requireUser } from "@/lib/auth/require-auth";
import { logoutAction } from "@/lib/actions/logout";
import Link from "next/link";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Account Settings</h1>
        <p className="text-sm text-slate-600">
          Manage your user profile details, security settings, and session status.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-[#004aad] text-white px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-base">User Profile Details</h2>
          <span className="bg-[#f9d818] text-[#004aad] text-xs font-extrabold px-2.5 py-1 rounded uppercase tracking-wider">
            {user.role}
          </span>
        </div>

        <div className="p-6 divide-y divide-slate-100">
          <div className="py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Full Name
            </span>
            <span className="sm:col-span-2 text-sm font-semibold text-slate-900">
              {user.fullName}
            </span>
          </div>

          <div className="py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Username
            </span>
            <span className="sm:col-span-2 text-sm font-mono font-medium text-slate-900">
              {user.username}
            </span>
          </div>

          <div className="py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Assigned Role
            </span>
            <span className="sm:col-span-2 text-sm font-semibold text-slate-900">
              {user.role}
            </span>
          </div>

          <div className="py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Assigned Organization
            </span>
            <span className="sm:col-span-2 text-sm font-semibold text-slate-900">
              {user.organizationName || "Office of Student Affairs (OSA)"}
            </span>
          </div>

          <div className="py-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Account Status
            </span>
            <span className="sm:col-span-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                Active
              </span>
            </span>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/change-password"
            className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-4 py-2 rounded-lg text-sm shadow transition"
          >
            Change Password
          </Link>

          <form action={logoutAction}>
            <button
              type="submit"
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg text-sm shadow transition"
            >
              Logout Account
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
