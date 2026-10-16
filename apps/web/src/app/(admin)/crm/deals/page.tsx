"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/shared/filter-select";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { DealDrawer, type DealInput } from "@/components/crm/deal-drawer";
import { useOpenFromUrl } from "@/lib/hooks/use-open-from-url";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { createCrmDeal, fetchCrmDeals, transitionCrmDealStage, updateCrmDeal, type ApiCrmDeal } from "@/lib/api/crm";
import { cn, formatMoney } from "@/lib/utils";

function money(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? formatMoney(n) : value;
}

function stageVariant(stage: string) {
  if (stage === "won") return "success" as const;
  if (stage === "lost") return "muted" as const;
  if (stage === "negotiation" || stage === "proposal") return "warning" as const;
  return "outline" as const;
}

const NEXT_STAGE: Record<string, string> = { new: "qualified", qualified: "proposal", proposal: "negotiation", negotiation: "won" };

type DrawerState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; deal: ApiCrmDeal };

export default function CrmDealsPage() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<ApiCrmDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState("all");
  const [drawer, setDrawer] = useState<DrawerState>({ mode: "closed" });
  const [busyId, setBusyId] = useState<string | null>(null);

  // Deep link: /crm/deals?open=<id> (e.g. from an Aladin "moved deal — open it" link)
  useOpenFromUrl(rows, (d) => d.id, (deal) => setDrawer({ mode: "edit", deal }));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCrmDeals({ stage });
      setRows(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, [stage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "crm-deals-api" });
  }, [error]);

  async function handleAdvance(deal: ApiCrmDeal) {
    const next = NEXT_STAGE[deal.stage];
    if (!next) return;
    setBusyId(deal.id);
    try {
      const res = await transitionCrmDealStage(deal.id, next);
      setRows((prev) => prev.map((r) => (r.id === deal.id ? res.data : r)));
      toast.success(next === "won" ? `${deal.title} won!` : `Deal moved to ${next}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update deal");
    } finally {
      setBusyId(null);
    }
  }

  async function handleLost(deal: ApiCrmDeal) {
    const reason = window.prompt("Reason (optional):") ?? undefined;
    setBusyId(deal.id);
    try {
      const res = await transitionCrmDealStage(deal.id, "lost", reason);
      setRows((prev) => prev.map((r) => (r.id === deal.id ? res.data : r)));
      toast.success("Deal marked lost");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update deal");
    } finally {
      setBusyId(null);
    }
  }

  const totalValue = rows.filter((r) => r.stage !== "lost").reduce((sum, r) => sum + Number(r.value), 0);

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-2">
        <ListGridHeaderStart title="Deals">
          {canWrite && (
            <Button size="sm" onClick={() => setDrawer({ mode: "create" })}>
              New
            </Button>
          )}
        </ListGridHeaderStart>
        <FilterSelect
          value={stage}
          onChange={setStage}
          width="w-[150px]"
          ariaLabel="Stage filter"
          options={[
            { value: "all", label: "All stages" },
            { value: "new", label: "New" },
            { value: "qualified", label: "Qualified" },
            { value: "proposal", label: "Proposal" },
            { value: "negotiation", label: "Negotiation" },
            { value: "won", label: "Won" },
            { value: "lost", label: "Lost" },
          ]}
        />
        <span className="ml-auto text-xs text-muted-foreground">
          Total: <span className="font-semibold tabular-nums text-foreground">{money(String(totalValue))}</span>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-background">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                  <th className="px-3 py-2 text-right font-medium">Probability</th>
                  <th className="px-3 py-2 font-medium">Expected close</th>
                  <th className="px-3 py-2 font-medium">Stage</th>
                  {canWrite && <th className="w-[190px] px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={canWrite ? 7 : 6} className="px-3 py-10 text-center text-muted-foreground">Loading…</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={canWrite ? 7 : 6} className="px-3 py-10 text-center text-muted-foreground">No deals.</td>
                  </tr>
                ) : (
                  rows.map((deal) => {
                    const busy = busyId === deal.id;
                    const next = NEXT_STAGE[deal.stage];
                    const isClosed = deal.stage === "won" || deal.stage === "lost";
                    return (
                      <tr
                        key={deal.id}
                        className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-muted/30"
                        onClick={() => !isClosed && setDrawer({ mode: "edit", deal })}
                      >
                        <td className="px-3 py-2 font-medium">{deal.title}</td>
                        <td className="px-3 py-2 text-muted-foreground">{deal.contact_name ?? deal.customer_name ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(deal.value)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{deal.probability}%</td>
                        <td className="px-3 py-2 text-muted-foreground">{deal.expected_close_date ?? "—"}</td>
                        <td className="px-3 py-2">
                          <Badge variant={stageVariant(deal.stage)} className="capitalize">
                            {deal.stage}
                          </Badge>
                        </td>
                        {canWrite && (
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {next && (
                                <Button size="sm" variant={next === "won" ? "default" : "outline"} className="h-6 px-2 text-[11px] capitalize" disabled={busy} onClick={() => void handleAdvance(deal)}>
                                  {next === "won" ? "Mark won" : `Move to ${next}`}
                                  {next !== "won" && <ArrowRight className="ml-1 h-3 w-3" />}
                                </Button>
                              )}
                              {!isClosed && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 px-0 text-muted-foreground hover:text-destructive"
                                  disabled={busy}
                                  onClick={() => void handleLost(deal)}
                                  title="Mark lost"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex h-[34px] shrink-0 items-center gap-2 border-t border-border bg-background px-2.5">
        <span className="text-sm font-medium">Deals</span>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="Refresh deals">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{loading ? "…" : `${rows.length} shown`}</span>
      </div>

      <DealDrawer
        open={drawer.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDrawer({ mode: "closed" });
        }}
        deal={drawer.mode === "edit" ? drawer.deal : null}
        onCreate={async (input: DealInput) => {
          const created = await createCrmDeal(input);
          setRows((prev) => [created.data, ...prev]);
        }}
        onSave={async (id, input: DealInput) => {
          const updated = await updateCrmDeal(id, input);
          setRows((prev) => prev.map((r) => (r.id === id ? updated.data : r)));
        }}
      />
    </div>
  );
}
