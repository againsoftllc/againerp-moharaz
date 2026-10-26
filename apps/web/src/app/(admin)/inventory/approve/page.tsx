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
import { ApprovalReviewHost } from "@/components/inventory/approval-document-host";
import { ApprovalDecisionDialog } from "@/components/inventory/approval-decision-dialog";
import type { ApprovalGridHandle } from "@/components/inventory/approval-grid";
import { approveRequest, cancelRequest, fetchApprovals, rejectRequest, type ApprovalRequest } from "@/lib/api/approvals";
import { notifyApprovalsChanged } from "@/lib/approvals/approval-pending";
import { useApprovalSummary } from "@/lib/approvals/use-approval-summary";
import { cn } from "@/lib/utils";

const ApprovalGrid = dynamic(() => import("@/components/inventory/approval-grid").then((module) => module.ApprovalGrid), {
  ssr: false,
  loading: () => <ListGridOpenFallback label="Opening approvals…" />,
});

const POLL_MS = 30_000;

/**
 * Inventory › Approve (docs/approval.md): the finalizing actions held for an approver, as the common datatable. Approve and
 * Reject are the first buttons of every row; a row (or its reference) opens the document in its ORIGINAL drawer to cross-check.
 */
export default function ApprovePage() {
  const gridRef = useRef<ApprovalGridHandle>(null);
  const { summary, refresh: refreshSummary } = useApprovalSummary();
  const [rows, setRows] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [filterCount, setFilterCount] = useState(0);
  // the request being cross-checked: its document opens in its own drawer
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  // the request a button in the list is working on, and the one being decided (a last look, and a reason for a reject)
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<{ mode: "approve" | "reject"; request: ApprovalRequest } | null>(null);

  // the whole recent queue; filtering and sorting are the grid's own. A refresh keeps the old rows on screen.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchApprovals({ status: "all", per_page: 200 });
        if (!cancelled) setRows(res.data);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Could not load the approvals");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // the queue is shared work: pick up what others did while this page stays open
  useEffect(() => {
    const timer = window.setInterval(() => setReload((n) => n + 1), POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const afterChange = useCallback(() => {
    notifyApprovalsChanged();
    setReload((n) => n + 1);
    void refreshSummary();
  }, [refreshSummary]);

  /** Approve = run the stored call now, as the approver. A call that fails stays pending and says why. */
  const decide = useCallback(
    async (note: string) => {
      if (!deciding) return;
      const { mode, request } = deciding;
      setBusyId(request.id);
      try {
        if (mode === "approve") {
          await approveRequest(request.id);
          toast.success(`${request.label}${request.reference ? ` ${request.reference}` : ""} approved and finalized`);
        } else {
          await rejectRequest(request.id, note.trim() || undefined);
          toast.success("Request rejected");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : mode === "approve" ? "Could not approve" : "Could not reject");
      } finally {
        setBusyId(null);
        setDeciding(null);
        afterChange();
      }
    },
    [deciding, afterChange],
  );

  const cancel = useCallback(
    async (row: ApprovalRequest) => {
      setBusyId(row.id);
      try {
        await cancelRequest(row.id);
        toast.success("Request cancelled");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not cancel");
      } finally {
        setBusyId(null);
        afterChange();
      }
    },
    [afterChange],
  );

  const headerLeftActions = (
    <ListGridHeaderStart title="Approve">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="relative h-[26px] w-[26px] shrink-0 rounded-none" aria-label="Settings">
            <Settings2 className="h-3.5 w-3.5" />
            {filterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {filterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem onClick={afterChange}>
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
      <ApprovalGrid
        ref={gridRef}
        rows={rows}
        summary={summary}
        loading={loading && rows.length === 0}
        busyId={busyId}
        onApprove={(row) => setDeciding({ mode: "approve", request: row })}
        onReject={(row) => setDeciding({ mode: "reject", request: row })}
        onCancel={(row) => void cancel(row)}
        headerLeftActions={headerLeftActions}
        onOpen={setSelected}
        onFilterCountChange={setFilterCount}
        className="min-h-0 flex-1"
      />
      <ApprovalReviewHost key={selected?.id ?? "none"} request={selected} onClose={() => setSelected(null)} onChanged={afterChange} />
      {deciding ? (
        <ApprovalDecisionDialog
          key={deciding.request.id + deciding.mode}
          mode={deciding.mode}
          request={deciding.request}
          busy={busyId === deciding.request.id}
          onClose={() => setDeciding(null)}
          onConfirm={(note) => void decide(note)}
        />
      ) : null}
    </div>
  );
}
