"use client";

import { useActionState } from "react";
import { registerAction } from "@/lib/actions/register";
import Link from "next/link";

interface OrganizationOption {
  id: string;
  name: string;
}

interface RegisterFormProps {
  organizations: OrganizationOption[];
}

export function RegisterForm({ organizations }: RegisterFormProps) {
  const [state, formAction, isPending] = useActionState(registerAction, null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-3.5 text-red-800 text-sm rounded">
          <p className="font-semibold">{state.error}</p>
        </div>
      )}

      <div>
        <label htmlFor="fullName" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
          Full Name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          placeholder="e.g., Juan Dela Cruz"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition"
        />
        {state?.fieldErrors?.fullName && (
          <p className="mt-1 text-xs text-red-600 font-medium">{state.fieldErrors.fullName[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="username" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          placeholder="Choose a username"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition"
        />
        {state?.fieldErrors?.username && (
          <p className="mt-1 text-xs text-red-600 font-medium">{state.fieldErrors.username[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            placeholder="Min. 8 characters"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition"
          />
          {state?.fieldErrors?.password && (
            <p className="mt-1 text-xs text-red-600 font-medium">{state.fieldErrors.password[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            placeholder="Re-type password"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition"
          />
          {state?.fieldErrors?.confirmPassword && (
            <p className="mt-1 text-xs text-red-600 font-medium">{state.fieldErrors.confirmPassword[0]}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="organizationId" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
          Student Organization
        </label>
        <select
          id="organizationId"
          name="organizationId"
          required
          defaultValue=""
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition"
        >
          <option value="" disabled>
            Select your organization
          </option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        {state?.fieldErrors?.organizationId && (
          <p className="mt-1 text-xs text-red-600 font-medium">{state.fieldErrors.organizationId[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="requestedRole" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
          Role
        </label>
        <select
          id="requestedRole"
          name="requestedRole"
          required
          defaultValue="MEMBER"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition"
        >
          <option value="MEMBER">Member (View-only transparency)</option>
          <option value="OFFICER">Officer (View-only transparency)</option>
        </select>
        <p className="mt-1 text-[11px] text-slate-500 italic">
          * Note: Treasurer, Adviser, Auditor, and OSA accounts are assigned by system administrators.
        </p>
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
            Creating account...
          </>
        ) : (
          "Register Account"
        )}
      </button>

      <div className="text-center pt-2 text-xs text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="text-[#004aad] font-bold hover:underline">
          Log in here
        </Link>
      </div>
    </form>
  );
}
