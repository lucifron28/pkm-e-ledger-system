"use client";

import { useActionState } from "react";
import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import { changePasswordAction } from "@/lib/actions/password";

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePasswordAction, null);

  return (
    <form action={formAction} className="space-y-4" aria-busy={isPending}>
      {state?.error && (
        <div role="alert" aria-live="assertive" className="ui-status ui-status-danger">
          <p className="font-semibold">{state.error}</p>
        </div>
      )}

      <div>
        <label htmlFor="currentPassword" className="ui-label">Current password</label>
        <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" placeholder="Enter current password" className="ui-input" />
        {state?.fieldErrors?.currentPassword && <p role="alert" className="ui-field-error">{state.fieldErrors.currentPassword[0]}</p>}
      </div>

      <div>
        <label htmlFor="newPassword" className="ui-label">New password</label>
        <input id="newPassword" name="newPassword" type="password" required autoComplete="new-password" placeholder="Minimum 8 characters" className="ui-input" />
        {state?.fieldErrors?.newPassword && <p role="alert" className="ui-field-error">{state.fieldErrors.newPassword[0]}</p>}
      </div>

      <div>
        <label htmlFor="confirmNewPassword" className="ui-label">Confirm new password</label>
        <input id="confirmNewPassword" name="confirmNewPassword" type="password" required autoComplete="new-password" placeholder="Re-type new password" className="ui-input" />
        {state?.fieldErrors?.confirmNewPassword && <p role="alert" className="ui-field-error">{state.fieldErrors.confirmNewPassword[0]}</p>}
      </div>

      <button type="submit" disabled={isPending} className="ui-button ui-button-primary w-full mt-2">
        {isPending ? <><Loader2 size={17} className="animate-spin" aria-hidden="true" /> Updating password...</> : "Update password"}
      </button>
    </form>
  );
}
