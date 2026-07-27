"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions/auth";
import Link from "next/link";

interface LoginFormProps {
  registeredMessage?: boolean;
}

export function LoginForm({ registeredMessage }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="space-y-5">
      {registeredMessage && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3.5 text-emerald-800 text-sm rounded">
          <p className="font-semibold">Account registered successfully!</p>
          <p className="text-xs text-emerald-700">Please log in with your credentials.</p>
        </div>
      )}

      {state?.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-3.5 text-red-800 text-sm rounded">
          <p className="font-semibold">{state.error}</p>
        </div>
      )}

      <div>
        <label htmlFor="username" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          placeholder="Enter your username"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition"
        />
        {state?.fieldErrors?.username && (
          <p className="mt-1 text-xs text-red-600 font-medium">{state.fieldErrors.username[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Enter your password"
          className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition"
        />
        {state?.fieldErrors?.password && (
          <p className="mt-1 text-xs text-red-600 font-medium">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-[#004aad] hover:bg-blue-800 text-white font-bold py-3 px-4 rounded-lg shadow transition duration-150 text-sm disabled:opacity-50 flex items-center justify-center"
      >
        {isPending ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Logging in...
          </>
        ) : (
          "Log In to Account"
        )}
      </button>

      <div className="text-center pt-2 text-xs text-slate-600">
        Officer or Member without an account?{" "}
        <Link href="/register" className="text-[#004aad] font-bold hover:underline">
          Register here
        </Link>
      </div>
    </form>
  );
}
