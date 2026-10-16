"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { RefreshCw } from "lucide-react";
import { type SubscriptionPlan, listPlans } from "@/lib/api/super-admin";
import { Button } from "@/components/ui/button";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import type { SubscriptionPlanGridHandle } from "@/components/super-admin/subscription-plan-grid";
import { cn } from "@/lib/utils";

const SubscriptionPlanGrid = dynamic(
  () => import("@/components/super-admin/subscription-plan-grid").then((m) => m.SubscriptionPlanGrid),
  { ssr: false, loading: () => <ListGridOpenFallback /> },
);

export default function SuperAdminPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gridRef = useRef<SubscriptionPlanGridHandle>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await listPlans());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const headerLeftActions = (
    <ListGridHeaderStart title="Plans">
      <Button size="sm" className="rounded-none" onClick={() => gridRef.current?.openCreate()}>
        New
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="relative h-[26px] w-[26px] shrink-0 rounded-none"
        aria-label="Refresh"
        onClick={() => void load()}
        disabled={loading}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
      </Button>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {error ? (
        <p className="shrink-0 border-b border-border px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <SubscriptionPlanGrid
        ref={gridRef}
        plans={plans}
        loading={loading}
        onChanged={() => void load()}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${plans.length} plan${plans.length === 1 ? "" : "s"}`}
          </span>
        }
        className="min-h-0 flex-1"
      />
    </div>
  );
}
