"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";
import {
  fetchAgainDropApiPlugin,
  installAgainDropApiPlugin,
  testAgainDropApiPlugin,
  type AgainDropApiPluginRecord,
  type AgainDropApiTestResult,
} from "@/lib/api/again-drop-api-plugin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

/** Re-fetch hook so the workspace form can refresh this panel after saving. */
export const AGAIN_DROP_API_REFRESH_EVENT = "again-drop-api:refresh";

export function AgainDropApiPanel() {
  const [record, setRecord] = useState<AgainDropApiPluginRecord | null>(null);
  const [booting, setBooting] = useState(true);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<AgainDropApiTestResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setBooting(true);
      try {
        let row = await fetchAgainDropApiPlugin();
        if (cancelled) return;
        if (!row.installed) {
          row = await installAgainDropApiPlugin();
          if (cancelled) return;
        }
        setRecord(row);

        const { result: test, plugin } = await testAgainDropApiPlugin();
        if (cancelled) return;
        setRecord(plugin);
        setResult(test);
        if (test.ok) toast.success("AgainDrop API connected");
        else toast.error(test.message);
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to load AgainDrop API plugin";
          setResult({ ok: false, message, latency_ms: 0, via: "server", sample_count: 0 });
          toast.error(message);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    void boot();

    const refresh = () => {
      void fetchAgainDropApiPlugin()
        .then((row) => {
          if (!cancelled) setRecord(row);
        })
        .catch(() => undefined);
    };
    window.addEventListener(AGAIN_DROP_API_REFRESH_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(AGAIN_DROP_API_REFRESH_EVENT, refresh);
    };
  }, []);

  const handleTest = async () => {
    setTesting(true);
    try {
      const { result: test, plugin } = await testAgainDropApiPlugin();
      setRecord(plugin);
      setResult(test);
      if (test.ok) toast.success(`Connected (${test.latency_ms}ms)`);
      else toast.error(test.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection test failed";
      setResult({ ok: false, message, latency_ms: 0, via: "server", sample_count: 0 });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const usingServerKey = record ? record.use_server_key || !record.api_key_set : true;
  const connected = result ? result.ok : record?.connection_status === "connected";

  return (
    <div className="rounded-xl border border-input bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">AgainDrop API status</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Configuration is saved in the database.{" "}
            {usingServerKey
              ? "Currently using the server key. Enter a custom API Key below and Save to override."
              : "Currently using the custom API key saved in this plugin."}
          </p>
        </div>
        <Badge variant={connected ? "success" : "muted"}>
          {booting ? "Connecting…" : connected ? "Connected" : "Not connected"}
        </Badge>
      </div>

      <dl className="mt-4 grid gap-2 text-[12px] sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Credentials</dt>
          <dd className="font-medium text-foreground">
            {usingServerKey
              ? "Server AgainDrop API key"
              : `Custom plugin key ${record?.api_key_hint ?? ""}`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Environment</dt>
          <dd className="font-medium capitalize text-foreground">
            {record?.environment ?? "sandbox"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Marketplace</dt>
          <dd className="font-medium capitalize text-foreground">
            {record?.default_platform ?? "taobao"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last verified</dt>
          <dd className="font-medium text-foreground">
            {formatDateTime(record?.verified_at)}
          </dd>
        </div>
      </dl>

      {result ? (
        <p
          className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
          }`}
        >
          {result.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
          <span>
            {result.ok ? "Connected" : "Failed"} — {result.message}
            {result.latency_ms ? ` · ${result.latency_ms}ms` : ""}
            {` · via ${result.via === "plugin" ? "custom key" : "server key"}`}
          </span>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void handleTest()} disabled={testing || booting}>
          {testing || booting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlugZap className="mr-1.5 h-3.5 w-3.5" />
          )}
          {booting ? "Connecting…" : testing ? "Testing…" : "Test connection"}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/dropshipping/import">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Open import
          </Link>
        </Button>
      </div>
    </div>
  );
}
