"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Filter, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { SettlePaymentDrawer, type SettleTarget } from "@/components/finance/settle-payment-drawer";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useApiHealth } from "@/lib/api/use-api-health";
import {
  fetchFinanceReceivables,
  fetchPaymentAccounts,
  settleReceivable,
  type ApiFinancePaymentAccount,
  type ApiFinanceReceivable,
} from "@/lib/api/finance";
import type { ReceivableGridHandle } from "@/components/finance/receivable-grid";
import { cn, formatMoney } from "@/lib/utils";

const ReceivableGrid = dynamic(
  () => import("@/components/finance/receivable-grid").then((module) => module.ReceivableGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening receivables…" />,
  },
);

function money(value: number) {
  return formatMoney(value);
}

export default function FinanceReceivablesPage() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<ReceivableGridHandle>(null);
  const [rows, setRows] = useState<ApiFinanceReceivable[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<ApiFinancePaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCount, setFilterCount] = useState(0);
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, accountsRes] = await Promise.all([
        fetchFinanceReceivables({ limit: 500 }),
        fetchPaymentAccounts(),
      ]);
      setRows(res.data);
      setPaymentAccounts(accountsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load receivables");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "finance-receivables-api" });
  }, [error]);

  const outstanding = rows.reduce((sum, r) => sum + Number(r.balance), 0);

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Receivables">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "relative h-[26px] w-[26px] shrink-0 rounded-none",
              apiHealth.status === "connected" &&
                "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
              apiHealth.status === "partial" &&
                "border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400",
              apiHealth.status === "disconnected" &&
                "border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400",
              apiHealth.status === "checking" && "text-muted-foreground",
            )}
            aria-label={`Settings (${healthTitle})`}
            title={healthTitle}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {filterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {filterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem
            onClick={() => {
              void load();
              apiHealth.recheck();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {filterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">{filterCount}</span>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openColumns()}>
            <SlidersHorizontal className="mr-1.5 h-3 w-3" />
            Columns
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => gridRef.current?.exportCsv()}>
            <Download className="mr-1.5 h-3 w-3" />
            Export
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.resetFilters()}>Reset filters</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <ReceivableGrid
        ref={gridRef}
        rows={rows}
        loading={loading && rows.length === 0}
        onSettle={(row) =>
          setSettleTarget({
            id: row.id,
            label: row.invoice_number,
            counterpartyName: row.customer_name ?? row.customer_id,
            balance: row.balance,
          })
        }
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading
              ? "Loading…"
              : `${rows.length} shown · Outstanding ${money(outstanding)}`}
          </span>
        }
        className="min-h-0 flex-1"
      />

      {canWrite && (
        <SettlePaymentDrawer
          open={settleTarget !== null}
          onOpenChange={(open) => {
            if (!open) setSettleTarget(null);
          }}
          target={settleTarget}
          paymentAccounts={paymentAccounts}
          onSettle={async (id, input) => {
            await settleReceivable(id, input);
            await load();
          }}
        />
      )}
    </div>
  );
}
