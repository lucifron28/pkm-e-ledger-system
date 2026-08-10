"use client";

import { useActionState, useState, useMemo } from "react";
import {
  createTransactionAction,
  createIncomeTransactionAction,
  createExpenseTransactionAction,
} from "@/lib/actions/transactions";
import type { CategoryDto } from "@/lib/data/transactions";
import { TransactionType } from "@prisma/client";

import { TRANSACTION_FIELD_LIMITS } from "@/lib/domain/field-limits";

interface CreateTransactionFormProps {
  activeTermId: string;
  incomeCategories: CategoryDto[];
  expenseCategories: CategoryDto[];
  initialType?: TransactionType;
  fixedType?: TransactionType;
}

export function CreateTransactionForm({
  activeTermId,
  incomeCategories,
  expenseCategories,
  initialType = TransactionType.INCOME,
  fixedType,
}: CreateTransactionFormProps) {
  const actionToUse =
    fixedType === TransactionType.INCOME
      ? createIncomeTransactionAction
      : fixedType === TransactionType.EXPENSE
      ? createExpenseTransactionAction
      : createTransactionAction;
  const [state, formAction, isPending] = useActionState(actionToUse, null);
  const effectiveInitialType = fixedType || initialType;
  const [txType, setTxType] = useState<TransactionType>(effectiveInitialType);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const categories = (fixedType || txType) === TransactionType.INCOME ? incomeCategories : expenseCategories;
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const handleTypeChange = (newType: TransactionType) => {
    if (fixedType) return;
    setTxType(newType);
    setSelectedCategoryId("");
  };

  const activeType = fixedType || txType;

  return (
    <form action={formAction} className="space-y-5" aria-busy={isPending}>
      <input type="hidden" name="termId" value={activeTermId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {fixedType && <input type="hidden" name="type" value={fixedType} />}
      {state?.error && (
        <div role="alert" aria-live="assertive" className="ui-status ui-status-danger"><p>{state.error}</p></div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          {fixedType ? (
            <>
              <span id="create-tx-type-label" className="ui-label">Type</span>
              <div aria-labelledby="create-tx-type-label" className="ui-input bg-slate-100 font-bold text-slate-700">
                {fixedType === TransactionType.INCOME ? "Income (Fixed)" : "Expense (Fixed)"}
              </div>
            </>
          ) : (
            <>
              <label htmlFor="create-tx-type" className="ui-label">Type</label>
              <select
                id="create-tx-type"
                name="type"
                value={txType}
                onChange={(e) => handleTypeChange(e.target.value as TransactionType)}
                aria-invalid={Boolean(state?.fieldErrors?.type)}
                aria-describedby={state?.fieldErrors?.type ? "create-tx-type-error" : undefined}
                className="ui-select"
              >
                <option value="INCOME">Income</option>
                <option value="EXPENSE">Expense</option>
              </select>
            </>
          )}
          {state?.fieldErrors?.type && <p id="create-tx-type-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.type[0]}</p>}
        </div>

        <div>
          <label htmlFor="create-tx-date" className="ui-label">Transaction date</label>
          <input
            id="create-tx-date"
            name="transactionDate"
            type="date"
            required
            aria-invalid={Boolean(state?.fieldErrors?.transactionDate)}
            aria-describedby={state?.fieldErrors?.transactionDate ? "create-tx-date-error" : undefined}
            className="ui-input"
          />
          {state?.fieldErrors?.transactionDate && <p id="create-tx-date-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.transactionDate[0]}</p>}
        </div>

        <div>
          <label htmlFor="create-tx-amount" className="ui-label">Amount (PHP)</label>
          <input
            id="create-tx-amount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            placeholder="0.00"
            aria-invalid={Boolean(state?.fieldErrors?.amount)}
            aria-describedby={state?.fieldErrors?.amount ? "create-tx-amount-error" : undefined}
            className="ui-input font-mono"
          />
          {state?.fieldErrors?.amount && <p id="create-tx-amount-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.amount[0]}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="create-tx-cash-account" className="ui-label">Cash account</label>
          <select
            id="create-tx-cash-account"
            name="cashAccount"
            required
            aria-invalid={Boolean(state?.fieldErrors?.cashAccount)}
            aria-describedby={state?.fieldErrors?.cashAccount ? "create-tx-cash-account-error" : undefined}
            className="ui-select"
          >
            <option value="">Select account</option>
            <option value="CASH_ON_HAND">Cash on Hand</option>
            <option value="CASH_IN_BANK">Cash in Bank</option>
          </select>
          {state?.fieldErrors?.cashAccount && <p id="create-tx-cash-account-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.cashAccount[0]}</p>}
        </div>

        <div>
          <label htmlFor="create-tx-category" className="ui-label">Category</label>
          <select
            id="create-tx-category"
            name="categoryId"
            required
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            aria-invalid={Boolean(state?.fieldErrors?.categoryId)}
            aria-describedby={state?.fieldErrors?.categoryId ? "create-tx-category-error" : undefined}
            className="ui-select"
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {state?.fieldErrors?.categoryId && <p id="create-tx-category-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.categoryId[0]}</p>}
        </div>

        <div>
          <label htmlFor="create-tx-doc-number" className="ui-label">Document number</label>
          <input
            id="create-tx-doc-number"
            name="documentNumber"
            type="text"
            maxLength={TRANSACTION_FIELD_LIMITS.documentNumber}
            placeholder="e.g. OR-001"
            aria-invalid={Boolean(state?.fieldErrors?.documentNumber)}
            aria-describedby={state?.fieldErrors?.documentNumber ? "create-tx-doc-number-error" : undefined}
            className="ui-input"
          />
          {state?.fieldErrors?.documentNumber && <p id="create-tx-doc-number-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.documentNumber[0]}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="create-tx-counterparty" className="ui-label">Payor / payee</label>
        <input
          id="create-tx-counterparty"
          name="counterpartyName"
          type="text"
          required
          maxLength={TRANSACTION_FIELD_LIMITS.counterpartyName}
          placeholder="Name of person or entity"
          aria-invalid={Boolean(state?.fieldErrors?.counterpartyName)}
          aria-describedby={state?.fieldErrors?.counterpartyName ? "create-tx-counterparty-error" : undefined}
          className="ui-input"
        />
        {state?.fieldErrors?.counterpartyName && <p id="create-tx-counterparty-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.counterpartyName[0]}</p>}
      </div>

      <div>
        <label htmlFor="create-tx-description" className="ui-label">Particulars</label>
        <input
          id="create-tx-description"
          name="description"
          type="text"
          required
          maxLength={TRANSACTION_FIELD_LIMITS.description}
          placeholder="Brief description of the transaction"
          aria-invalid={Boolean(state?.fieldErrors?.description)}
          aria-describedby={state?.fieldErrors?.description ? "create-tx-description-error" : undefined}
          className="ui-input"
        />
        {state?.fieldErrors?.description && <p id="create-tx-description-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.description[0]}</p>}
      </div>

      <div>
        <label htmlFor="create-tx-reference" className="ui-label">Reference / attachment description</label>
        <input
          id="create-tx-reference"
          name="referenceDescription"
          type="text"
          required
          maxLength={TRANSACTION_FIELD_LIMITS.referenceDescription}
          placeholder="Notes about supporting documents"
          aria-invalid={Boolean(state?.fieldErrors?.referenceDescription)}
          aria-describedby={state?.fieldErrors?.referenceDescription ? "create-tx-reference-error" : undefined}
          className="ui-input"
        />
        {state?.fieldErrors?.referenceDescription && <p id="create-tx-reference-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.referenceDescription[0]}</p>}
      </div>

      <div>
        <label htmlFor="create-tx-attachment" className="ui-label">
          Receipt attachment
        </label>
        <input
          id="create-tx-attachment"
          name="attachment"
          type="file"
          required
          accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
          aria-invalid={Boolean(state?.fieldErrors?.attachment)}
          aria-describedby={state?.fieldErrors?.attachment ? "create-tx-attachment-error" : undefined}
          className="ui-input"
        />
        <p className="mt-1 text-xs text-slate-500">Required. JPEG, PNG, or PDF up to 10 MB.</p>
        {state?.fieldErrors?.attachment && <p id="create-tx-attachment-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.attachment[0]}</p>}
      </div>

      <div>
        <label htmlFor="create-tx-event" className="ui-label">Event / activity name</label>
        <input
          id="create-tx-event"
          name="eventActivityName"
          type="text"
          required
          maxLength={TRANSACTION_FIELD_LIMITS.eventActivityName}
          placeholder="Associated project, event, or activity"
          aria-invalid={Boolean(state?.fieldErrors?.eventActivityName)}
          aria-describedby={state?.fieldErrors?.eventActivityName ? "create-tx-event-error" : undefined}
          className="ui-input"
        />
        {state?.fieldErrors?.eventActivityName && <p id="create-tx-event-error" role="alert" className="mt-1 text-xs text-red-600">{state.fieldErrors.eventActivityName[0]}</p>}
      </div>

      <button
        type="submit" disabled={isPending}
        className="ui-button ui-button-primary"
      >
        {isPending ? "Recording..." : `Record ${activeType === TransactionType.INCOME ? "Income" : "Expense"}`}
      </button>
    </form>
  );
}
