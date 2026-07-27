import { requireUser } from "@/lib/auth/require-auth";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function ChangePasswordPage() {
  const user = await requireUser(true); // skipPasswordCheck = true so user can view this page

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="inline-flex items-center space-x-2">
          <span className="bg-[#f9d818] text-[#004aad] font-extrabold w-10 h-10 rounded-lg flex items-center justify-center text-lg shadow-inner">
            PKM
          </span>
          <span className="font-extrabold text-2xl text-[#004aad]">e-Ledger System</span>
        </div>
        <h2 className="text-lg font-bold text-slate-800">
          Change Account Password
        </h2>
        {user.mustChangePassword && (
          <div className="bg-amber-50 border-l-4 border-amber-500 p-3 text-amber-900 text-xs rounded text-left">
            <p className="font-semibold">Mandatory Password Update Required</p>
            <p>Your account requires a password update before accessing portal features.</p>
          </div>
        )}
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl border border-slate-200 sm:rounded-xl sm:px-10">
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
