"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import {
  fetchPaymentAccounts,
  fetchFinanceAccounts,
  type ApiFinanceAccount,
  type ApiFinancePaymentAccount,
} from "@/lib/api/finance";
import { fetchAllocationRules, type ApiAllocationRule } from "@/lib/api/finance-allocation";
import {
  createExpense,
  fetchExpenseCategories,
  fetchExpenses,
  updateExpense,
  type ApiExpense,
  type ApiExpenseCategory,
} from "@/lib/api/expenses";
import { cn, formatMoney } from "@/lib/utils";

const ExpenseDrawer = dynamic(
  () => import("@/components/expenses/expense-drawer").then((m) => m.ExpenseDrawer),
  { ssr: false },
);

const STATUS_TONE: Record<string, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  approved: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

/**
 * Same "Expense" tab reused by Customer, Supplier, and Vendor detail views —
 * lists finance_expenses linked to this record's party_id, with a "+ New"
 * that pre-links the new expense to the same party.
 */
export function PartyExpenseTab({
  partyId,
  partyName,
}: {
  partyId?: string | null;
  partyName?: string;
}) {
  const canWrite = useAdminCanWrite();
  const [expenses, setExpenses] = useState<ApiExpense[]>([]);
  const [categories, setCategories] = useState<ApiExpenseCategory[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<ApiFinancePaymentAccount[]>([]);
  const [glAccounts, setGlAccounts] = useState<ApiFinanceAccount[]>([]);
  const [allocationRules, setAllocationRules] = useState<ApiAllocationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ApiExpense | null>(null);

  const load = useCallback(async () => {
    if (!partyId) {
      setExpenses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [expensesRes, categoriesRes, paymentAccountsRes, glRes, rulesRes] = await Promise.all([
        fetchExpenses({ party_id: partyId, limit: 200 }),
        fetchExpenseCategories(),
        fetchPaymentAccounts(),
        fetchFinanceAccounts(),
        fetchAllocationRules(),
      ]);
      setExpenses(expensesRes.data);
      setCategories(categoriesRes.data);
      setPaymentAccounts(paymentAccountsRes.data);
      setGlAccounts(glRes.data);
      setAllocationRules(rulesRes.data);
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!partyId) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        Save this record first — expenses can be linked once it exists.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {loading ? "Loading…" : `${expenses.length} expense${expenses.length === 1 ? "" : "s"}`}
        </p>
        {canWrite ? (
          <Button
            size="sm"
            className="h-7 rounded-none text-xs"
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            <Plus className="mr-1 h-3 w-3" /> New
          </Button>
        ) : null}
      </div>

      {expenses.length === 0 && !loading ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No expenses linked yet.</p>
      ) : (
        <div className="border border-border">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">Expense</th>
                <th className="px-3 py-1.5 font-medium">Category</th>
                <th className="px-3 py-1.5 font-medium">Date</th>
                <th className="px-3 py-1.5 text-right font-medium">Total</th>
                <th className="px-3 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr
                  key={e.id}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/40"
                  onClick={() => {
                    setEditing(e);
                    setDrawerOpen(true);
                  }}
                >
                  <td className="px-3 py-1.5 font-mono text-[11px]">{e.expense_number}</td>
                  <td className="px-3 py-1.5">{e.category_name ?? "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{e.expense_date}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(e.total)}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant="outline" className={cn("rounded-none text-[10px]", STATUS_TONE[e.status])}>
                      {e.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ExpenseDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        categories={categories}
        paymentAccounts={paymentAccounts}
        glAccounts={glAccounts}
        allocationRules={allocationRules}
        expense={editing}
        canWrite={canWrite}
        initialPartyId={partyId}
        initialPartyLabel={partyName ?? null}
        onCreate={async (input) => {
          const created = await createExpense(input);
          setExpenses((prev) => [created, ...prev]);
        }}
        onSave={async (id, patch) => {
          const updated = await updateExpense(id, patch);
          setExpenses((prev) => prev.map((row) => (row.id === id ? updated : row)));
        }}
      />
    </div>
  );
}
