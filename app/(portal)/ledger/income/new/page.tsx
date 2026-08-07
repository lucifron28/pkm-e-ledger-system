import { requireManagementUser } from "@/lib/auth/require-auth";
import { getActiveTermForCurrentUser } from "@/lib/data/terms";
import { listCategoriesForType } from "@/lib/data/transactions";
import { TransactionType } from "@prisma/client";
import { redirect } from "next/navigation";
import { CreateTransactionForm } from "../../create-transaction-form";
import Link from "next/link";

export default async function NewIncomePage() {
  const user = await requireManagementUser();
  if (!user.organizationId) redirect("/login");

  const activeTerm = await getActiveTermForCurrentUser();
  if (!activeTerm || !activeTerm.active) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Record New Income</h1>
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 text-sm text-amber-900">
          New entries may only be recorded in an active academic term.
        </div>
      </div>
    );
  }

  const [incomeCategories, expenseCategories] = await Promise.all([
    listCategoriesForType(TransactionType.INCOME),
    listCategoriesForType(TransactionType.EXPENSE),
  ]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Record New Income</h1>
          <p className="text-sm text-slate-600">{user.organizationName} - Active Term</p>
        </div>
        <Link href="/ledger" className="text-sm font-semibold text-[#004aad] hover:underline">
          Back to Ledger
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <CreateTransactionForm
          activeTermId={activeTerm.id}
          incomeCategories={incomeCategories}
          expenseCategories={expenseCategories}
          fixedType={TransactionType.INCOME}
        />
      </div>
    </div>
  );
}
