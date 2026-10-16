"use client";

import { useMemo, useState } from "react";
import {
  bulkStagingAction,
  type StagingItem,
} from "../../api/staging";
import { Card, StateBlock, buttonClassName, inputClassName } from "../../components";
import { useStagingQueue } from "../../hooks/use-staging";
import { cn } from "../../utils";

const STATUS_TABS = [
  { id: "", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "mapped", label: "Mapped" },
  { id: "validated", label: "Validated" },
  { id: "warning", label: "Warnings" },
  { id: "error", label: "Errors" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
] as const;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    mapped: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    validated: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    error: "bg-destructive/10 text-destructive",
    approved: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200",
    rejected: "bg-destructive/15 text-destructive",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

function ItemRow({
  item,
  selected,
  onToggle,
  onOpen,
}: {
  item: StagingItem;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const thumb = item.images.find((i) => i.is_primary)?.url ?? item.images[0]?.url;
  return (
    <tr className="border-b border-border hover:bg-muted/30">
      <td className="px-3 py-2">
        <input type="checkbox" checked={selected} onChange={onToggle} />
      </td>
      <td className="px-3 py-2">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-10 w-10 rounded object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
            N/A
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <button type="button" className="text-left text-sm font-medium text-foreground hover:underline" onClick={onOpen}>
          {item.title}
        </button>
        <p className="text-[11px] text-muted-foreground">{item.provider_product_id}</p>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{item.provider}</td>
      <td className="px-3 py-2">
        <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium capitalize", statusBadge(item.status))}>
          {item.status}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{item.brand_name ?? "—"}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{item.category_name ?? "—"}</td>
      <td className="px-3 py-2 text-xs">
        {item.warning_count > 0 ? (
          <span className="text-amber-600 dark:text-amber-400">{item.warning_count} warn</span>
        ) : null}
        {item.error_count > 0 ? (
          <span className="ml-1 text-destructive">{item.error_count} err</span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-[11px] text-muted-foreground">
        {new Date(item.created_at).toLocaleString()}
      </td>
    </tr>
  );
}

export type ImportQueuePageProps = {
  onOpenItem: (itemId: string) => void;
};

export function ImportQueuePage({ onOpenItem }: ImportQueuePageProps) {
  const [statusFilter, setStatusFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const { jobs, items, meta, loading, error, refetch } = useStagingQueue(
    statusFilter || undefined,
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (providerFilter && item.provider !== providerFilter) return false;
      if (q && !item.title.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [items, providerFilter, q]);

  function toggleAll() {
    if (selected.size === filteredItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredItems.map((i) => i.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(action: "approve" | "reject" | "delete" | "export") {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const res = await bulkStagingAction([...selected], action);
      if (action === "export" && res.data) {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `staging-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setBulkMsg(`${action}: ${res.count} item(s)`);
      setSelected(new Set());
      await refetch(statusFilter || undefined);
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Import Queue</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Staging only — products are not written to AgainERP catalog until STEP-05 approval pipeline.
        </p>

        {meta ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Pending jobs", value: meta.pending_jobs },
              { label: "Completed jobs", value: meta.completed_jobs },
              { label: "Failed jobs", value: meta.failed_jobs },
              { label: "Warning items", value: meta.warning_items },
              { label: "Pending items", value: meta.pending_items },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className="text-lg font-semibold text-foreground">{s.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id || "all"}
              type="button"
              className={buttonClassName(statusFilter === tab.id ? "primary" : "secondary")}
              onClick={() => {
                setStatusFilter(tab.id);
                void refetch(tab.id || undefined);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            className={inputClassName()}
            placeholder="Search title…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className={inputClassName()}
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          >
            <option value="">All providers</option>
            <option value="elim">Elim</option>
            <option value="mock">Mock</option>
          </select>
          <button type="button" className={buttonClassName("secondary")} onClick={() => void refetch(statusFilter || undefined)}>
            Refresh
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={bulkBusy || selected.size === 0}
            className={buttonClassName("primary")}
            onClick={() => void runBulk("approve")}
          >
            Approve selected
          </button>
          <button
            type="button"
            disabled={bulkBusy || selected.size === 0}
            className={buttonClassName("secondary")}
            onClick={() => void runBulk("reject")}
          >
            Reject selected
          </button>
          <button
            type="button"
            disabled={bulkBusy || selected.size === 0}
            className={buttonClassName("secondary")}
            onClick={() => void runBulk("delete")}
          >
            Delete selected
          </button>
          <button
            type="button"
            disabled={bulkBusy || selected.size === 0}
            className={buttonClassName("secondary")}
            onClick={() => void runBulk("export")}
          >
            Export JSON
          </button>
          {bulkMsg ? <span className="self-center text-xs text-muted-foreground">{bulkMsg}</span> : null}
        </div>
      </Card>

      {loading ? <StateBlock title="Loading staging queue…" /> : null}
      {error ? <StateBlock tone="error" title="Queue error" description={error} /> : null}

      {!loading && !error ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={filteredItems.length > 0 && selected.size === filteredItems.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2">Image</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Issues</th>
                <th className="px-3 py-2">Imported</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No staged products. Stage from Mapping Preview or Search.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    selected={selected.has(item.id)}
                    onToggle={() => toggleOne(item.id)}
                    onOpen={() => onOpenItem(item.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </Card>
      ) : null}

      {jobs.length > 0 ? (
        <Card className="p-4">
          <h3 className="text-xs font-semibold text-foreground">Recent import jobs</h3>
          <ul className="mt-2 space-y-2">
            {jobs.slice(0, 5).map((job) => (
              <li key={job.id} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{job.source_label ?? job.id}</span>
                <span className="capitalize">{job.status}</span>
                <span>{job.item_count} items</span>
                <span>{job.user_email}</span>
                <span>{new Date(job.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
