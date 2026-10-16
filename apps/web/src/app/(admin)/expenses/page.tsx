"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExpenseDrawer } from "@/components/expenses/expense-drawer";
import { ExpenseCategoryDrawer } from "@/components/expenses/expense-category-drawer";
import { PayExpenseDialog } from "@/components/expenses/pay-expense-dialog";
import { FinanceStatBar } from "@/components/finance/finance-stat-bar";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useApiHealth } from "@/lib/api/use-api-health";
import { fetchPaymentAccounts, fetchFinanceAccounts, type ApiFinanceAccount, type ApiFinancePaymentAccount } from "@/lib/api/finance";
import {
  fetchAllocationRules,
  type ApiAllocationRule,
} from "@/lib/api/finance-allocation";
import {
  approveExpense,
  createExpense,
  createExpenseCategory,
  deactivateExpenseCategory,
  deleteExpense,
  fetchExpenseCategories,
  fetchExpenseSummary,
  fetchExpenses,
  payExpense,
  rejectExpense,
  updateExpense,
  type ApiExpense,
  type ApiExpenseCategory,
  type ApiExpenseSummary,
} from "@/lib/api/expenses";
import type { ExpenseGridHandle } from "@/components/expenses/expense-grid";
import { formatMoney } from "@/lib/utils";

const ExpenseGrid = dynamic(
  () => import("@/components/expenses/expense-grid").then((module) => module.ExpenseGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening expenses…" />,
  },
);

type DrawerState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; expense: ApiExpense };

export default function ExpensesPage() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<ExpenseGridHandle>(null);
  const [expenses, setExpenses] = useState<ApiExpense[]>([]);
  const [categories, setCategories] = useState<ApiExpenseCategory[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<ApiFinancePaymentAccount[]>([]);
  const [glAccounts, setGlAccounts] = useState<ApiFinanceAccount[]>([]);
  const [allocationRules, setAllocationRules] = useState<ApiAllocationRule[]>([]);
  const [summary, setSummary] = useState<ApiExpenseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCount, setFilterCount] = useState(0);
  const [drawer, setDrawer] = useState<DrawerState>({ mode: "closed" });
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<ApiExpense | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [expensesRes, categoriesRes, summaryRes, paymentAccountsRes, glRes, rulesRes] = await Promise.all([
        fetchExpenses({ limit: 1000 }),
        fetchExpenseCategories(),
        fetchExpenseSummary(),
        fetchPaymentAccounts(),
        fetchFinanceAccounts(),
        fetchAllocationRules(),
      ]);
      setExpenses(expensesRes.data);
      setCategories(categoriesRes.data);
      setSummary(summaryRes.data);
      setPaymentAccounts(paymentAccountsRes.data);
      setGlAccounts(glRes.data);
      setAllocationRules(rulesRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "expenses-api" });
  }, [error]);

  async function refreshCategories() {
    const res = await fetchExpenseCategories();
    setCategories(res.data);
  }

  const stats = summary
    ? [
        { label: "This month", value: formatMoney(summary.month_total) },
        {
          label: "Paid this month",
          value: formatMoney(summary.month_paid_total),
          tone: "good" as const,
        },
        {
          label: "Pending",
          value: `${summary.pending_count} · ${formatMoney(summary.pending_amount)}`,
          tone: summary.pending_count > 0 ? ("warn" as const) : ("default" as const),
        },
        { label: "Categories", value: String(categories.length) },
      ]
    : [];

  const headerLeftActions = (
    <ListGridHeaderStart title="Expenses">
      <FinanceGridSettingsMenu
        apiHealth={apiHealth}
        loading={loading}
        filterCount={filterCount}
        onRefresh={() => {
          void load();
          apiHealth.recheck();
        }}
        onFilters={() => gridRef.current?.openFilters()}
        onColumns={() => gridRef.current?.openColumns()}
        onExport={() => gridRef.current?.exportCsv()}
        onResetFilters={() => gridRef.current?.resetFilters()}
      />
      {canWrite ? (
        <>
          <Button size="sm" className="h-[26px] rounded-none" onClick={() => setDrawer({ mode: "create" })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-[26px] rounded-none"
            onClick={() => setCategoryDrawerOpen(true)}
          >
            <Tags className="mr-1.5 h-3.5 w-3.5" />
            Categories
          </Button>
        </>
      ) : null}
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <ExpenseGrid
        ref={gridRef}
        rows={expenses}
        categories={categories}
        loading={loading && expenses.length === 0}
        canEdit={canWrite}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        summary={summary ? <FinanceStatBar stats={stats} /> : undefined}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${expenses.length} expenses`}
          </span>
        }
        onRowClick={(expense) => setDrawer({ mode: "edit", expense })}
        onApprove={async (id) => {
          const updated = await approveExpense(id);
          setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
          setSummary((await fetchExpenseSummary()).data);
        }}
        onReject={async (id) => {
          const updated = await rejectExpense(id);
          setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
          setSummary((await fetchExpenseSummary()).data);
        }}
        onPayClick={(expense) => setPayTarget(expense)}
        onDelete={async (id) => {
          await deleteExpense(id);
          setExpenses((prev) => prev.filter((e) => e.id !== id));
          setSummary((await fetchExpenseSummary()).data);
        }}
      />

      <ExpenseDrawer
        open={drawer.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDrawer({ mode: "closed" });
        }}
        categories={categories}
        paymentAccounts={paymentAccounts}
        glAccounts={glAccounts}
        allocationRules={allocationRules}
        expense={drawer.mode === "edit" ? drawer.expense : null}
        canWrite={canWrite}
        onCreate={async (input) => {
          const created = await createExpense(input);
          setExpenses((prev) => [created, ...prev]);
          setSummary((await fetchExpenseSummary()).data);
        }}
        onSave={async (id, patch) => {
          const updated = await updateExpense(id, patch);
          setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
          setSummary((await fetchExpenseSummary()).data);
        }}
      />

      <ExpenseCategoryDrawer
        open={categoryDrawerOpen}
        onOpenChange={setCategoryDrawerOpen}
        categories={categories}
        onCreate={async (name) => {
          await createExpenseCategory(name);
          await refreshCategories();
        }}
        onDeactivate={async (id) => {
          await deactivateExpenseCategory(id);
          await refreshCategories();
        }}
      />

      <PayExpenseDialog
        open={payTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPayTarget(null);
        }}
        expense={payTarget}
        paymentAccounts={paymentAccounts}
        onPay={async (id, input) => {
          const updated = await payExpense(id, input);
          setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
          setSummary((await fetchExpenseSummary()).data);
          setPaymentAccounts((await fetchPaymentAccounts()).data);
        }}
      />
    </div>
  );
}
