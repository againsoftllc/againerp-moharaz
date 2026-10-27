"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  type Company,
  type ModuleInfo,
  type SubscriptionPlan,
  activateCompany,
  getCompany,
  impersonateCompany,
  listModules,
  listPlans,
  suspendCompany,
  updateCompany,
} from "@/lib/api/super-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CompanyAiBillingSection } from "@/components/super-admin/company-ai-billing-section";

const STATUS_VARIANT: Record<Company["status"], "success" | "warning" | "outline" | "muted"> = {
  active: "success",
  trialing: "warning",
  suspended: "outline",
  cancelled: "muted",
};

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function CompanyDetailPanel({
  companyId,
  onOpenChange,
  onChanged,
}: {
  companyId: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [company, setCompany] = useState<Company | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const [name, setName] = useState("");
  const [planId, setPlanId] = useState("");
  const [trialEndsAt, setTrialEndsAt] = useState("");
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState("");
  const [enabledModules, setEnabledModules] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getCompany(companyId), listPlans(), listModules()])
      .then(([c, p, m]) => {
        if (cancelled) return;
        setCompany(c);
        setPlans(p);
        setModules(m);
        setName(c.name);
        setPlanId(c.plan_id ?? "");
        setTrialEndsAt(toDateInputValue(c.trial_ends_at));
        setSubscriptionEndsAt(toDateInputValue(c.subscription_ends_at));
        setEnabledModules(c.enabled_modules ? new Set(c.enabled_modules) : null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load company");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const refresh = async () => {
    if (!companyId) return;
    const c = await getCompany(companyId);
    setCompany(c);
    onChanged?.();
  };

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    try {
      await updateCompany(companyId, {
        name,
        plan_id: planId || null,
        trial_ends_at: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
        subscription_ends_at: subscriptionEndsAt ? new Date(subscriptionEndsAt).toISOString() : null,
      });
      toast.success("Company updated");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSuspend = async () => {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    try {
      await suspendCompany(companyId, reason || undefined);
      setReason("");
      toast.success("Company suspended");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to suspend");
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    try {
      await activateCompany(companyId);
      toast.success("Company activated");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate");
    } finally {
      setSaving(false);
    }
  };

  const toggleModule = (moduleId: string) => {
    setEnabledModules((prev) => {
      // First toggle from "all enabled" (null) starts from the full set.
      const base = prev ?? new Set(modules.map((m) => m.id));
      const next = new Set(base);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  const saveModules = async () => {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    try {
      await updateCompany(companyId, {
        enabled_modules: enabledModules ? Array.from(enabledModules) : modules.map((m) => m.id),
      });
      toast.success("Module access updated");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save module access");
    } finally {
      setSaving(false);
    }
  };

  const resetModules = () => setEnabledModules(null);

  const handleImpersonate = async () => {
    if (!companyId) return;
    setImpersonating(true);
    setError(null);
    // Open the tab synchronously (within the click's user-activation window) so
    // browsers don't block it — we redirect it once the token comes back.
    const newTab = window.open("about:blank", "_blank", "noopener,noreferrer");
    try {
      const res = await impersonateCompany(companyId);
      const authState = {
        state: {
          user: res.user,
          token: res.token,
          expiresAt: res.expires_at,
          permissions: res.permissions,
        },
        version: 0,
      };
      window.localStorage.setItem("againerp-admin-auth", JSON.stringify(authState));
      if (newTab) {
        newTab.location.href = "/dashboard";
        toast.success(`Opened ${res.user.name}'s admin panel in a new tab`);
      } else {
        toast.error("Pop-up blocked — allow pop-ups for this site and try again");
      }
    } catch (err) {
      newTab?.close();
      setError(err instanceof Error ? err.message : "Failed to log in as this company");
    } finally {
      setImpersonating(false);
    }
  };

  return (
    <Sheet open={!!companyId} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title="Company details"
        resizable
        closeButton="inside"
        className="w-[420px] min-w-[360px] max-w-[560px] gap-0 overflow-y-auto rounded-none p-0"
      >
        {loading || !company ? (
          <div className="p-6 text-sm text-muted-foreground">
            {error ?? "Loading…"}
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-6 pb-10">
            <div className="flex items-start justify-between gap-2 pr-6">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{company.name}</h2>
                <p className="truncate text-xs text-muted-foreground">{company.slug}</p>
              </div>
              <Badge variant={STATUS_VARIANT[company.status]}>{company.status}</Badge>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="space-y-3 border p-4">
              <h3 className="text-sm font-semibold">Manage</h3>
              <p className="text-xs text-muted-foreground">
                Sign in as this company&apos;s owner without a password — opens in a new tab, useful
                for support.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleImpersonate()}
                disabled={impersonating}
              >
                {impersonating ? "Opening…" : "Log in as this company"}
              </Button>
            </div>

            <div className="space-y-4 border p-4">
              <h3 className="text-sm font-semibold">Details</h3>
              <div className="space-y-2">
                <Label htmlFor="cd-name">Company name</Label>
                <Input id="cd-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cd-plan">Plan</Label>
                <select
                  id="cd-plan"
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  className="h-8 w-full border border-input bg-background px-2 text-xs"
                >
                  <option value="">No plan</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cd-trial">Trial ends</Label>
                  <Input
                    id="cd-trial"
                    type="date"
                    value={trialEndsAt}
                    onChange={(e) => setTrialEndsAt(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cd-sub">Subscription ends</Label>
                  <Input
                    id="cd-sub"
                    type="date"
                    value={subscriptionEndsAt}
                    onChange={(e) => setSubscriptionEndsAt(e.target.value)}
                  />
                </div>
              </div>
              <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>

            <div className="space-y-3 border p-4">
              <h3 className="text-sm font-semibold">Module access</h3>
              <p className="text-xs text-muted-foreground">
                Uncheck a module to hide it from this company&apos;s admin sidebar. Nothing checked
                off means every module is available.
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {modules.map((m) => {
                  const checked = enabledModules ? enabledModules.has(m.id) : true;
                  return (
                    <label key={m.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleModule(m.id)}
                        className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                      />
                      <span>{m.label}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => void saveModules()} disabled={saving}>
                  {saving ? "Saving…" : "Save module access"}
                </Button>
                <Button size="sm" variant="outline" onClick={resetModules} disabled={saving}>
                  Enable all
                </Button>
              </div>
            </div>

            <CompanyAiBillingSection companyId={company.id} />

            <div className="space-y-3 border p-4">
              <h3 className="text-sm font-semibold">Subscription status</h3>
              {company.status === "suspended" ? (
                <div className="space-y-2">
                  {company.suspended_reason ? (
                    <p className="text-xs text-muted-foreground">
                      Suspended reason: {company.suspended_reason}
                    </p>
                  ) : null}
                  <Button onClick={() => void handleActivate()} disabled={saving} variant="secondary" size="sm">
                    Reactivate company
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="cd-reason">Suspend reason (optional)</Label>
                  <Input
                    id="cd-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. payment overdue"
                  />
                  <Button onClick={() => void handleSuspend()} disabled={saving} variant="destructive" size="sm">
                    Suspend company
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
