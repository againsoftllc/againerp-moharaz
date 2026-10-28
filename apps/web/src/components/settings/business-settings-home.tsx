"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BUSINESS_CONFIG_TABS,
  businessGeneralTabs,
  businessSettingsHref,
  categoryItemCount,
  MOVED_BUSINESS_TABS,
  parseBusinessSettingsTab,
  type BusinessSettingsTabId,
} from "@/lib/settings/business-settings-tabs";
import { BusinessSettingsCategory } from "@/components/settings/business-settings-category";

function tabButtonClass(active: boolean) {
  return cn(
    "flex w-full items-center justify-between rounded-none px-3 py-2 text-left text-xs transition-colors",
    active
      ? "bg-primary/10 font-semibold text-primary"
      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
  );
}

/**
 * Configuration › Customers, Payments & Shipping: the three settings groups the ERP reads. (Store, Catalog, Orders, Checkout,
 * Marketing, SEO and Email / SMS held values nothing consumed; Localisation and Permission moved to Company and Users & Roles.)
 */
export function BusinessSettingsHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab = parseBusinessSettingsTab(rawTab);
  const generalTabs = useMemo(() => businessGeneralTabs(), []);

  // old links (?tab=permission, ?tab=localisation) land on the page that now holds them
  const movedTo = rawTab ? MOVED_BUSINESS_TABS[rawTab] : undefined;
  useEffect(() => {
    if (movedTo) router.replace(movedTo);
  }, [movedTo, router]);

  const setTab = useCallback(
    (id: BusinessSettingsTabId) => {
      router.replace(businessSettingsHref(id), { scroll: false });
    },
    [router],
  );

  return (
    <div className="relative mx-auto w-full max-w-none px-0 pb-8 sm:px-0">
      <div>
        <h1 className="page-title">Customers, Payments & Shipping</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          How customer accounts behave, which payment methods are offered and how orders are delivered.
        </p>
      </div>

      <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(9rem,13.75rem)_minmax(0,1fr)]">
        <nav className="lg:sticky lg:top-4 lg:self-start">
          <ul className="space-y-0.5 rounded-none border border-border bg-card p-1">
            {generalTabs.map((tab) => (
              <li key={tab.id}>
                <button type="button" onClick={() => setTab(tab.id)} className={tabButtonClass(activeTab === tab.id)}>
                  <span>{tab.title}</span>
                  <span className="text-[10px] tabular-nums opacity-70">{tab.itemCount}</span>
                </button>
              </li>
            ))}
            {BUSINESS_CONFIG_TABS.map((tab) => (
              <li key={tab.id}>
                <button type="button" onClick={() => setTab(tab.id)} className={tabButtonClass(activeTab === tab.id)}>
                  <span>{tab.title}</span>
                  <span className="text-[10px] tabular-nums opacity-70">{categoryItemCount(tab.id)}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 max-w-full overflow-hidden">
          <BusinessSettingsCategory key={activeTab} categoryId={activeTab} embedded />
        </div>
      </div>
    </div>
  );
}
