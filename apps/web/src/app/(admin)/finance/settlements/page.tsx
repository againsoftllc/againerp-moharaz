"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { SETTLEMENT_TITLE, SettlementDrawer } from "@/components/finance/settlement-drawer";
import type { SettlementGridHandle } from "@/components/finance/settlement-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { useApiHealth } from "@/lib/api/use-api-health";
import { fetchSettlements, type ApiSettlement, type SettlementPartyType } from "@/lib/api/finance-settlements";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { formatCurrency } from "@/lib/utils";

const SettlementGrid = dynamic(() => import("@/components/finance/settlement-grid").then((module) => module.SettlementGrid), {
  ssr: false,
  loading: () => <ListGridOpenFallback label="Opening settlements…" />,
});

/** Finance → Payments → Settlements: OnerERP Party Transaction Settlement (customers) and Payment Settlement (suppliers). */
export default function FinanceSettlementsPage() {
  return (
    <Suspense fallback={<ListGridOpenFallback label="Opening settlements…" />}>
      <FinanceSettlementsBody />
    </Suspense>
  );
}

function FinanceSettlementsBody() {
  const params = useSearchParams();
  const fixed = params.get("party") === "customer" || params.get("party") === "supplier" ? (params.get("party") as SettlementPartyType) : null;
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<SettlementGridHandle>(null);
  const [rows, setRows] = useState<ApiSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCount, setFilterCount] = useState(0);
  const [newFor, setNewFor] = useState<SettlementPartyType | null>(null);
  const [openRow, setOpenRow] = useState<ApiSettlement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await fetchSettlements({ party_type: fixed ?? undefined })).data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load settlements");
    } finally {
      setLoading(false);
    }
  }, [fixed]);

  useEffect(() => {
    void load();
  }, [load]);

  const headerLeftActions = (
    <ListGridHeaderStart title={fixed ? SETTLEMENT_TITLE[fixed] : "Settlements"}>
      {canWrite ? (
        fixed ? (
          <Button size="sm" className="rounded-none" onClick={() => setNewFor(fixed)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            New
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="rounded-none">
                <Plus className="mr-1 h-3.5 w-3.5" />
                New
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setNewFor("customer")}>Customer — {SETTLEMENT_TITLE.customer}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setNewFor("supplier")}>Supplier — {SETTLEMENT_TITLE.supplier}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      ) : null}
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
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <SettlementGrid
        ref={gridRef}
        rows={rows}
        loading={loading && rows.length === 0}
        headerLeftActions={headerLeftActions}
        onOpen={setOpenRow}
        onFilterCountChange={setFilterCount}
        footerLeftActions={(visible) => (
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${visible.length} shown · moved ${formatCurrency(visible.reduce((sum, r) => sum + Number(r.total), 0))}`}
          </span>
        )}
        className="min-h-0 flex-1"
      />
      <SettlementDrawer
        newFor={newFor}
        settlement={openRow}
        onOpenChange={(open) => {
          if (!open) {
            setNewFor(null);
            setOpenRow(null);
          }
        }}
        onCreated={(created) => {
          setNewFor(null);
          setOpenRow(created);
          void load();
        }}
      />
    </div>
  );
}
