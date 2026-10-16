"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Settings } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  workspaceDashboardItem,
  workspaceNavItems,
} from "@/lib/workspace/navigation-config";
import {
  isToggleableModuleId,
  useModuleSettingsStore,
} from "@/lib/store/module-settings-store";
import { isCenterManagedModule } from "@/lib/center/entitlements";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { moduleSettingsHref } from "@/lib/workspace/module-settings-href";

const MODULE_DESCRIPTIONS: Record<string, string> = {
  dashboard: "Home overview — always available",
  catalog: "Products, categories, brands, attributes, and reviews",
  inventory: "Stock, warehouses, serials, counts, and movements",
  purchase: "RFQs, quotations, orders, receipts, and supplier bills",
  rma: "Return merchandise authorizations and replacements",
  service: "Service tickets, jobs, and after-sales work",
  vendors: "Vendor directory and related records",
  ai: "AI chat workspace — ask Aladin about customers, orders, stock, and finance",
  dropshipping: "Dropship products, sourcing, and supplier sync",
  hrm: "Employees, attendance, leave, and payroll",
  blog: "Articles, categories, and comments",
  website: "Website pages, menus, and live edit",
  media: "Media library — images, videos, and documents",
  sales: "Orders, quotations, and invoicing",
  pos: "Point of sale terminals and retail checkout",
  finance: "Payments, cash, and financial operations",
  accounting: "Ledgers, journals, and accounting reports",
  crm: "Leads, opportunities, and pipeline",
  customers: "Customer profiles and accounts",
  workspace: "Modules, plugins, sites, and media — always available",
};

const ALWAYS_ON_MODULE_IDS = new Set(["dashboard", "workspace"]);

export default function ModulesPage() {
  const enabled = useModuleSettingsStore((s) => s.enabled);
  const setModuleEnabled = useModuleSettingsStore((s) => s.setModuleEnabled);
  const applyCenterEntitlements = useModuleSettingsStore((s) => s.applyCenterEntitlements);
  const centerBound = useModuleSettingsStore((s) => s.centerBound);
  const centerPlan = useModuleSettingsStore((s) => s.centerPlan);
  const centerClientName = useModuleSettingsStore((s) => s.centerClientName);
  const centerError = useModuleSettingsStore((s) => s.centerError);
  const canWrite = useAdminCanWrite();

  const [bootstrapToken, setBootstrapToken] = useState("");
  const [activateBusy, setActivateBusy] = useState(false);
  const [activateMsg, setActivateMsg] = useState<string | null>(null);
  const [activateErr, setActivateErr] = useState<string | null>(null);

  const modules = [
    workspaceDashboardItem,
    ...workspaceNavItems.filter(
      (item) => isToggleableModuleId(item.id) || ALWAYS_ON_MODULE_IDS.has(item.id),
    ),
  ];

  async function connectCenter() {
    setActivateBusy(true);
    setActivateMsg(null);
    setActivateErr(null);
    try {
      const res = await fetch("/api/center/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrap_token: bootstrapToken.trim() }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        detail?: string;
        client_slug?: string;
        plan?: string;
        note?: string;
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.detail || "Activation failed");
      }
      setActivateMsg(
        `Bound as ${body.client_slug || "client"}${body.plan ? ` · ${body.plan}` : ""}. ${body.note || ""}`,
      );
      setBootstrapToken("");
      const ent = await fetch("/api/center/entitlements", { cache: "no-store" });
      const entBody = (await ent.json()) as {
        bound?: boolean;
        error?: boolean;
        detail?: string;
        data?: import("@/lib/center/entitlements").CenterEntitlements;
      };
      if (entBody.bound && entBody.data && !entBody.error) {
        applyCenterEntitlements({ bound: true, data: entBody.data, error: null });
      } else if (entBody.bound && entBody.error) {
        applyCenterEntitlements({
          bound: true,
          error: entBody.detail || "Sync issue after activate",
        });
      }
    } catch (e) {
      setActivateErr(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setActivateBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-2.75rem-1.5rem)] flex-col lg:min-h-[calc(100vh-2.75rem-2rem)]">
      <div className="mb-3 shrink-0">
        <h1 className="page-title">Modules</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {centerBound
            ? "Center-managed modules follow your AgainERP Center plan. Local-only modules can still be toggled here."
            : "Enable or disable workspace modules. Open Settings on a row to configure that module."}
        </p>
        {centerBound ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="rounded-none">
              Center
            </Badge>
            <span>
              {centerClientName || "Client"}
              {centerPlan ? ` · ${centerPlan}` : ""}
            </span>
            {centerError ? (
              <span className="text-destructive">Sync issue: {centerError}</span>
            ) : null}
          </p>
        ) : (
          <div className="mt-3 max-w-3xl space-y-2 rounded-none border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium">Connect Center (first-boot)</p>
            <p className="text-[11px] text-muted-foreground">
              Paste the one-time bootstrap token from Center registration approval (starts with{" "}
              <span className="font-mono">bst_</span>).
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={bootstrapToken}
                onChange={(e) => setBootstrapToken(e.target.value)}
                placeholder="bst_…"
                className="h-9 max-w-md rounded-none font-mono text-xs"
              />
              <Button
                size="sm"
                className="rounded-none"
                disabled={!canWrite || activateBusy || !bootstrapToken.trim()}
                onClick={() => void connectCenter()}
              >
                {activateBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Activate
              </Button>
            </div>
            {activateMsg ? (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">{activateMsg}</p>
            ) : null}
            {activateErr ? <p className="text-[11px] text-destructive">{activateErr}</p> : null}
          </div>
        )}
      </div>
      <div className="grid max-w-3xl gap-2">
        {modules.map((module) => {
          const moduleId = module.id;
          const alwaysOn = ALWAYS_ON_MODULE_IDS.has(moduleId);
          if (!alwaysOn && !isToggleableModuleId(moduleId)) return null;
          const Icon = module.icon;
          const managed = !alwaysOn && centerBound && isCenterManagedModule(moduleId);
          const checked = alwaysOn
            ? true
            : isToggleableModuleId(moduleId)
              ? (enabled[moduleId] ?? true)
              : true;
          const settingsHref = moduleSettingsHref(moduleId);
          return (
            <div key={moduleId} className="flex items-center gap-3">
              {Icon ? (
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : null}
              <div className="min-w-0 flex-1">
                <Switch
                  label={module.title}
                  description={
                    managed
                      ? `${MODULE_DESCRIPTIONS[moduleId]} · Managed by Center`
                      : MODULE_DESCRIPTIONS[moduleId]
                  }
                  checked={checked}
                  onCheckedChange={(next) => {
                    if (alwaysOn || !isToggleableModuleId(moduleId)) return;
                    setModuleEnabled(moduleId, next);
                  }}
                  disabled={!canWrite || managed || alwaysOn}
                />
              </div>
              {settingsHref ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-none px-2"
                >
                  <Link href={settingsHref} aria-label={`${module.title} settings`}>
                    <Settings className="h-3.5 w-3.5" />
                    Settings
                  </Link>
                </Button>
              ) : null}
              {alwaysOn ? (
                <Badge variant="outline" className="rounded-none shrink-0">
                  Always on
                </Badge>
              ) : managed ? (
                <Badge variant="outline" className="rounded-none shrink-0">
                  Center
                </Badge>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
