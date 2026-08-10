"use client";

import { useActionState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import Link from "next/link";
import { registerAction } from "@/lib/actions/register";

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
    <form action={formAction} className="space-y-4" aria-busy={isPending}>
      {state?.error && (
        <div role="alert" aria-live="assertive" className="ui-status ui-status-danger">
          <p className="font-semibold">{state.error}</p>
        </div>
      )}

      <div>
        <label htmlFor="fullName" className="ui-label">Full name</label>
        <input id="fullName" name="fullName" type="text" required autoComplete="name" placeholder="e.g. Juan Dela Cruz" className="ui-input" />
        {state?.fieldErrors?.fullName && <p role="alert" className="ui-field-error">{state.fieldErrors.fullName[0]}</p>}
      </div>

      <div>
        <label htmlFor="username" className="ui-label">Username</label>
        <input id="username" name="username" type="text" required autoComplete="username" placeholder="Choose a username" className="ui-input" />
        {state?.fieldErrors?.username && <p role="alert" className="ui-field-error">{state.fieldErrors.username[0]}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="password" className="ui-label">Password</label>
          <input id="password" name="password" type="password" required autoComplete="new-password" placeholder="Minimum 8 characters" className="ui-input" />
          {state?.fieldErrors?.password && <p role="alert" className="ui-field-error">{state.fieldErrors.password[0]}</p>}
        </div>
        <div>
          <label htmlFor="confirmPassword" className="ui-label">Confirm password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" placeholder="Re-type password" className="ui-input" />
          {state?.fieldErrors?.confirmPassword && <p role="alert" className="ui-field-error">{state.fieldErrors.confirmPassword[0]}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="organizationId" className="ui-label">Student organization</label>
        <select id="organizationId" name="organizationId" required defaultValue="" className="ui-select">
          <option value="" disabled>Select your organization</option>
          {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
        </select>
        {state?.fieldErrors?.organizationId && <p role="alert" className="ui-field-error">{state.fieldErrors.organizationId[0]}</p>}
      </div>

      <div>
        <label htmlFor="requestedRole" className="ui-label">Requested role</label>
        <select id="requestedRole" name="requestedRole" required defaultValue="MEMBER" className="ui-select">
          <option value="MEMBER">Member - view-only transparency</option>
          <option value="OFFICER">Officer - view-only transparency</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">Treasurer, Adviser, Audit, and OSA accounts are assigned by administrators.</p>
      </div>

      <button type="submit" disabled={isPending} className="ui-button ui-button-primary w-full mt-2">
        {isPending ? <><Loader2 size={17} className="animate-spin" aria-hidden="true" /> Creating account...</> : "Create account"}
      </button>

      <p className="text-center pt-2 text-xs text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="ui-inline-link inline-flex min-h-0">Sign in here</Link>
      </p>
    </form>
  );
}
