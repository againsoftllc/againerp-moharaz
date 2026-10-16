"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
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
import { ServiceJobDrawer } from "@/components/service/service-job-drawer";
import { ServiceJobWorkspace } from "@/components/service/service-job-workspace";
import type { ServiceJobGridHandle } from "@/components/rma/service-job-grid";
import {
  billServiceJob,
  completeServiceJob,
  fetchServiceJobs,
  type ServiceJob,
} from "@/lib/api/service-jobs";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useApiHealth } from "@/lib/api/use-api-health";
import { cn } from "@/lib/utils";

const ServiceJobGrid = dynamic(
  () => import("@/components/rma/service-job-grid").then((m) => m.ServiceJobGrid),
  { ssr: false, loading: () => <ListGridOpenFallback /> },
);

function ServiceJobsInner() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job");
  const status = searchParams.get("status");
  const gridRef = useRef<ServiceJobGridHandle>(null);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCount, setFilterCount] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchServiceJobs({ status: status ?? undefined });
      setJobs(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load service jobs");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const openJob = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("job", id);
    router.push(`/service/jobs?${params}`);
  };

  const closeJob = (open: boolean) => {
    if (open) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("job");
    const qs = params.toString();
    router.push(qs ? `/service/jobs?${qs}` : "/service/jobs");
  };

  const complete = async (id: string) => {
    try {
      await completeServiceJob(id);
      toast.success("Service job completed");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete the job");
    }
  };

  const bill = async (id: string) => {
    try {
      await billServiceJob(id);
      toast.success("Service invoice raised");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not raise the bill");
    }
  };

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Job cards">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={() => setCreateOpen(true)}>
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
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <ServiceJobGrid
        ref={gridRef}
        jobs={jobs}
        loading={loading && jobs.length === 0}
        onComplete={complete}
        onBill={bill}
        onOpenJob={openJob}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        className="min-h-0 flex-1"
      />
      <ServiceJobDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          void load();
          openJob(id);
        }}
      />
      <ServiceJobWorkspace
        jobId={jobId}
        open={Boolean(jobId)}
        onOpenChange={closeJob}
        onChanged={() => void load()}
        canWrite={canWrite}
      />
    </div>
  );
}

export default function ServiceJobsPage() {
  return (
    <Suspense fallback={<ListGridOpenFallback />}>
      <ServiceJobsInner />
    </Suspense>
  );
}
