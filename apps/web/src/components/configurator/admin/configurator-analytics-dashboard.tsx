"use client";

import { useEffect, useMemo } from "react";
import { BarChart3, GitBranch, TrendingDown, TrendingUp } from "lucide-react";
import { configuratorAnalyticsKpis, formatBdt } from "@/lib/mock-data/configurator-admin";
import { computeErpAnalytics } from "@/lib/configurator/erp/integration-service";
import { ERP_FUNNEL_LABELS } from "@/lib/configurator/erp/types";
import { useConfiguratorProfiles } from "@/lib/api/use-configurator-profiles";
import { useConfiguratorBuilds } from "@/lib/api/use-configurator-builds";
import { useConfiguratorTemplates } from "@/lib/api/use-configurator-templates";
import { useCompatibilityRuleStore } from "@/lib/store/compatibility-rule-store";
import { ConfiguratorAdminShell } from "@/components/configurator/admin/configurator-admin-shell";
import { Badge } from "@/components/ui/badge";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

export function ConfiguratorAnalyticsDashboard() {
  const { profiles, loading: profilesLoading } = useConfiguratorProfiles();
  const { builds, loading: buildsLoading } = useConfiguratorBuilds();
  const { templates, loading: templatesLoading } = useConfiguratorTemplates();
  const rules = useCompatibilityRuleStore((s) => s.rules);
  const rulesLoaded = useCompatibilityRuleStore((s) => s.loaded);
  const fetchRules = useCompatibilityRuleStore((s) => s.fetchRules);

  useEffect(() => {
    if (!rulesLoaded) void fetchRules();
  }, [rulesLoaded, fetchRules]);

  const loading = profilesLoading || buildsLoading || templatesLoading;

  const kpis = useMemo(
    () => configuratorAnalyticsKpis(profiles, builds, templates),
    [profiles, builds, templates],
  );

  const topTemplates = useMemo(
    () => [...templates].sort((a, b) => b.useCount - a.useCount).slice(0, 5),
    [templates],
  );

  const recentBuilds = useMemo(
    () => [...builds].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
    [builds],
  );

  const ruleStats = useMemo(() => ({
    active: rules.filter((r) => r.active).length,
    total: rules.length,
  }), [rules]);

  const erpAnalytics = useMemo(() => {
    const values = Object.fromEntries(builds.map((b) => [b.id, b.totalPrice]));
    return computeErpAnalytics(builds.map((b) => b.id), values);
  }, [builds]);

  const funnelSteps = [
    { key: "savedBuilds", label: "Saved builds", value: erpAnalytics.funnel.savedBuilds },
    { key: "leadsCreated", label: "Leads", value: erpAnalytics.funnel.leadsCreated },
    { key: "quotationsSent", label: "Quotations", value: erpAnalytics.funnel.quotationsSent },
    { key: "ordersConfirmed", label: "Orders", value: erpAnalytics.funnel.ordersConfirmed },
    { key: "invoicesPosted", label: "Invoices", value: erpAnalytics.funnel.invoicesPosted },
  ] as const;

  if (loading) {
    return (
      <ConfiguratorAdminShell
        workflow={["1. Monitor builds", "2. Track ERP funnel", "3. Rule violations", "4. Template performance", "5. Export reports"]}
        kpis={[]}
        search=""
        onSearchChange={() => {}}
      >
        <ContentDataSkeleton label="Loading analytics…" />
      </ConfiguratorAdminShell>
    );
  }

  return (
    <ConfiguratorAdminShell
      workflow={["1. Monitor builds", "2. Track ERP funnel", "3. Rule violations", "4. Template performance", "5. Export reports"]}
      kpis={kpis}
      search=""
      onSearchChange={() => {}}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-input bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-semibold">Top templates</h3>
          </div>
          <ul className="mt-3 space-y-2">
            {topTemplates.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-xs">
                <span>{t.name}</span>
                <Badge variant="secondary">{t.useCount} uses</Badge>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-input bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold">Compatibility rules</h3>
          </div>
          <p className="mt-2 text-2xl font-semibold">{ruleStats.active}</p>
          <p className="text-xs text-muted-foreground">{ruleStats.total} total rules · {builds.filter((b) => b.compatibilityStatus === "incompatible").length} blocked builds</p>
        </div>

        <div className="rounded-lg border border-input bg-card p-4 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-violet-600" />
            <h3 className="text-sm font-semibold">ERP conversion funnel</h3>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {erpAnalytics.funnel.conversionRate}% order conversion
            </Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {funnelSteps.map((step, i) => (
              <div key={step.key} className="flex min-w-[100px] flex-1 items-center gap-2 rounded-md border border-input bg-muted/10 px-3 py-2">
                <div>
                  <p className="text-[10px] text-muted-foreground">{step.label}</p>
                  <p className="text-lg font-semibold">{step.value}</p>
                </div>
                {i < funnelSteps.length - 1 && (
                  <span className="ml-auto text-muted-foreground">→</span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Pipeline value {formatBdt(erpAnalytics.funnel.totalPipelineValue)} · Avg build {formatBdt(erpAnalytics.funnel.avgBuildValue)}
          </p>
        </div>

        <div className="rounded-lg border border-input bg-card p-4 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-semibold">Recent saved builds</h3>
          <div className="mt-3 overflow-hidden rounded-md border border-input">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Build</th>
                  <th className="px-3 py-2 text-left">Profile</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {recentBuilds.map((b) => (
                  <tr key={b.id} className="border-t border-input">
                    <td className="px-3 py-2 font-medium">{b.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{b.profileName}</td>
                    <td className="px-3 py-2">
                      <Badge variant={b.compatibilityStatus === "compatible" ? "success" : "warning"} className="text-[10px] capitalize">
                        {b.compatibilityStatus}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">{formatBdt(b.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {erpAnalytics.recentEvents.length > 0 && (
          <div className="rounded-lg border border-input bg-card p-4 shadow-sm lg:col-span-2">
            <h3 className="text-sm font-semibold">Recent ERP events</h3>
            <ul className="mt-3 space-y-1">
              {erpAnalytics.recentEvents.map((ev, i) => (
                <li key={i} className="flex items-center justify-between text-xs">
                  <span>
                    <span className="font-medium capitalize">{ERP_FUNNEL_LABELS[ev.step as keyof typeof ERP_FUNNEL_LABELS] ?? ev.step}</span>
                    <span className="text-muted-foreground"> — {ev.buildCode}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">{ev.at.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg border border-input bg-card p-4 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-semibold">Profile performance</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {profiles.map((p) => (
              <div key={p.id} className="rounded-md border border-input bg-muted/10 p-3">
                <p className="text-xs font-medium">{p.name}</p>
                <p className="mt-1 text-lg font-semibold">{p.buildCount}</p>
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  builds
                  {p.buildCount > 50 ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-amber-600" />}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ConfiguratorAdminShell>
  );
}
