"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BUSINESS_CONFIG_TABS,
  businessGeneralTabs,
  businessSettingsHref,
  categoryItemCount,
  parseBusinessSettingsTab,
  type BusinessSettingsTabId,
} from "@/lib/settings/business-settings-tabs";
import {
  getLocalisationResource,
  LOCALISATION_RESOURCES,
  type LocalisationResourceId,
} from "@/lib/localisation/resources";
import { BusinessSettingsCategory } from "@/components/settings/business-settings-category";
import { LocalisationListPage } from "@/components/localisation/localisation-list-page";
import { WorkspaceUsersPanel } from "@/components/workspace/workspace-users-panel";

function tabButtonClass(active: boolean) {
  return cn(
    "flex w-full items-center justify-between rounded-none px-3 py-2 text-left text-xs transition-colors",
    active
      ? "bg-primary/10 font-semibold text-primary"
      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
  );
}

export function BusinessSettingsHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseBusinessSettingsTab(searchParams.get("tab"));
  const locParam = searchParams.get("loc");
  const locResource = getLocalisationResource(locParam ?? "store-locations") ?? LOCALISATION_RESOURCES[0]!;
  const generalTabs = useMemo(() => businessGeneralTabs(), []);

  const setTab = useCallback(
    (id: BusinessSettingsTabId, loc?: LocalisationResourceId) => {
      router.replace(businessSettingsHref(id, loc), { scroll: false });
    },
    [router],
  );

  const isCategoryTab =
    activeTab !== "localisation" && activeTab !== "permission";

  return (
    <div className="relative mx-auto w-full max-w-none px-0 pb-8 sm:px-0">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Store configuration, localisation, payments, shipping, notifications, and permissions.
        </p>
      </div>

      <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(9rem,13.75rem)_minmax(0,1fr)]">
        <nav className="lg:sticky lg:top-4 lg:self-start space-y-4">
          <div>
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              General
            </p>
            <ul className="space-y-0.5 rounded-none border border-border bg-card p-1">
              {generalTabs.map((tab) => (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => setTab(tab.id)}
                    className={tabButtonClass(activeTab === tab.id)}
                  >
                    <span>{tab.title}</span>
                    <span className="text-[10px] tabular-nums opacity-70">{tab.itemCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Configuration
            </p>
            <ul className="space-y-0.5 rounded-none border border-border bg-card p-1">
              {BUSINESS_CONFIG_TABS.map((tab) => {
                const count =
                  tab.id === "payments" || tab.id === "shipping" || tab.id === "notifications"
                    ? categoryItemCount(tab.id)
                    : null;
                return (
                  <li key={tab.id}>
                    <button
                      type="button"
                      onClick={() => setTab(tab.id)}
                      className={tabButtonClass(activeTab === tab.id)}
                    >
                      <span>{tab.title}</span>
                      {count != null ? (
                        <span className="text-[10px] tabular-nums opacity-70">{count}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <div className="min-w-0 max-w-full overflow-hidden">
          {isCategoryTab ? (
            <BusinessSettingsCategory key={activeTab} categoryId={activeTab} embedded />
          ) : null}

          {activeTab === "localisation" ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Localisation</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Languages, currencies, countries, and status labels used across the store.
                </p>
              </div>
              <div className="flex flex-wrap gap-1 rounded-none border border-border bg-card p-1">
                {LOCALISATION_RESOURCES.map((resource) => (
                  <button
                    key={resource.id}
                    type="button"
                    onClick={() => setTab("localisation", resource.id)}
                    className={cn(
                      "rounded-none px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                      locResource.id === resource.id
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {resource.title}
                  </button>
                ))}
              </div>
              <LocalisationListPage key={locResource.id} resource={locResource} hideNav />
            </div>
          ) : null}

          {activeTab === "permission" ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Permission</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Manage workspace users and jump to roles.
                </p>
              </div>
              <WorkspaceUsersPanel embedded />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
