"use client";

import { useActionState } from "react";
import { activateAcademicTermAction } from "@/lib/actions/terms";

interface ActivateTermFormProps {
  termId: string;
}

export function ActivateTermForm({ termId }: ActivateTermFormProps) {
  const [state, formAction, isPending] = useActionState(
    activateAcademicTermAction,
    null
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="termId" value={termId} />
      <button
        type="submit"
        disabled={isPending}
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded text-xs shadow transition disabled:opacity-50"
      >
        {isPending ? "Activating..." : "Set Active"}
      </button>
      {state?.error && (
        <p className="mt-1 text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}
