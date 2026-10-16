"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, EyeOff, Play, RefreshCw, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn, formatDateTime } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  fetchLatestAuditRun,
  fetchSeoAuditIssues,
  issueLabel,
  startAuditRun,
  updateAuditIssue,
  ISSUE_STATUS_TONE,
  SEVERITY_TONE,
  type ApiSeoAuditIssue,
  type ApiSeoAuditIssueMeta,
  type ApiSeoAuditRun,
} from "@/lib/api/seo-audit";
import {
  AUDIT_CATEGORY_LABELS,
  type AuditCategory,
  type AuditIssueStatus,
} from "@/lib/mock-data/seo";

const CATEGORY_KEYS = Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[];

function scoreTone(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function HealthRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 26;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  return (
    <div className="relative flex h-[68px] w-[68px] shrink-0 items-center justify-center">
      <svg viewBox="0 0 60 60" className="h-full w-full -rotate-90">
        <circle cx="30" cy="30" r="26" fill="none" strokeWidth="5" className="stroke-muted" />
        <circle
          cx="30"
          cy="30"
          r="26"
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className={cn("transition-[stroke-dasharray] duration-500", scoreTone(score))}
          stroke="currentColor"
        />
      </svg>
      <span className={cn("absolute text-sm font-semibold tabular-nums", scoreTone(score))}>
        {score}
      </span>
    </div>
  );
}

function RunSummary({ run, onRun, running }: { run: ApiSeoAuditRun | null; onRun: (live: boolean) => void; running: boolean }) {
  const canWrite = useAdminCanWrite();

  if (!run) {
    return (
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-3">
        <div>
          <p className="text-sm font-medium">No audit has run yet</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Run one to check every published page for SEO problems.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" className="rounded-none" disabled={running} onClick={() => onRun(false)}>
            <Play className="mr-1 h-3 w-3" /> Run audit
          </Button>
        )}
      </div>
    );
  }

  const scores = Object.entries(run.category_scores) as [AuditCategory, number][];
  const notInspected = CATEGORY_KEYS.filter((key) => !(key in run.category_scores));

  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex flex-wrap items-center gap-4 px-3 py-3">
        <HealthRing score={run.health_score} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Site health</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {run.pages_crawled} pages checked · {run.issues_found} issues · {run.duration_ms}ms
            {run.live_pages_crawled > 0 && ` · ${run.live_pages_crawled} fetched live`}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Last run {formatDateTime(run.started_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {run.live_pages_crawled > 0 ? (
            <Badge
              variant="outline"
              className={cn(
                "rounded-none text-[10px]",
                run.storefront_reachable
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
              )}
            >
              {run.storefront_reachable ? (
                <Wifi className="mr-1 h-3 w-3" />
              ) : (
                <WifiOff className="mr-1 h-3 w-3" />
              )}
              Storefront {run.storefront_reachable ? "reachable" : "unreachable"}
            </Badge>
          ) : null}
          {canWrite && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="rounded-none"
                disabled={running}
                onClick={() => onRun(false)}
              >
                <RefreshCw className={cn("mr-1 h-3 w-3", running && "animate-spin")} /> Re-run
              </Button>
              <Button
                size="sm"
                className="rounded-none"
                disabled={running}
                onClick={() => onRun(true)}
                title="Also fetch a sample of live pages — the only way to score performance and mobile"
              >
                <Play className="mr-1 h-3 w-3" /> Run with live crawl
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border px-3 py-2">
        {scores.map(([category, score]) => (
          <div key={category} className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">
              {AUDIT_CATEGORY_LABELS[category]}
            </span>
            <span className={cn("text-[12px] font-semibold tabular-nums", scoreTone(score))}>
              {score}
            </span>
          </div>
        ))}
        {notInspected.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {notInspected.map((key) => AUDIT_CATEGORY_LABELS[key]).join(" and ")} need a live crawl
          </span>
        )}
      </div>
    </div>
  );
}

function IssueRow({
  issue,
  onTriage,
  busy,
}: {
  issue: ApiSeoAuditIssue;
  onTriage: (id: string, status: AuditIssueStatus) => void;
  busy: boolean;
}) {
  const canWrite = useAdminCanWrite();
  return (
    <div className="flex items-start gap-3 border-b border-border px-3 py-2 hover:bg-muted/30">
      <Badge
        variant="outline"
        className={cn("mt-0.5 shrink-0 rounded-none text-[10px]", SEVERITY_TONE[issue.severity])}
      >
        {issue.severity}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium">{issueLabel(issue.issue_type)}</span>
          <span className="text-[11px] text-muted-foreground">
            {AUDIT_CATEGORY_LABELS[issue.category]}
          </span>
          {issue.affected_count > 1 && (
            <Badge variant="outline" className="rounded-none text-[10px]">
              {issue.affected_count} affected
            </Badge>
          )}
          {issue.status !== "open" && (
            <Badge
              variant="outline"
              className={cn("rounded-none text-[10px]", ISSUE_STATUS_TONE[issue.status])}
            >
              {issue.status}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
          {issue.url} · {issue.entity}
        </p>
        <p className="mt-1 text-[11px] leading-snug">{issue.suggestion}</p>
      </div>
      {canWrite && (
        <div className="flex shrink-0 items-center gap-1">
          {issue.status !== "fixed" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-none px-2 text-[11px]"
              disabled={busy}
              onClick={() => onTriage(issue.id, "fixed")}
              title="Mark as fixed"
            >
              <Check className="h-3 w-3" />
            </Button>
          )}
          {issue.status !== "ignored" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-none px-2 text-[11px]"
              disabled={busy}
              onClick={() => onTriage(issue.id, "ignored")}
              title="Ignore — survives future audits"
            >
              <EyeOff className="h-3 w-3" />
            </Button>
          )}
          {issue.status !== "open" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-none px-2 text-[11px]"
              disabled={busy}
              onClick={() => onTriage(issue.id, "open")}
              title="Reopen"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 60;

export function SeoAuditView() {
  const [run, setRun] = useState<ApiSeoAuditRun | null>(null);
  const [issues, setIssues] = useState<ApiSeoAuditIssue[]>([]);
  const [meta, setMeta] = useState<ApiSeoAuditIssueMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("open");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [latest, list] = await Promise.all([
        fetchLatestAuditRun().catch(() => null),
        fetchSeoAuditIssues({ search, category, severity, status }),
      ]);
      setRun(latest);
      setIssues(list.data);
      setMeta(list.meta);
      setVisible(PAGE_SIZE);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load the audit");
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }, [search, category, severity, status]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const handleRun = useCallback(
    async (live: boolean) => {
      setRunning(true);
      try {
        const result = await startAuditRun(live);
        toast.success(
          `Audit finished — ${result.issues_found} issue${result.issues_found === 1 ? "" : "s"}, health ${result.health_score}`,
        );
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The audit could not run");
      } finally {
        setRunning(false);
      }
    },
    [load],
  );

  const triage = useCallback(async (id: string, next: AuditIssueStatus) => {
    setBusyId(id);
    try {
      const updated = await updateAuditIssue(id, next);
      setIssues((rows) => rows.map((row) => (row.id === id ? updated : row)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the issue");
    } finally {
      setBusyId(null);
    }
  }, []);

  const shown = useMemo(() => issues.slice(0, visible), [issues, visible]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <RunSummary run={run} onRun={handleRun} running={running} />

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
        <Input
          placeholder="Search URL, entity or check…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[240px] shrink-0 rounded-none"
        />
        <FilterSelect
          value={status}
          onChange={setStatus}
          width="w-[150px]"
          ariaLabel="Status"
          options={[
            { value: "open", label: "Open" },
            { value: "fixed", label: "Fixed" },
            { value: "ignored", label: "Ignored" },
            { value: "all", label: "All statuses" },
          ]}
        />
        <FilterSelect
          value={severity}
          onChange={setSeverity}
          width="w-[150px]"
          ariaLabel="Severity"
          options={[
            { value: "all", label: "All severities" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
        <FilterSelect
          value={category}
          onChange={setCategory}
          width="w-[170px]"
          ariaLabel="Category"
          options={[
            { value: "all", label: "All categories" },
            ...CATEGORY_KEYS.map((key) => ({ value: key, label: AUDIT_CATEGORY_LABELS[key] })),
          ]}
        />
        {meta && (
          <span className="ml-auto shrink-0 pr-2 text-[11px] text-muted-foreground">
            {meta.count} shown · {meta.high_count} high · {meta.medium_count} medium ·{" "}
            {meta.low_count} low
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && issues.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading issues…</p>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-3 py-12">
            <p className="text-sm font-medium">Nothing to fix here</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No issue matches these filters.
            </p>
          </div>
        ) : (
          <>
            {shown.map((issue) => (
              <IssueRow key={issue.id} issue={issue} onTriage={triage} busy={busyId === issue.id} />
            ))}
            {visible < issues.length && (
              <div className="flex justify-center py-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-none"
                  onClick={() => setVisible((n) => n + PAGE_SIZE)}
                >
                  Show more ({issues.length - visible} left)
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
