"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApiHealthStatus } from "@/lib/api/use-api-health";
import { cn } from "@/lib/utils";

type Props = {
  status: ApiHealthStatus;
  loading?: boolean;
  onRefresh: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
};

const STATUS_TITLE: Record<ApiHealthStatus, string> = {
  checking: "Checking API and database…",
  connected: "API and database connected",
  partial: "API connected, database not connected",
  disconnected: "API and database not connected",
};

export function ApiRefreshButton({
  status,
  loading = false,
  onRefresh,
  disabled,
  className,
  label = "Refresh",
}: Props) {
  const spinning = loading || status === "checking";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onRefresh}
      disabled={disabled}
      aria-label={`${label} (API/DB ${status})`}
      title={STATUS_TITLE[status]}
      className={cn(
        "h-7 w-7 shrink-0 rounded-[3px]",
        status === "connected" &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-400",
        status === "partial" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-400",
        status === "disconnected" &&
          "border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/15 hover:text-red-700 dark:text-red-400",
        status === "checking" &&
          "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <RefreshCw className={cn("h-4 w-4", spinning && "animate-spin")} aria-hidden />
    </Button>
  );
}
