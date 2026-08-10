"use client";

import { useActionState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import Link from "next/link";
import { loginAction } from "@/lib/actions/auth";

interface LoginFormProps {
  registeredMessage?: boolean;
}

export function LoginForm({ registeredMessage }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="space-y-5" aria-busy={isPending}>
      {registeredMessage && (
        <div role="status" aria-live="polite" className="ui-status ui-status-success">
          <div>
            <p className="font-semibold">Account registered successfully.</p>
            <p className="text-xs">Please sign in with your credentials.</p>
          </div>
        </div>
      )}

      {state?.error && (
        <div role="alert" aria-live="assertive" className="ui-status ui-status-danger">
          <p className="font-semibold">{state.error}</p>
        </div>
      )}

      <div>
        <label htmlFor="username" className="ui-label">Username</label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          placeholder="Enter your username"
          aria-invalid={Boolean(state?.fieldErrors?.username)}
          aria-describedby={state?.fieldErrors?.username ? "login-username-error" : undefined}
          className="ui-input"
        />
        {state?.fieldErrors?.username && <p id="login-username-error" role="alert" className="ui-field-error">{state.fieldErrors.username[0]}</p>}
      </div>

      <div>
        <label htmlFor="password" className="ui-label">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Enter your password"
          aria-invalid={Boolean(state?.fieldErrors?.password)}
          aria-describedby={state?.fieldErrors?.password ? "login-password-error" : undefined}
          className="ui-input"
        />
        {state?.fieldErrors?.password && <p id="login-password-error" role="alert" className="ui-field-error">{state.fieldErrors.password[0]}</p>}
      </div>

      <button type="submit" disabled={isPending} className="ui-button ui-button-primary w-full">
        {isPending ? <><Loader2 size={17} className="animate-spin" aria-hidden="true" /> Signing in...</> : "Sign in to account"}
      </button>

      <p className="text-center pt-2 text-xs text-slate-600">
        Officer or Member without an account?{" "}
        <Link href="/register" className="ui-inline-link inline-flex min-h-0">Register here</Link>
      </p>
    </form>
  );
}
