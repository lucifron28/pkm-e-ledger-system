"use client";

import { useActionState, useMemo } from "react";
import { createAcademicTermAction } from "@/lib/actions/terms";
import { SEMESTER_LABELS } from "@/lib/data/term-labels";

interface CreateTermFormProps {
  hasActiveTerm: boolean;
}

export function CreateTermForm({ hasActiveTerm }: CreateTermFormProps) {
  const [state, formAction, isPending] = useActionState(
    createAcademicTermAction,
    null
  );
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  return (
    <form action={formAction} className="space-y-5" aria-busy={isPending}>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state?.error && !state.fieldErrors && (
        <div role="alert" aria-live="assertive" className="ui-status ui-status-danger"><p>{state.error}</p></div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="academicYear"
            className="ui-label"
          >
            Academic Year
          </label>
          <input
            id="academicYear"
            name="academicYear"
            type="text"
            required
            placeholder="e.g. 2026-2027"
            className="ui-input"
          />
          {state?.fieldErrors?.academicYear && (
            <p className="mt-1 text-xs text-red-600 font-medium">
              {state.fieldErrors.academicYear[0]}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="semester"
            className="ui-label"
          >
            Semester
          </label>
          <select
            id="semester"
            name="semester"
            required
            className="ui-select"
          >
            <option value="">Select semester</option>
            {Object.entries(SEMESTER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {state?.fieldErrors?.semester && (
            <p className="mt-1 text-xs text-red-600 font-medium">
              {state.fieldErrors.semester[0]}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="openingCashOnHand"
            className="ui-label"
          >
            Opening Cash on Hand
          </label>
          <input
            id="openingCashOnHand"
            name="openingCashOnHand"
            type="text"
            inputMode="decimal"
            required
            placeholder="0.00"
            className="ui-input font-mono"
          />
          {state?.fieldErrors?.openingCashOnHand && (
            <p className="mt-1 text-xs text-red-600 font-medium">
              {state.fieldErrors.openingCashOnHand[0]}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="openingCashInBank"
            className="ui-label"
          >
            Opening Cash in Bank
          </label>
          <input
            id="openingCashInBank"
            name="openingCashInBank"
            type="text"
            inputMode="decimal"
            required
            placeholder="0.00"
            className="ui-input font-mono"
          />
          {state?.fieldErrors?.openingCashInBank && (
            <p className="mt-1 text-xs text-red-600 font-medium">
              {state.fieldErrors.openingCashInBank[0]}
            </p>
          )}
        </div>
      </div>

      {hasActiveTerm && (
        <div className="flex items-center space-x-2">
          <input
            id="activate"
            name="activate"
            type="checkbox"
            value="true"
            className="h-5 w-5 accent-[#004aad]"
          />
          <label htmlFor="activate" className="text-sm text-slate-700">
            Set as active term (will deactivate the current active term)
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="ui-button ui-button-primary"
      >
        {isPending ? "Creating..." : "Create Academic Term"}
      </button>
    </form>
  );
}
