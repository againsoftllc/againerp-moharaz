"use client";

import { useApiLogs } from "../../hooks";
import { Card, StateBlock, buttonClassName } from "../../components";
import { prettyJson } from "../../utils";

export function LogsPage() {
  const { logs, clear } = useApiLogs();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">API Logs</h2>
          <p className="text-xs text-muted-foreground">
            Every request, response, and error is recorded locally (max 200).
          </p>
        </div>
        <button type="button" className={buttonClassName("secondary")} onClick={clear}>
          Clear logs
        </button>
      </div>

      {logs.length === 0 ? (
        <StateBlock title="No logs yet" description="Run a connection test or search to populate logs." />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <Card key={log.id} className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-[11px]">
                <span className="font-medium text-foreground">
                  {log.method} {log.path}
                </span>
                <span className="text-muted-foreground">
                  {new Date(log.at).toLocaleString()}
                  {log.status != null ? ` · ${log.status}` : ""}
                  {log.latencyMs != null ? ` · ${log.latencyMs}ms` : ""}
                  {` · ${log.level}`}
                </span>
              </div>
              {log.error ? (
                <p className="px-3 py-2 text-xs text-destructive">{log.error}</p>
              ) : null}
              <details className="px-3 py-2">
                <summary className="cursor-pointer text-[11px] text-muted-foreground">Details</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/40 p-2 text-[10px] leading-relaxed">
                  {prettyJson({
                    request: log.request,
                    response: log.response,
                  })}
                </pre>
              </details>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
