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
import { useApiHealth } from "@/lib/api/use-api-health";
import { fetchFinanceCheques, fetchFinancePayments, type ApiFinanceCheque, type ApiFinancePayment } from "@/lib/api/finance";
import { ChequeDetailDrawer } from "@/components/finance/cheque-detail-drawer";
import { ChequeFormDrawer } from "@/components/finance/cheque-form-drawer";
import type { PaymentGridHandle } from "@/components/finance/payment-grid";
import { cn, formatMoney } from "@/lib/utils";

const PaymentGrid = dynamic(
  () => import("@/components/finance/payment-grid").then((module) => module.PaymentGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening payments…" />,
  },
);

const ChequeGrid = dynamic(
  () => import("@/components/finance/cheque-grid").then((module) => module.ChequeGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening cheques…" />,
  },
);

type Tab = "payments" | "cheques";

function TabSwitch({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
  return (
    <div className="flex h-[26px] shrink-0 items-center border border-input" role="tablist">
      {(["payments", "cheques"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          onClick={() => onChange(tab)}
          className={cn(
            "h-full px-2 text-xs capitalize",
            value === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function money(value: number) {
  return formatMoney(value);
}

export default function FinancePaymentsPage() {
  const apiHealth = useApiHealth();
  const gridRef = useRef<PaymentGridHandle>(null);
  const [rows, setRows] = useState<ApiFinancePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCount, setFilterCount] = useState(0);
  const [tab, setTab] = useState<Tab>("payments");
  const [cheques, setCheques] = useState<ApiFinanceCheque[]>([]);
  const [chequesLoading, setChequesLoading] = useState(false);
  const [chequeFormOpen, setChequeFormOpen] = useState(false);
  const [chequeId, setChequeId] = useState<string | null>(null);

  const loadCheques = useCallback(async () => {
    setChequesLoading(true);
    try {
      setCheques((await fetchFinanceCheques({ limit: 500 })).data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load cheques");
    } finally {
      setChequesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "cheques") void loadCheques();
  }, [tab, loadCheques]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFinancePayments({ limit: 500 });
      setRows(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "finance-payments-api" });
  }, [error]);

  const inbound = rows.reduce((sum, r) => sum + (r.direction === "inbound" ? Number(r.amount) : 0), 0);
  const outbound = rows.reduce((sum, r) => sum + (r.direction === "outbound" ? Number(r.amount) : 0), 0);

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Payments">
      <TabSwitch value={tab} onChange={setTab} />
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

  if (tab === "cheques") {
    const chequeHeader = (
      <ListGridHeaderStart title="Payments">
        <TabSwitch value={tab} onChange={setTab} />
        <Button size="sm" className="rounded-none" onClick={() => setChequeFormOpen(true)}>
          New cheque
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-[26px] w-[26px] shrink-0 rounded-none"
          aria-label="Refresh cheques"
          onClick={() => void loadCheques()}
          disabled={chequesLoading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", chequesLoading && "animate-spin")} />
        </Button>
      </ListGridHeaderStart>
    );
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <ChequeGrid
          rows={cheques}
          loading={chequesLoading && cheques.length === 0}
          headerLeftActions={chequeHeader}
          onOpen={(row) => setChequeId(row.id)}
          footerLeftActions={(visible) => (
            <span className="px-2 text-[10px] text-muted-foreground">{visible.length} shown</span>
          )}
          className="min-h-0 flex-1"
        />
        <ChequeFormDrawer
          open={chequeFormOpen}
          onOpenChange={setChequeFormOpen}
          onCreated={(created) => {
            void loadCheques();
            setChequeId(created.id);
          }}
        />
        <ChequeDetailDrawer
          chequeId={chequeId}
          onOpenChange={(next) => {
            if (!next) setChequeId(null);
          }}
          onChanged={() => {
            void loadCheques();
            void load();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <PaymentGrid
        ref={gridRef}
        rows={rows}
        loading={loading && rows.length === 0}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading
              ? "Loading…"
              : `${rows.length} shown · In ${money(inbound)} · Out ${money(outbound)}`}
          </span>
        }
        className="min-h-0 flex-1"
      />
    </div>
  );
}
