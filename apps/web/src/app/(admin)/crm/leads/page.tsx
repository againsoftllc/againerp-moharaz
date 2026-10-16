"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { LeadDrawer, type LeadInput } from "@/components/crm/lead-drawer";
import { LeadDetailDrawer } from "@/components/crm/lead-detail-drawer";
import { useOpenFromUrl } from "@/lib/hooks/use-open-from-url";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { fetchMentionableUsers } from "@/lib/api/auth-users";
import { LEAD_SOURCES, LEAD_STATUS_LABELS } from "@/lib/crm/lead-constants";
import {
  createCrmLead,
  fetchCrmLeadSummary,
  fetchCrmLeads,
  updateCrmLead,
  type ApiCrmLead,
  type CrmLeadListParams,
  type CrmLeadSummary,
} from "@/lib/api/crm";
import { cn, formatDate, formatMoney } from "@/lib/utils";

function money(value: string | null) {
  if (value === null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatMoney(n) : value;
}

function statusVariant(status: string) {
  if (status === "converted") return "success" as const;
  if (status === "qualified") return "warning" as const;
  if (status === "lost" || status === "unqualified") return "muted" as const;
  return "outline" as const;
}

function followUpVariant(status: string | null) {
  if (status === "overdue") return "warning" as const;
  if (status === "today") return "outline" as const;
  return "muted" as const;
}

type Filters = {
  status: string;
  assignedMode: "all" | "mine" | "unassigned";
  source: string;
  followUp: string;
  search: string;
};

const DEFAULT_FILTERS: Filters = { status: "all", assignedMode: "all", source: "all", followUp: "all", search: "" };

const QUICK_FILTERS: { label: string; filters: Partial<Filters> }[] = [
  { label: "All Leads", filters: {} },
  { label: "My Leads", filters: { assignedMode: "mine" } },
  { label: "Unassigned", filters: { assignedMode: "unassigned" } },
  { label: "Follow-up Today", filters: { followUp: "today" } },
  { label: "Overdue", filters: { followUp: "overdue" } },
  { label: "Qualified", filters: { status: "qualified" } },
  { label: "Converted", filters: { status: "converted" } },
  { label: "Lost", filters: { status: "lost" } },
];

type DetailState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "view"; lead: ApiCrmLead }
  | { mode: "edit"; lead: ApiCrmLead };

export default function CrmLeadsPage() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<ApiCrmLead[]>([]);
  const [summary, setSummary] = useState<CrmLeadSummary | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [detail, setDetail] = useState<DetailState>({ mode: "closed" });

  // Deep link: /crm/leads?open=<id> (e.g. from an Aladin "created lead — open it" link)
  useOpenFromUrl(rows, (l) => l.id, (lead) => setDetail({ mode: "view", lead }));

  const listParams = useMemo<CrmLeadListParams>(
    () => ({
      status: filters.status,
      search: filters.search || undefined,
      mine: filters.assignedMode === "mine",
      unassigned: filters.assignedMode === "unassigned",
      source: filters.source,
      follow_up: filters.followUp,
    }),
    [filters],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [leadsRes, summaryRes, usersRes] = await Promise.all([
        fetchCrmLeads(listParams),
        fetchCrmLeadSummary(),
        users.length === 0 ? fetchMentionableUsers() : Promise.resolve(users),
      ]);
      setRows(leadsRes.data);
      setSummary(summaryRes.data);
      if (users.length === 0) setUsers(usersRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "crm-leads-api" });
  }, [error]);

  function applyQuickFilter(f: Partial<Filters>) {
    setFilters({ ...DEFAULT_FILTERS, ...f, search: filters.search });
  }

  const isQuickFilterActive = (f: Partial<Filters>) => {
    const merged = { ...DEFAULT_FILTERS, ...f };
    return merged.status === filters.status && merged.assignedMode === filters.assignedMode && merged.followUp === filters.followUp;
  };

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold">Leads</h1>
            <p className="text-xs text-muted-foreground">Prospects that haven&apos;t become a deal yet.</p>
          </div>
          <ListGridHeaderStart title="Leads">
            {canWrite && (
              <Button size="sm" onClick={() => setDetail({ mode: "create" })}>
                New
              </Button>
            )}
          </ListGridHeaderStart>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <button className="border border-border bg-background px-3 py-2 text-left hover:bg-muted/30" onClick={() => applyQuickFilter({})}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{summary.total_leads}</p>
            </button>
            <button className="border border-border bg-background px-3 py-2 text-left hover:bg-muted/30" onClick={() => applyQuickFilter({ status: "new" })}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">New</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{summary.new_leads}</p>
            </button>
            <button className="border border-border bg-background px-3 py-2 text-left hover:bg-muted/30" onClick={() => applyQuickFilter({ status: "active" })}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Active</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{summary.active_leads}</p>
            </button>
            <button className="border border-border bg-background px-3 py-2 text-left hover:bg-muted/30" onClick={() => applyQuickFilter({ followUp: "due" })}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Follow-ups Due</p>
              <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", summary.follow_ups_due > 0 && "text-amber-600 dark:text-amber-400")}>
                {summary.follow_ups_due}
              </p>
            </button>
            <button className="border border-border bg-background px-3 py-2 text-left hover:bg-muted/30" onClick={() => applyQuickFilter({ status: "qualified" })}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Qualified</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{summary.qualified_leads}</p>
            </button>
            <button className="border border-border bg-background px-3 py-2 text-left hover:bg-muted/30" onClick={() => applyQuickFilter({ status: "converted" })}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Converted</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{summary.converted_leads}</p>
            </button>
          </div>
        )}

        {/* Quick filter chips */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_FILTERS.map((qf) => (
            <button
              key={qf.label}
              onClick={() => applyQuickFilter(qf.filters)}
              className={cn(
                "border px-2 py-1 text-[11px]",
                isQuickFilterActive(qf.filters) ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              {qf.label}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Input
            placeholder="Search name, company, email, phone…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="h-7 w-[220px] rounded-none text-xs"
          />
          <FilterSelect
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            width="w-[140px]"
            ariaLabel="Stage filter"
            options={[{ value: "all", label: "All stages" }, ...Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label }))]}
          />
          <FilterSelect
            value={filters.source}
            onChange={(v) => setFilters((f) => ({ ...f, source: v }))}
            width="w-[140px]"
            ariaLabel="Source filter"
            options={[{ value: "all", label: "All sources" }, ...LEAD_SOURCES]}
          />
          <FilterSelect
            value={filters.assignedMode}
            onChange={(v) => setFilters((f) => ({ ...f, assignedMode: v as Filters["assignedMode"] }))}
            width="w-[140px]"
            ariaLabel="Assigned filter"
            options={[
              { value: "all", label: "All owners" },
              { value: "mine", label: "My leads" },
              { value: "unassigned", label: "Unassigned" },
            ]}
          />
        </div>

        {/* Desktop table */}
        <div className="hidden md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden md:rounded-none md:border md:border-border md:bg-background">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Lead</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 font-medium">Stage</th>
                  <th className="px-3 py-2 font-medium">Assigned To</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Next Follow-up</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">Loading…</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">No leads match these filters.</td>
                  </tr>
                ) : (
                  rows.map((lead) => (
                    <tr key={lead.id} className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-muted/30" onClick={() => setDetail({ mode: "view", lead })}>
                      <td className="px-3 py-2 font-medium">{lead.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{lead.company_name ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{lead.phone ?? lead.email ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant={statusVariant(lead.status)} className="capitalize">
                          {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{lead.owner_name ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">{lead.source.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{lead.lead_score}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(lead.estimated_value)}</td>
                      <td className="px-3 py-2">
                        {lead.next_follow_up_at ? (
                          <Badge variant={followUpVariant(lead.follow_up_status)} className="capitalize">
                            {formatDate(lead.next_follow_up_at)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDate(lead.updated_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="flex flex-col gap-2 md:hidden">
          {loading ? (
            <p className="py-10 text-center text-xs text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">No leads match these filters.</p>
          ) : (
            rows.map((lead) => (
              <button
                key={lead.id}
                onClick={() => setDetail({ mode: "view", lead })}
                className="border border-border bg-background p-3 text-left hover:bg-muted/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{lead.name}</p>
                  <Badge variant={statusVariant(lead.status)} className="shrink-0 capitalize">
                    {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{lead.company_name ?? "No company"}</p>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{lead.owner_name ?? "Unassigned"}</span>
                  <span className="font-medium tabular-nums">{money(lead.estimated_value)}</span>
                </div>
                {lead.next_follow_up_at && (
                  <div className="mt-1.5">
                    <Badge variant={followUpVariant(lead.follow_up_status)} className="capitalize">
                      Follow-up: {formatDate(lead.next_follow_up_at)}
                    </Badge>
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex h-[34px] shrink-0 items-center gap-2 border-t border-border bg-background px-2.5">
        <span className="text-sm font-medium">Leads</span>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="Refresh leads">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{loading ? "…" : `${rows.length} shown`}</span>
      </div>

      <LeadDrawer
        open={detail.mode === "create" || detail.mode === "edit"}
        onOpenChange={(open) => {
          if (!open) setDetail({ mode: "closed" });
        }}
        lead={detail.mode === "edit" ? detail.lead : null}
        users={users}
        onCreate={async (input: LeadInput) => {
          const created = await createCrmLead(input);
          setRows((prev) => [created.data, ...prev]);
          void load();
        }}
        onSave={async (id, input: LeadInput) => {
          const updated = await updateCrmLead(id, input);
          setRows((prev) => prev.map((r) => (r.id === id ? updated.data : r)));
          setDetail({ mode: "view", lead: updated.data });
        }}
      />

      <LeadDetailDrawer
        open={detail.mode === "view"}
        onOpenChange={(open) => {
          if (!open) setDetail({ mode: "closed" });
        }}
        lead={detail.mode === "view" ? detail.lead : null}
        users={users}
        onUpdated={(updated) => {
          setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          setDetail({ mode: "view", lead: updated });
          void fetchCrmLeadSummary().then((res) => setSummary(res.data));
        }}
        onConverted={() => void load()}
        onEdit={(lead) => setDetail({ mode: "edit", lead })}
      />
    </div>
  );
}
