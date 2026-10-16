"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProviderConfig, ProviderHealth, ProviderId, ProviderMeta } from "../../core/types";
import { bootstrapProviderEngine, providerManager } from "../../core";
import {
  EXPLORER_CATEGORIES,
  EXPLORER_ENDPOINTS,
  defaultFieldValues,
  type ExplorerCategoryId,
  type ExplorerEndpointDef,
} from "../../explorer/catalog";
import {
  clearExplorerHistory,
  executeExplorerRequest,
  getExplorerHistory,
  rememberExplorerValues,
  type ExplorerExecutionResult,
  type ExplorerFieldValues,
  type ExplorerHistoryEntry,
} from "../../explorer/executor";
import { RequestBuilder } from "../../components/explorer/request-builder";
import { ExplorerJsonViewer, ErrorViewer } from "../../components/explorer/json-viewer";
import { ProviderHealthWidget } from "../../components/explorer/health-widget";
import { Card, StateBlock, buttonClassName, inputClassName } from "../../components";
import { cn, prettyJson } from "../../utils";

const DEBUG_KEY = "againerp.plugin.china-import.debug";

export function ApiExplorerPage({
  config,
  activeProviderId,
  providers,
  onProviderChange,
  debugMode = false,
}: {
  config: ProviderConfig;
  activeProviderId: ProviderId;
  providers: ProviderMeta[];
  onProviderChange: (id: ProviderId) => void;
  debugMode?: boolean;
}) {
  const [category, setCategory] = useState<ExplorerCategoryId>("authentication");
  const [endpointId, setEndpointId] = useState(EXPLORER_ENDPOINTS[0].id);
  const endpoint = useMemo(
    () => EXPLORER_ENDPOINTS.find((e) => e.id === endpointId) ?? EXPLORER_ENDPOINTS[0],
    [endpointId],
  );
  const [values, setValues] = useState<ExplorerFieldValues>(() => defaultFieldValues(endpoint));
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ExplorerExecutionResult | null>(null);
  const [history, setHistory] = useState<ExplorerHistoryEntry[]>([]);
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [debug, setDebug] = useState(debugMode);
  const [sidebarWidth, setSidebarWidth] = useState(240);

  useEffect(() => {
    bootstrapProviderEngine();
    setHistory(getExplorerHistory());
    try {
      setDebug(debugMode || window.localStorage.getItem(DEBUG_KEY) === "1");
    } catch {
      setDebug(debugMode);
    }
  }, [debugMode]);

  useEffect(() => {
    setValues(defaultFieldValues(endpoint));
    setResult(null);
  }, [endpoint]);

  const endpoints = EXPLORER_ENDPOINTS.filter((e) => e.category === category);
  const activeMeta = providers.find((p) => p.id === activeProviderId);

  async function run(endpointDef: ExplorerEndpointDef, fieldValues: ExplorerFieldValues) {
    setExecuting(true);
    rememberExplorerValues(endpointDef.id, fieldValues);
    try {
      const provider = await providerManager.activate(activeProviderId, config);
      const exec = await executeExplorerRequest({
        endpoint: endpointDef,
        values: fieldValues,
        provider,
        providerId: activeProviderId,
        config,
      });
      setResult(exec);
      setHistory(getExplorerHistory());
      if (endpointDef.id === "auth.testConnection" || endpointDef.id === "auth.health" || endpointDef.id === "utilities.ping") {
        if (exec.response && typeof exec.response === "object" && "ok" in (exec.response as object)) {
          setHealth(exec.response as ProviderHealth);
        }
      }
    } finally {
      setExecuting(false);
    }
  }

  function onReplay(entry: ExplorerHistoryEntry) {
    const ep = EXPLORER_ENDPOINTS.find((e) => e.id === entry.endpointId);
    if (!ep) return;
    setCategory(ep.category);
    setEndpointId(ep.id);
    setValues({ ...defaultFieldValues(ep), ...entry.values });
    void run(ep, { ...defaultFieldValues(ep), ...entry.values });
  }

  return (
    <div className="space-y-4">
      <ProviderHealthWidget health={health} providerName={activeMeta?.name ?? activeProviderId} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">Active provider</label>
        <select
          className={inputClassName("h-8 w-auto")}
          value={activeProviderId}
          onChange={(e) => onProviderChange(e.target.value as ProviderId)}
        >
          {providers
            .filter((p) => p.implemented)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <label className="ml-auto flex items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={debug}
            onChange={(e) => {
              setDebug(e.target.checked);
              try {
                window.localStorage.setItem(DEBUG_KEY, e.target.checked ? "1" : "0");
              } catch {
                /* ignore */
              }
            }}
          />
          Debug mode
        </label>
      </div>

      <div className="flex min-h-[32rem] flex-col gap-3 lg:flex-row">
        {/* Sidebar */}
        <aside
          className="shrink-0 rounded-xl border border-border bg-card"
          style={{ width: sidebarWidth }}
        >
          <div className="border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
            API Explorer
          </div>
          <div className="space-y-3 p-2">
            {EXPLORER_CATEGORIES.map((cat) => (
              <div key={cat.id}>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left text-xs font-medium",
                    category === cat.id
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted/50",
                  )}
                  onClick={() => {
                    setCategory(cat.id);
                    const first = EXPLORER_ENDPOINTS.find((e) => e.category === cat.id);
                    if (first) setEndpointId(first.id);
                  }}
                >
                  {cat.label}
                </button>
                {category === cat.id ? (
                  <div className="mt-1 space-y-0.5 pl-2">
                    {endpoints.map((ep) => (
                      <button
                        key={ep.id}
                        type="button"
                        className={cn(
                          "w-full rounded-md px-2 py-1 text-left text-[11px]",
                          endpointId === ep.id
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/40",
                        )}
                        onClick={() => setEndpointId(ep.id)}
                      >
                        {ep.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="border-t border-border p-2">
            <label className="text-[10px] text-muted-foreground">Sidebar width</label>
            <input
              type="range"
              min={180}
              max={340}
              value={sidebarWidth}
              onChange={(e) => setSidebarWidth(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </aside>

        {/* Main split */}
        <div className="min-w-0 flex-1 space-y-3">
          <RequestBuilder
            endpoint={endpoint}
            values={values}
            onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
            onExecute={() => void run(endpoint, values)}
            executing={executing}
          />

          {executing ? (
            <StateBlock title="Executing…" description="Waiting for provider response" />
          ) : null}

          {!executing && !result ? (
            <StateBlock
              title="No response yet"
              description="Fill the request form and click Execute Request."
            />
          ) : null}

          {result ? (
            <div className="space-y-3">
              <Card className="p-3">
                <div className="grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                  <Meta label="URL" value={result.request.url} />
                  <Meta label="Method" value={result.request.method} />
                  <Meta label="Status" value={String(result.status)} />
                  <Meta label="Duration" value={`${result.durationMs}ms`} />
                </div>
              </Card>

              {result.error ? <ErrorViewer error={result.error} /> : null}

              <ExplorerJsonViewer value={result.response} title="Response JSON" />

              {debug ? (
                <div className="space-y-3">
                  <ExplorerJsonViewer
                    value={{
                      headers: result.request.headers,
                      body: result.request.body,
                    }}
                    title="Raw Request"
                  />
                  <Card className="overflow-hidden">
                    <div className="border-b border-border px-3 py-2 text-xs font-medium">cURL</div>
                    <pre className="max-h-48 overflow-auto bg-muted/30 p-3 text-[10px] leading-relaxed">
                      {result.curl}
                    </pre>
                    <div className="border-t border-border p-2">
                      <button
                        type="button"
                        className={buttonClassName("secondary")}
                        onClick={() => void navigator.clipboard?.writeText(result.curl)}
                      >
                        Copy cURL
                      </button>
                    </div>
                  </Card>
                </div>
              ) : null}
            </div>
          ) : null}

          <Card className="p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">Request History</p>
              <button
                type="button"
                className={buttonClassName("ghost")}
                onClick={() => {
                  clearExplorerHistory();
                  setHistory([]);
                }}
              >
                Clear
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No explorer requests yet.</p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-auto">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[11px]"
                  >
                    <span className="font-medium text-foreground">{entry.endpointId}</span>
                    <span className="text-muted-foreground">{entry.providerId}</span>
                    <span className="text-muted-foreground">{entry.status}</span>
                    <span className="text-muted-foreground">{entry.durationMs}ms</span>
                    <span className="text-muted-foreground">
                      {new Date(entry.at).toLocaleTimeString()}
                    </span>
                    <button
                      type="button"
                      className={buttonClassName("secondary", "ml-auto h-6")}
                      onClick={() => onReplay(entry)}
                    >
                      Replay
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {debug && result ? (
            <details>
              <summary className="cursor-pointer text-[11px] text-muted-foreground">
                Full execution snapshot
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border p-2 text-[10px]">
                {prettyJson(result)}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-all font-mono text-foreground">{value}</p>
    </div>
  );
}
