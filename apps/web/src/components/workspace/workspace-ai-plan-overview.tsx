"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CreditCard, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  fetchAiPackages,
  fetchAiPlanOverview,
  changeAiPackage,
  setAiOnDemand,
  payAiInvoice,
  type ApiAiPackage,
  type ApiAiPlanOverview,
} from "@/lib/api/ai-billing";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn, formatCurrency } from "@/lib/utils";

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function WorkspaceAiPlanOverview() {
  const canWrite = useAdminCanWrite();
  const [overview, setOverview] = useState<ApiAiPlanOverview | null>(null);
  const [packages, setPackages] = useState<ApiAiPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plan, pkgs] = await Promise.all([fetchAiPlanOverview(), fetchAiPackages()]);
      setOverview(plan);
      setPackages(pkgs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load AI plan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handlePay() {
    if (!overview?.unpaid_invoice) return;
    setBusy(true);
    try {
      await payAiInvoice(overview.unpaid_invoice.id);
      toast.success("Invoice paid");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectPackage(id: string) {
    setBusy(true);
    try {
      await changeAiPackage(id);
      toast.success("Plan updated");
      setPickerOpen(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change plan");
    } finally {
      setBusy(false);
    }
  }

  async function handleOnDemandToggle(enabled: boolean) {
    setBusy(true);
    try {
      await setAiOnDemand(enabled);
      toast.success(enabled ? "On-demand usage enabled" : "On-demand usage disabled");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update setting");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !overview) {
    return <p className="text-xs text-muted-foreground">Loading plan…</p>;
  }
  if (!overview) return null;

  const { package: pkg, tokens_used, percent_used, unpaid_invoice, on_demand_enabled, current_period_end } = overview;

  return (
    <div className="space-y-4">
      <h1 className="page-title">Overview</h1>

      {unpaid_invoice ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-500">Payment Required</p>
              <p className="mt-0.5 text-xs text-red-500/80">
                You have an unpaid invoice. Pay it to continue using the AI assistant.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-500/90">
              {formatCurrency(Number(unpaid_invoice.amount_bdt))} invoice from {formatDate(unpaid_invoice.created_at.slice(0, 10))}
            </p>
            {canWrite ? (
              <Button size="sm" disabled={busy} onClick={() => void handlePay()} className="bg-red-600 text-white hover:bg-red-700">
                <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Pay
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Your included usage</p>
          <p className="mt-2 text-2xl font-semibold">{percent_used}% used</p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", percent_used >= 100 ? "bg-red-500" : "bg-primary")}
              style={{ width: `${Math.min(100, percent_used)}%` }}
            />
          </div>
          <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            {formatTokens(tokens_used)} / {formatTokens(pkg.included_tokens)} tokens · Resets {formatDate(current_period_end)}
            <Info className="h-3 w-3" />
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <div>
              <p className="text-xs font-medium">On-demand usage</p>
              <p className="text-[11px] text-muted-foreground">
                Keep using AI past your plan, billed at {formatCurrency(1.5)}/1,000 tokens.
              </p>
            </div>
            <Switch checked={on_demand_enabled} disabled={!canWrite || busy} onCheckedChange={(v) => void handleOnDemandToggle(v)} />
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <p className="text-sm font-semibold">
            {pkg.name} <span className="font-normal text-muted-foreground">{formatCurrency(Number(pkg.price_bdt))}/mo.</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{pkg.description}</p>
          {canWrite ? (
            <Button size="sm" variant="outline" className="mt-4" onClick={() => setPickerOpen(true)}>
              Change plan
            </Button>
          ) : null}
        </div>
      </div>

      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent side="right" title="Choose a plan" className="w-full max-w-md">
          <div className="pr-8">
            <h2 className="text-base font-semibold">Choose a plan</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Switching takes effect immediately; your current billing period doesn't change.
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {packages.map((p) => {
              const isCurrent = p.id === pkg.id;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "rounded-lg border p-3.5",
                    isCurrent ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">
                      {p.name} <span className="font-normal text-muted-foreground">{formatCurrency(Number(p.price_bdt))}/mo.</span>
                    </p>
                    {isCurrent ? <span className="text-[11px] font-medium text-primary">Current</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{formatTokens(p.included_tokens)} tokens/month included</p>
                  <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                  {!isCurrent ? (
                    <Button
                      size="sm"
                      className="mt-3"
                      disabled={busy}
                      onClick={() => void handleSelectPackage(p.id)}
                    >
                      Select {p.name}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
