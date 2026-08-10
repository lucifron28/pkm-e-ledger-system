"use client";

import { useActionState, useMemo } from "react";
import { activateAcademicTermAction } from "@/lib/actions/terms";

interface ActivateTermFormProps {
  termId: string;
}

export function ActivateTermForm({ termId }: ActivateTermFormProps) {
  const [state, formAction, isPending] = useActionState(
    activateAcademicTermAction,
    null
  );
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  return (
    <form action={formAction} aria-busy={isPending}>
      <input type="hidden" name="termId" value={termId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <button
        type="submit"
        disabled={isPending}
        className="ui-button ui-button-success px-3 text-xs"
      >
        {isPending ? "Activating..." : "Set Active"}
      </button>
      {state?.error && (
        <p role="alert" className="mt-1 text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}
