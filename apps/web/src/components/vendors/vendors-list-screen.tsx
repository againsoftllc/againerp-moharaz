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
import type { VendorGridHandle } from "@/components/vendors/vendor-grid";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import {
  fetchVendorGroups,
  fetchVendorTypes,
  fetchVendors,
  type Vendor,
  type VendorGroup,
  type VendorType,
} from "@/lib/api/vendors";
import { cn } from "@/lib/utils";

const VendorGrid = dynamic(() => import("@/components/vendors/vendor-grid").then((m) => m.VendorGrid), {
  ssr: false,
  loading: () => <ListGridOpenFallback label="Opening vendors…" />,
});

const PAGE = 200;
const MAX_ROWS = 5000;

/** The list endpoint caps at 200 per call — page through so the grid filters the whole book client-side. */
async function fetchAllVendors(): Promise<Vendor[]> {
  const out: Vendor[] = [];
  let offset = 0;
  for (;;) {
    const res = await fetchVendors({ limit: PAGE, offset, include_archived: true });
    out.push(...res.data);
    offset += res.data.length;
    if (res.data.length < PAGE || offset >= res.total || offset >= MAX_ROWS) break;
  }
  return out;
}

/** Canonical Vendors list screen, rendered at /vendors (chrome switches via ?from=party). */
export function VendorsListScreen() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<VendorGridHandle>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorTypes, setVendorTypes] = useState<VendorType[]>([]);
  const [vendorGroups, setVendorGroups] = useState<VendorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCount, setFilterCount] = useState(0);
  const handleFilterCount = useCallback((count: number) => setFilterCount(count), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, types, groups] = await Promise.all([fetchAllVendors(), fetchVendorTypes(), fetchVendorGroups()]);
      setVendors(rows);
      setVendorTypes(types);
      setVendorGroups(groups);
    } catch (err) {
      toast.error(`API: ${err instanceof Error ? err.message : "Failed to load vendors"}`, { id: "vendors-api" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer the first fetch a tick so the loading flag is not set synchronously inside the effect.
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Vendors">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={() => gridRef.current?.openCreate()}>
          New
        </Button>
      ) : null}
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
            {filterCount > 0 ? (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {filterCount}
              </span>
            ) : null}
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
            {filterCount > 0 ? <span className="ml-auto text-[10px] text-muted-foreground">{filterCount}</span> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openColumns()}>
            <SlidersHorizontal className="mr-1.5 h-3 w-3" />
            Columns
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => gridRef.current?.exportCsv()}>
            <Download className="mr-1.5 h-3.5 w-3" />
            Export
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.resetFilters()}>Reset filters</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  const active = vendors.filter((v) => v.status === "active").length;
  const portal = vendors.filter((v) => v.portal_enabled).length;

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <VendorGrid
        ref={gridRef}
        vendors={vendors}
        vendorTypes={vendorTypes}
        vendorGroups={vendorGroups}
        loading={loading}
        onChanged={() => void load()}
        onFilterCountChange={handleFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${vendors.length} vendor${vendors.length === 1 ? "" : "s"} · ${active} active · ${portal} on portal`}
          </span>
        }
        className="min-h-0 flex-1"
      />
    </div>
  );
}
