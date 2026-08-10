"use client";

import { useActionState } from "react";
import { IconLoader2 as Loader2, IconDeviceFloppy as DeviceFloppy } from "@tabler/icons-react";
import { updateProfileAction } from "@/lib/actions/profile";
import { PROFILE_FIELD_LIMITS } from "@/lib/domain/profile";

export function ProfileForm({
  initialFullName,
  initialUsername,
}: {
  initialFullName: string;
  initialUsername: string;
}) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, null);

  return (
    <form action={formAction} className="space-y-4" aria-busy={isPending}>
      {state?.error && (
        <div role="alert" aria-live="assertive" className="ui-status ui-status-danger">
          <p className="font-semibold">{state.error}</p>
        </div>
      )}
      {state?.success && (
        <div role="status" aria-live="polite" className="ui-status ui-status-success">
          <p className="font-semibold">{state.success}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-full-name" className="ui-label">Full name</label>
          <input
            id="profile-full-name"
            name="fullName"
            type="text"
            required
            maxLength={PROFILE_FIELD_LIMITS.fullName}
            defaultValue={initialFullName}
            autoComplete="name"
            className="ui-input"
            aria-invalid={Boolean(state?.fieldErrors?.fullName)}
            aria-describedby={state?.fieldErrors?.fullName ? "profile-full-name-error" : undefined}
          />
          {state?.fieldErrors?.fullName && <p id="profile-full-name-error" role="alert" className="ui-field-error">{state.fieldErrors.fullName[0]}</p>}
        </div>

        <div>
          <label htmlFor="profile-username" className="ui-label">Username</label>
          <input
            id="profile-username"
            name="username"
            type="text"
            required
            maxLength={PROFILE_FIELD_LIMITS.username}
            defaultValue={initialUsername}
            autoComplete="username"
            className="ui-input"
            aria-invalid={Boolean(state?.fieldErrors?.username)}
            aria-describedby={state?.fieldErrors?.username ? "profile-username-error" : undefined}
          />
          {state?.fieldErrors?.username && <p id="profile-username-error" role="alert" className="ui-field-error">{state.fieldErrors.username[0]}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="profile-current-password" className="ui-label">Current password</label>
        <input
          id="profile-current-password"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Confirm changes with your current password"
          className="ui-input"
          aria-invalid={Boolean(state?.fieldErrors?.currentPassword)}
          aria-describedby={state?.fieldErrors?.currentPassword ? "profile-current-password-error" : undefined}
        />
        {state?.fieldErrors?.currentPassword && <p id="profile-current-password-error" role="alert" className="ui-field-error">{state.fieldErrors.currentPassword[0]}</p>}
      </div>

      <button type="submit" disabled={isPending} className="ui-button ui-button-primary">
        {isPending ? <><Loader2 size={17} className="animate-spin" aria-hidden="true" /> Saving profile...</> : <><DeviceFloppy size={17} aria-hidden="true" /> Save profile</>}
      </button>
    </form>
  );
}
