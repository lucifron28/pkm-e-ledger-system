"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/lib/actions/password";

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePasswordAction, null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-3.5 text-red-800 text-sm rounded">
          <p className="font-semibold">{state.error}</p>
        </div>
      )}

      <div>
        <label htmlFor="currentPassword" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
          Current Password
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          placeholder="Enter current password"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition"
        />
        {state?.fieldErrors?.currentPassword && (
          <p className="mt-1 text-xs text-red-600 font-medium">{state.fieldErrors.currentPassword[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="newPassword" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
          New Password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          placeholder="Min. 8 characters"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition"
        />
        {state?.fieldErrors?.newPassword && (
          <p className="mt-1 text-xs text-red-600 font-medium">{state.fieldErrors.newPassword[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="confirmNewPassword" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
          Confirm New Password
        </label>
        <input
          id="confirmNewPassword"
          name="confirmNewPassword"
          type="password"
          required
          placeholder="Re-type new password"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition"
        />
        {state?.fieldErrors?.confirmNewPassword && (
          <p className="mt-1 text-xs text-red-600 font-medium">{state.fieldErrors.confirmNewPassword[0]}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-[#004aad] hover:bg-blue-800 text-white font-bold py-3 px-4 rounded-lg shadow transition duration-150 text-sm disabled:opacity-50 flex items-center justify-center mt-2"
      >
        {isPending ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Updating password...
          </>
        ) : (
          "Update Password"
        )}
      </button>
    </form>
  );
}
