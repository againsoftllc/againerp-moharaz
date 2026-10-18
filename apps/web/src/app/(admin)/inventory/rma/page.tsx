"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Filter, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
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
import type { RmaGridHandle } from "@/components/rma/rma-grid";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import {
  fetchRmaTickets,
  RMA_STATUS_LABEL,
  type RmaStatus,
  type RmaTicket,
} from "@/lib/api/rma";
import { isRmaStageId } from "@/lib/rma/stages";
import { cn } from "@/lib/utils";

const RmaGrid = dynamic(() => import("@/components/rma/rma-grid").then((m) => m.RmaGrid), {
  ssr: false,
  loading: () => <ListGridOpenFallback />,
});

function listTitle(status?: string | null, warranty?: string | null, rmaType?: string | null) {
  if (rmaType === "supplier") return "Supplier RMA";
  if (warranty === "in_warranty") return "Warranty claims";
  if (status && status in RMA_STATUS_LABEL) return RMA_STATUS_LABEL[status as RmaStatus];
  return "All RMA";
}

function RmaPageInner() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const status = searchParams.get("status");
  const warrantyStatus = searchParams.get("warranty_status");
  const rmaType = searchParams.get("rma_type");
  const claimId = searchParams.get("claim");
  const stageParam = searchParams.get("stage");
  const stage = isRmaStageId(stageParam) ? stageParam : null;
  const gridRef = useRef<RmaGridHandle>(null);
  const [tickets, setTickets] = useState<RmaTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCount, setFilterCount] = useState(0);

  const title = useMemo(
    () => listTitle(status, warrantyStatus, rmaType),
    [status, warrantyStatus, rmaType],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchRmaTickets({
        status: status ?? undefined,
        warrantyStatus: warrantyStatus ?? undefined,
        rmaType: rmaType ?? undefined,
      });
      setTickets(list.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load warranty claims");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [status, warrantyStatus, rmaType]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFilterCount = useCallback((count: number) => setFilterCount(count), []);

  const setClaimId = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id) next.set("claim", id);
      else next.delete("claim");
      const q = next.toString();
      router.replace(q ? `/inventory/rma?${q}` : "/inventory/rma", { scroll: false });
    },
    [router, searchParams],
  );

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title={title}>
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={() => gridRef.current?.openIntake()}>
          New
        </Button>
      ) : null}
      <Button variant="outline" size="sm" className="rounded-none" onClick={() => router.push("/inventory/rma/dashboard")}>
        Dashboard
      </Button>
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
            <Filter className="mr-1.5 h-3 w-3" /> Filters
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openColumns()}>
            <SlidersHorizontal className="mr-1.5 h-3 w-3" /> Columns
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => gridRef.current?.resetFilters()}>
            Reset filters
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <RmaGrid
      ref={gridRef}
      tickets={tickets}
      loading={loading && tickets.length === 0}
      claimId={claimId}
      initialStage={stage}
      onOpenClaim={(id) => setClaimId(id)}
      onCloseClaim={() => setClaimId(null)}
      onChanged={load}
      onFilterCountChange={handleFilterCount}
      headerLeftActions={headerLeftActions}
      className="min-h-0 flex-1"
    />
  );
}

export default function RmaPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ListGridOpenFallback />}>
        <RmaPageInner />
      </Suspense>
    </div>
  );
}
