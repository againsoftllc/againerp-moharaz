"use client";

import { useMemo, useState } from "react";
import type { EntityMapping } from "../../api/mapping";
import { Card, StateBlock, buttonClassName, inputClassName } from "../../components";
import {
  approveEntityMapping,
  manualEntityMapping,
  mergeEntityMappings,
  rejectEntityMapping,
  resolveMappingConflict,
  useMappingDashboard,
} from "../../hooks/use-mapping";
import { ENTITY_LABELS, METHOD_LABELS, STATUS_TONES } from "../../mapping/types";
import { cn } from "../../utils";

const ENTITY_TABS = ["", "brand", "category", "attribute", "supplier"] as const;
const STATUS_TABS = ["", "suggested", "auto_matched", "conflict", "approved", "manual", "rejected"] as const;

function MappingRow({
  row,
  selected,
  onToggle,
  onSelect,
}: {
  row: EntityMapping;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  return (
    <tr className="border-b border-border hover:bg-muted/30">
      <td className="px-3 py-2">
        <input type="checkbox" checked={selected} onChange={onToggle} />
      </td>
      <td className="px-3 py-2 text-xs capitalize text-muted-foreground">{row.entity_type}</td>
      <td className="px-3 py-2">
        <button type="button" className="text-left text-sm font-medium hover:underline" onClick={onSelect}>
          {row.provider_name}
        </button>
        <p className="text-[11px] text-muted-foreground">
          {row.provider} · {row.provider_entity_id}
        </p>
      </td>
      <td className="px-3 py-2 text-sm">{row.erp_entity_name ?? "—"}</td>
      <td className="px-3 py-2">
        <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium capitalize", STATUS_TONES[row.status] ?? STATUS_TONES.pending)}>
          {row.status.replace(/_/g, " ")}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {METHOD_LABELS[row.match_method as keyof typeof METHOD_LABELS] ?? row.match_method}
      </td>
      <td className="px-3 py-2 text-xs">{Math.round(row.confidence * 100)}%</td>
    </tr>
  );
}

export function MappingDashboardPage() {
  const [entityFilter, setEntityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<EntityMapping | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [manualErpId, setManualErpId] = useState("");
  const [manualErpName, setManualErpName] = useState("");
  const [notes, setNotes] = useState("");

  const { meta, mappings, loading, error, refetch } = useMappingDashboard();

  const filtered = useMemo(() => {
    return mappings.filter((m) => {
      if (entityFilter && m.entity_type !== entityFilter) return false;
      if (statusFilter && m.status !== statusFilter) return false;
      if (q && !m.provider_name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [mappings, entityFilter, statusFilter, q]);

  async function reload() {
    await refetch({ entity_type: entityFilter || undefined, status: statusFilter || undefined, q: q || undefined });
  }

  async function onApprove(row: EntityMapping, candidate?: { id: string; name: string }) {
    setBusy(true);
    setMsg(null);
    try {
      await approveEntityMapping(row.id, {
        erp_entity_id: candidate?.id ?? row.erp_entity_id ?? undefined,
        erp_entity_name: candidate?.name ?? row.erp_entity_name ?? undefined,
        review_notes: notes || undefined,
      });
      setMsg("Mapping approved — reuses existing ERP record, no duplicate created");
      setActive(null);
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function onReject(row: EntityMapping) {
    setBusy(true);
    try {
      await rejectEntityMapping(row.id, notes || undefined);
      setActive(null);
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  }

  async function onManual(row: EntityMapping) {
    if (!manualErpId || !manualErpName) return;
    setBusy(true);
    try {
      await manualEntityMapping(row.id, manualErpId, manualErpName, notes || undefined);
      setActive(null);
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Manual mapping failed");
    } finally {
      setBusy(false);
    }
  }

  async function onResolve(row: EntityMapping, candidate: { id: string; name: string }) {
    setBusy(true);
    try {
      await resolveMappingConflict(row.id, candidate.id, candidate.name, notes || undefined);
      setActive(null);
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Resolve failed");
    } finally {
      setBusy(false);
    }
  }

  async function onMerge() {
    const ids = [...selected];
    if (ids.length < 2) return;
    setBusy(true);
    try {
      const [target, ...sources] = ids;
      await mergeEntityMappings(target, sources);
      setSelected(new Set());
      setMsg(`Merged ${sources.length} mapping(s) into target`);
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Smart Mapping Engine</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Provider-independent · detect existing Brand / Category / Attribute / Supplier · reuse or suggest · never auto-create duplicates
        </p>
        {meta ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            {[
              { label: "Total mappings", value: meta.total },
              { label: "Pending review", value: meta.pending_review },
              { label: "Approved", value: meta.approved },
              { label: "Conflicts", value: meta.conflicts },
              { label: "Active rules", value: meta.rules },
              { label: "Brands", value: meta.by_entity_type.brand ?? 0 },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className="text-lg font-semibold text-foreground">{s.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {ENTITY_TABS.map((tab) => (
            <button
              key={tab || "all"}
              type="button"
              className={buttonClassName(entityFilter === tab ? "primary" : "secondary")}
              onClick={() => {
                setEntityFilter(tab);
                void refetch({ entity_type: tab || undefined, status: statusFilter || undefined, q: q || undefined });
              }}
            >
              {tab ? ENTITY_LABELS[tab as keyof typeof ENTITY_LABELS] : "All types"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab || "all-status"}
              type="button"
              className={buttonClassName(statusFilter === tab ? "primary" : "secondary")}
              onClick={() => {
                setStatusFilter(tab);
                void refetch({ entity_type: entityFilter || undefined, status: tab || undefined, q: q || undefined });
              }}
            >
              {tab ? tab.replace(/_/g, " ") : "All status"}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <input className={inputClassName()} placeholder="Search provider name…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className={buttonClassName("secondary")} onClick={() => void reload()}>
            Refresh
          </button>
          <button type="button" disabled={busy || selected.size < 2} className={buttonClassName("secondary")} onClick={() => void onMerge()}>
            Merge selected
          </button>
        </div>
        {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
      </Card>

      {loading ? <StateBlock title="Loading mappings…" /> : null}
      {error ? <StateBlock tone="error" title="Mapping error" description={error} /> : null}

      {!loading && !error ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="overflow-x-auto lg:col-span-2">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Provider entity</th>
                  <th className="px-3 py-2">ERP target</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No mappings yet. Scan from Import Review or Mapping Preview.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <MappingRow
                      key={row.id}
                      row={row}
                      selected={selected.has(row.id)}
                      onToggle={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        })
                      }
                      onSelect={() => {
                        setActive(row);
                        setManualErpId(row.erp_entity_id ?? "");
                        setManualErpName(row.erp_entity_name ?? "");
                      }}
                    />
                  ))
                )}
              </tbody>
            </table>
          </Card>

          <Card className="p-4">
            {!active ? (
              <StateBlock title="Select a mapping" description="Review suggestions, resolve conflicts, or set manual ERP target." />
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold capitalize text-foreground">
                    {ENTITY_LABELS[active.entity_type]} · {active.provider_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{active.provider} / {active.provider_entity_id}</p>
                </div>

                {active.status === "conflict" && active.conflicts.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-orange-700 dark:text-orange-300">Conflict resolution</p>
                    <ul className="mt-2 space-y-1">
                      {active.conflicts.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            disabled={busy}
                            className="w-full rounded border border-border px-2 py-1 text-left text-xs hover:bg-muted/40"
                            onClick={() => void onResolve(active, c)}
                          >
                            Use {c.name} ({Math.round((c.score ?? 0) * 100)}%)
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {active.suggestions.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-foreground">Suggestions</p>
                    <ul className="mt-2 space-y-1">
                      {active.suggestions.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            disabled={busy}
                            className="w-full rounded border border-border px-2 py-1 text-left text-xs hover:bg-muted/40"
                            onClick={() => void onApprove(active, c)}
                          >
                            {c.source === "ai_suggestion" ? "AI: " : ""}
                            {c.name} ({Math.round((c.score ?? 0) * 100)}%)
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No ERP match — mapping suggestion only (no auto-create).</p>
                )}

                <div>
                  <p className="text-xs font-medium text-foreground">Manual mapping</p>
                  <input className={cn(inputClassName(), "mt-1")} placeholder="ERP entity ID" value={manualErpId} onChange={(e) => setManualErpId(e.target.value)} />
                  <input className={cn(inputClassName(), "mt-1")} placeholder="ERP entity name" value={manualErpName} onChange={(e) => setManualErpName(e.target.value)} />
                  <button type="button" disabled={busy} className={cn(buttonClassName("secondary"), "mt-2 w-full")} onClick={() => void onManual(active)}>
                    Save manual target
                  </button>
                </div>

                <textarea className={inputClassName("min-h-[3rem]")} placeholder="Review notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

                <div className="flex gap-2">
                  <button type="button" disabled={busy} className={buttonClassName("primary")} onClick={() => void onApprove(active)}>
                    Approve
                  </button>
                  <button type="button" disabled={busy} className={buttonClassName("secondary")} onClick={() => void onReject(active)}>
                    Reject
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
