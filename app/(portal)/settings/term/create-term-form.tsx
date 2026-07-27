"use client";

import { useActionState } from "react";
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

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && !state.fieldErrors && (
        <div className="bg-red-50 border-l-4 border-red-500 p-3 text-red-800 text-sm rounded">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="academicYear"
            className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
          >
            Academic Year
          </label>
          <input
            id="academicYear"
            name="academicYear"
            type="text"
            required
            placeholder="e.g. 2026-2027"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition"
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
            className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
          >
            Semester
          </label>
          <select
            id="semester"
            name="semester"
            required
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition"
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
            className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
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
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition font-mono"
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
            className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
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
            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004aad] focus:border-transparent transition font-mono"
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
            className="w-4 h-4 text-[#004aad] border-slate-300 rounded focus:ring-[#004aad]"
          />
          <label htmlFor="activate" className="text-sm text-slate-700">
            Set as active term (will deactivate the current active term)
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="bg-[#004aad] hover:bg-blue-800 text-white font-bold px-5 py-2.5 rounded-lg shadow transition text-sm disabled:opacity-50"
      >
        {isPending ? "Creating..." : "Create Academic Term"}
      </button>
    </form>
  );
}
