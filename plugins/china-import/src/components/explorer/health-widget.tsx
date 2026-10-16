"use client";

import type { ProviderHealth } from "../../core/types";
import { Card } from "../ui";
import { cn } from "../../utils";

export function ProviderHealthWidget({
  health,
  providerName,
}: {
  health: ProviderHealth | null;
  providerName: string;
}) {
  if (!health) {
    return (
      <Card className="p-4">
        <p className="text-xs font-medium text-foreground">Provider Health</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Run a connection test to populate health for {providerName}.
        </p>
      </Card>
    );
  }

  const items = [
    { label: "Connected", value: health.connected ? "Yes" : "No", ok: health.connected },
    { label: "Latency", value: `${health.latencyMs}ms` },
    { label: "API Version", value: health.apiVersion ?? "—" },
    {
      label: "Quota",
      value: health.quota
        ? `${health.quota.remaining ?? "?"} / ${health.quota.limit ?? "?"}`
        : "n/a",
    },
    { label: "Daily Requests", value: String(health.dailyRequests) },
    { label: "Failed Requests", value: String(health.failedRequests), ok: health.failedRequests === 0 },
  ];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">Provider Health · {providerName}</p>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            health.ok
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-destructive/15 text-destructive",
          )}
        >
          {health.ok ? "Healthy" : "Unhealthy"}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
            <p
              className={cn(
                "mt-1 text-sm font-semibold text-foreground",
                item.ok === false && "text-destructive",
                item.ok === true && "text-emerald-700 dark:text-emerald-300",
              )}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{health.message}</p>
    </Card>
  );
}
