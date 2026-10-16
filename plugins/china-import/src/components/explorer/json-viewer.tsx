"use client";

import { useMemo, useState } from "react";
import { copyText, prettyJson, cn } from "../../utils";
import { buttonClassName, Card } from "../ui";

type JsonNodeProps = {
  name?: string;
  value: unknown;
  depth: number;
  filter: string;
  forceExpand: boolean | null;
};

function matchesFilter(name: string | undefined, value: unknown, filter: string): boolean {
  if (!filter) return true;
  const q = filter.toLowerCase();
  if (name?.toLowerCase().includes(q)) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase().includes(q);
  }
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value).toLowerCase().includes(q);
    } catch {
      return false;
    }
  }
  return false;
}

function JsonNode({ name, value, depth, filter, forceExpand }: JsonNodeProps) {
  const isObject = value !== null && typeof value === "object";
  const [open, setOpen] = useState(depth < 2);
  const expanded = forceExpand == null ? open : forceExpand;

  if (!matchesFilter(name, value, filter) && depth > 0) return null;

  if (!isObject) {
    const display =
      value === null
        ? "null"
        : typeof value === "string"
          ? `"${value}"`
          : String(value);
    const color =
      value === null
        ? "text-muted-foreground"
        : typeof value === "string"
          ? "text-emerald-700 dark:text-emerald-300"
          : typeof value === "number"
            ? "text-sky-700 dark:text-sky-300"
            : typeof value === "boolean"
              ? "text-amber-700 dark:text-amber-300"
              : "text-foreground";
    return (
      <div className="font-mono text-[11px] leading-5" style={{ paddingLeft: depth * 12 }}>
        {name != null ? <span className="text-violet-700 dark:text-violet-300">{name}: </span> : null}
        <span className={color}>{display}</span>
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <button
        type="button"
        className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {expanded ? "▼" : "▶"}{" "}
        {name != null ? <span className="text-violet-700 dark:text-violet-300">{name}</span> : null}
        <span className="text-muted-foreground">
          {" "}
          {Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </button>
      {expanded
        ? entries.map(([k, v]) => (
            <JsonNode
              key={k}
              name={k}
              value={v}
              depth={depth + 1}
              filter={filter}
              forceExpand={forceExpand}
            />
          ))
        : null}
    </div>
  );
}

export function ExplorerJsonViewer({
  value,
  title = "Response",
}: {
  value: unknown;
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const [forceExpand, setForceExpand] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => prettyJson(value), [value]);

  async function onCopy() {
    const ok = await copyText(text);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function onDownload() {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `china-import-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <input
          className="h-7 min-w-[10rem] flex-1 rounded-md border border-input bg-background px-2 text-[11px]"
          placeholder="Search JSON…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className={buttonClassName("ghost")} onClick={() => setForceExpand(true)}>
          Expand
        </button>
        <button type="button" className={buttonClassName("ghost")} onClick={() => setForceExpand(false)}>
          Collapse
        </button>
        <button type="button" className={buttonClassName("secondary")} onClick={() => void onCopy()}>
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" className={buttonClassName("secondary")} onClick={onDownload}>
          Download
        </button>
      </div>
      <div className="max-h-[28rem] overflow-auto bg-muted/20 p-3">
        <JsonNode value={value} depth={0} filter={query} forceExpand={forceExpand} />
      </div>
      <details className="border-t border-border">
        <summary className="cursor-pointer px-3 py-2 text-[11px] text-muted-foreground">Pretty JSON (raw text)</summary>
        <pre className="max-h-64 overflow-auto p-3 text-[10px] leading-relaxed">{text}</pre>
      </details>
    </Card>
  );
}

export function ErrorViewer({ error }: { error: { kind: string; message: string; status?: number; code?: string | number; details?: unknown } }) {
  const tone =
    error.kind === "validation"
      ? "border-amber-500/40 bg-amber-500/5"
      : error.kind === "timeout"
        ? "border-orange-500/40 bg-orange-500/5"
        : "border-destructive/40 bg-destructive/5";

  return (
    <Card className={cn("p-4", tone)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
        {error.kind === "http"
          ? "HTTP Error"
          : error.kind === "provider"
            ? "Provider Error"
            : error.kind === "validation"
              ? "Validation Error"
              : error.kind === "timeout"
                ? "Timeout"
                : "Unknown Error"}
      </p>
      <p className="mt-1 text-sm text-foreground">{error.message}</p>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {error.status != null ? <span>Status {error.status}</span> : null}
        {error.code != null ? <span>Code {String(error.code)}</span> : null}
      </div>
      {error.details != null ? (
        <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-background/60 p-2 text-[10px]">
          {prettyJson(error.details)}
        </pre>
      ) : null}
    </Card>
  );
}
