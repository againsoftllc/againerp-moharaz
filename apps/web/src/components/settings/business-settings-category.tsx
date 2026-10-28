"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import type { SettingItemDef } from "@/lib/settings/types";
import { findCategory } from "@/lib/settings/settings-schema";
import { BUSINESS_CATEGORY_THEME } from "@/lib/settings/settings-config";
import { useSettingsStore } from "@/lib/store/settings-store";
import { SettingsLayerNav } from "@/components/settings/settings-layer-nav";
import { SettingFieldRow } from "@/components/settings/setting-field-row";
import { ShippingDistrictRatesPanel } from "@/components/settings/shipping-district-rates-panel";
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatDateTime } from "@/lib/utils";

type Props = { categoryId: string; embedded?: boolean };

export function BusinessSettingsCategory({ categoryId, embedded = false }: Props) {
  const category = findCategory("business", categoryId);
  const values = useSettingsStore((s) => s.values);
  const history = useSettingsStore((s) => s.history);
  const setValue = useSettingsStore((s) => s.setValue);
  const resetCategory = useSettingsStore((s) => s.resetCategory);

  const [activeSection, setActiveSection] = useState("");
  const [draft, setDraft] = useState<Record<string, string | boolean | number>>({});
  const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const theme = BUSINESS_CATEGORY_THEME[categoryId];
  const Icon = theme?.icon;

  const allKeys = useMemo(() => {
    if (!category) return [] as string[];
    return category.sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.key)));
  }, [category]);

  useEffect(() => {
    setActiveSection(category?.sections[0]?.id ?? "");
    setDraft({});
    setReason("");
    setShowHistory(false);
  }, [categoryId, category]);

  useEffect(() => {
    if (categoryId !== "payments") return;
    void (async () => {
      try {
        const { loadPaymentSettingsFromPlatform } = await import(
          "@/lib/api/payment-checkout-settings"
        );
        const remote = await loadPaymentSettingsFromPlatform();
        for (const [key, value] of Object.entries(remote)) {
          if (typeof value === "boolean") {
            setValue(key, value, { label: key, reason: "Synced from platform" });
          }
        }
      } catch {
        /* keep local defaults */
      }
    })();
  }, [categoryId, setValue]);

  useEffect(() => {
    if (categoryId !== "shipping") return;
    void (async () => {
      try {
        const { loadShippingSettingsFromPlatform } = await import(
          "@/lib/api/shipping-checkout-settings"
        );
        // Tax lives in the same category screen as delivery.
        const { loadTaxSettingsFromPlatform } = await import("@/lib/api/tax-checkout-settings");
        const [shipping, tax] = await Promise.all([
          loadShippingSettingsFromPlatform(),
          loadTaxSettingsFromPlatform(),
        ]);
        for (const [key, value] of Object.entries({ ...shipping, ...tax })) {
          setValue(key, value, { label: key, reason: "Synced from platform" });
        }
      } catch {
        /* keep local defaults */
      }
    })();
  }, [categoryId, setValue]);

  useEffect(() => {
    if (categoryId !== "customers") return;
    void (async () => {
      try {
        const { loadAccountMenuSettingsFromPlatform } = await import(
          "@/lib/api/account-menu-settings"
        );
        const remote = await loadAccountMenuSettingsFromPlatform();
        for (const [key, value] of Object.entries(remote)) {
          setValue(key, value, { label: key, reason: "Synced from platform" });
        }
      } catch {
        /* keep local defaults */
      }
    })();
  }, [categoryId, setValue]);

  useEffect(() => {
    if (categoryId !== "store") return;
    void (async () => {
      try {
        const { loadSocialLinksFromPlatform } = await import("@/lib/api/social-links-settings");
        const remote = await loadSocialLinksFromPlatform();
        for (const [key, value] of Object.entries(remote)) {
          setValue(key, value, { label: key, reason: "Synced from platform" });
        }
      } catch {
        /* keep local defaults */
      }
    })();
  }, [categoryId, setValue]);

  useEffect(() => {
    if (categoryId !== "marketing") return;
    void (async () => {
      try {
        const { loadMarketingSettingsFromPlatform } = await import(
          "@/lib/api/marketing-checkout-settings"
        );
        const remote = await loadMarketingSettingsFromPlatform();
        for (const [key, value] of Object.entries(remote)) {
          if (typeof value === "boolean") {
            setValue(key, value, { label: key, reason: "Synced from platform" });
          }
        }
      } catch {
        /* keep local defaults — loyalty stays off */
      }
    })();
  }, [categoryId, setValue]);

  useEffect(() => {
    if (category?.sections[0] && !activeSection) {
      setActiveSection(category.sections[0].id);
    }
  }, [category, activeSection]);

  const current = (item: SettingItemDef) => {
    if (item.key in draft) return draft[item.key];
    return values[item.key] ?? item.defaultValue;
  };

  const patchDraft = (key: string, value: string | boolean | number) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const dirtyCount = Object.keys(draft).length;

  const handleSave = async () => {
    if (!category) return;
    const entries = Object.entries(draft);
    if (entries.length === 0) {
      toast.info("No changes to save");
      return;
    }
    for (const [key, value] of entries) {
      const item = category.sections
        .flatMap((s) => s.groups.flatMap((g) => g.items))
        .find((i) => i.key === key);
      if (item) setValue(key, value, { label: item.label, reason: reason || undefined });
    }
    // Persist payment method toggles so storefront checkout can filter gateways.
    if (categoryId === "payments") {
      try {
        const { syncPaymentSettingsToPlatform } = await import(
          "@/lib/api/payment-checkout-settings"
        );
        const merged: Record<string, string | boolean | number> = { ...values, ...draft };
        await syncPaymentSettingsToPlatform(merged);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to sync payment settings to API");
      }
    }
    // Persist delivery rates / zones / methods for storefront checkout.
    if (categoryId === "shipping") {
      try {
        const { syncShippingSettingsToPlatform } = await import(
          "@/lib/api/shipping-checkout-settings"
        );
        const merged: Record<string, string | boolean | number> = { ...values, ...draft };
        for (const item of category.sections.flatMap((s) => s.groups.flatMap((g) => g.items))) {
          if (!(item.key in merged)) {
            merged[item.key] = (values[item.key] ?? item.defaultValue) as string | boolean | number;
          }
        }
        const { syncTaxSettingsToPlatform } = await import("@/lib/api/tax-checkout-settings");
        await Promise.all([
          syncShippingSettingsToPlatform(merged),
          syncTaxSettingsToPlatform(merged),
        ]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to sync shipping settings to API");
      }
    }
    // Persist which sections the storefront customer panel renders.
    if (categoryId === "customers") {
      try {
        const { syncAccountMenuSettingsToPlatform } = await import(
          "@/lib/api/account-menu-settings"
        );
        await syncAccountMenuSettingsToPlatform({ ...values, ...draft });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to sync customer panel menu to API",
        );
      }
    }
    // Persist the public social profile URLs the storefront links to.
    if (categoryId === "store") {
      try {
        const { syncSocialLinksToPlatform } = await import("@/lib/api/social-links-settings");
        await syncSocialLinksToPlatform({ ...values, ...draft });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to sync social links to API");
      }
    }
    if (categoryId === "marketing") {
      try {
        const { syncMarketingSettingsToPlatform } = await import(
          "@/lib/api/marketing-checkout-settings"
        );
        const merged: Record<string, string | boolean | number> = { ...values, ...draft };
        for (const item of category.sections.flatMap((s) => s.groups.flatMap((g) => g.items))) {
          if (item.key.startsWith("marketing.") && !(item.key in merged)) {
            merged[item.key] = (values[item.key] ?? item.defaultValue) as string | boolean | number;
          }
        }
        await syncMarketingSettingsToPlatform(merged);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to sync marketing settings to API");
      }
    }
    setDraft({});
    setReason("");
    toast.success("Settings saved");
  };

  const handleReset = () => {
    resetCategory(allKeys);
    setDraft({});
    toast.success("Category reset to defaults");
  };

  const categoryHistory = history.filter((h) => allKeys.includes(h.key)).slice(0, 20);
  const activeSectionDef = category?.sections.find((s) => s.id === activeSection);

  if (!category) {
    return (
      <div className="rounded-none border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium">Settings category not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2 rounded-none">
          <Link href="/website/settings/checkout">Back to Settings</Link>
        </Button>
      </div>
    );
  }

  const sectionNav = category.sections.length > 1 && (
    <ul
      className={cn(
        "flex flex-wrap gap-0.5 rounded-none border border-border bg-card p-1",
        !embedded && "lg:flex-col",
      )}
    >
      {category.sections.map((section) => {
        const itemCount = section.groups.reduce((n, g) => n + g.items.length, 0);
        return (
          <li key={section.id} className={embedded ? undefined : "w-full"}>
            <button
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "flex items-center justify-between rounded-none px-3 py-2 text-left text-xs transition-colors",
                embedded ? "gap-3" : "w-full",
                activeSection === section.id
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <span>{section.title}</span>
              <span className="text-[10px] tabular-nums opacity-70">{itemCount}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const fields = activeSectionDef ? (
    <>
      <div className="rounded-none border border-border bg-card p-3">
        <label className="block text-xs font-medium text-muted-foreground">Change reason (optional)</label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Business requirement, seasonal policy…"
          className="mt-1.5 h-9 rounded-none text-xs"
        />
      </div>

      {activeSectionDef.groups.map((group) => (
        <div key={group.id} className="overflow-hidden rounded-none border border-border bg-card">
          <div className="border-b border-border bg-muted/40 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
          </div>
          <div>
            {group.items
              .filter((item) => item.key !== "shipping.district_rates")
              .map((item) => (
                <SettingFieldRow
                  key={item.key}
                  item={item}
                  value={current(item)}
                  dirty={item.key in draft}
                  onChange={(v) => patchDraft(item.key, v)}
                />
              ))}
          </div>
        </div>
      ))}

      {categoryId === "shipping" && activeSection === "delivery" && (
        <ShippingDistrictRatesPanel
          zonesText={String(
            current({
              key: "shipping.zones",
              label: "Checkout Districts",
              type: "textarea",
              defaultValue: "Dhaka,Chattogram,Khulna,Rajshahi,Sylhet,Barishal,Rangpur,Mymensingh",
            }),
          )}
          ratesJson={String(
            current({
              key: "shipping.district_rates",
              label: "District Rates",
              type: "textarea",
              defaultValue: "{}",
            }),
          )}
          defaultRate={Number(
            current({
              key: "shipping.rate_default",
              label: "Default",
              type: "number",
              defaultValue: 120,
            }),
          )}
          onChangeRates={(json) => patchDraft("shipping.district_rates", json)}
        />
      )}
    </>
  ) : null;

  return (
    <div className="relative pb-20">
      {!embedded ? <SettingsLayerNav compact /> : null}

      <div className={cn("flex flex-wrap items-start justify-between gap-3", !embedded && "mt-4")}>
        <div className="flex items-start gap-3">
          {!embedded && Icon ? (
            <div className={cn("rounded-none p-2.5", theme.iconBg)}>
              <Icon className={cn("h-5 w-5", theme.accent)} />
            </div>
          ) : null}
          <div>
            {!embedded ? (
              <Link
                href="/website/settings/checkout"
                className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Settings
              </Link>
            ) : null}
            {embedded ? (
              <>
                <p className="text-sm font-semibold">{category.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{category.description}</p>
              </>
            ) : (
              <>
                <h1 className="page-title">{category.title}</h1>
                <p className="page-subtitle">{category.description}</p>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActivityTriggerButton
            entity={{
              type: "settings",
              id: `business:${categoryId}`,
              label: `${category.title} Settings`,
            }}
          />
          <Button variant="outline" size="sm" className="rounded-none" onClick={() => setShowHistory(!showHistory)}>
            <History className="mr-1.5 h-3.5 w-3.5" /> History
          </Button>
          <Button variant="outline" size="sm" className="rounded-none" onClick={handleReset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
        </div>
      </div>

      {showHistory && (
        <div className="mt-4 rounded-none border border-border bg-muted/20 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change History</p>
          {categoryHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {categoryHistory.map((h) => (
                <li key={h.id} className="rounded-none border border-border bg-card px-3 py-2 text-[11px]">
                  <p className="font-semibold">{h.label}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    <span className="line-through">{String(h.oldValue)}</span>
                    {" → "}
                    <span className="font-medium text-foreground">{String(h.newValue)}</span>
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {h.changedBy} · {formatDateTime(h.at)}
                    {h.reason ? ` · ${h.reason}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {embedded ? (
        <div className="mt-4 space-y-4">
          {sectionNav}
          {fields}
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[220px_1fr]">
          <nav className="lg:sticky lg:top-4 lg:self-start">
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sections
            </p>
            {sectionNav}
          </nav>
          <div className="min-w-0 space-y-4">{fields}</div>
        </div>
      )}

      {dirtyCount > 0 && (
        <div className="settings-save-bar print-hide fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{dirtyCount}</span> unsaved change
              {dirtyCount !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-none" onClick={() => setDraft({})}>
                Discard
              </Button>
              <Button size="sm" className="rounded-none" onClick={handleSave}>
                <Save className="mr-1.5 h-3.5 w-3.5" /> Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
