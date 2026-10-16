"use client";

import { useEffect, useState } from "react";
import { Database, Wifi, WifiOff } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type HealthPayload = {
  status: string;
  database?: { ok?: boolean; version?: string };
};

type Props = {
  loading?: boolean;
  error?: string | null;
  productCount?: number;
};

export function ApiConnectionBadge({ loading, error, productCount }: Props) {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    fetch(`${getApiBaseUrl()}/health`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Health check failed"))))
      .then((data: HealthPayload) => {
        if (!cancelled) setHealth(data);
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, error, productCount]);

  const dbOk = health?.database?.ok === true;
  const connected = !error && !checking && dbOk;

  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1 text-xs",
        connected
          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
          : "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-400",
      )}
    >
      {connected ? (
        <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      <span className="font-medium">
        {checking || loading
          ? "Connecting to API…"
          : connected
            ? "Live · PostgreSQL"
            : "API / DB disconnected"}
      </span>
      {connected && typeof productCount === "number" && (
        <span className="text-muted-foreground">· {productCount} from database</span>
      )}
      {connected && health?.database?.version && (
        <span className="hidden items-center gap-1 text-muted-foreground sm:inline-flex">
          <Database className="h-3 w-3" aria-hidden />
          {health.database.version.split(" on ")[0]}
        </span>
      )}
    </div>
  );
}
