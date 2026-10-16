"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/native-select";
import { findCategory } from "@/lib/settings/settings-schema";
import type { SettingItemDef } from "@/lib/settings/types";
import { useSettingsStore } from "@/lib/store/settings-store";
import { loadCategorySettingsFromPlatform, syncCategorySettingsToPlatform } from "@/lib/api/business-settings-sync";

type Value = string | boolean | number;

const INVERTED_KEY = "pcbuilder.show_incompatible";

/** The General tab: what the customer's builder page does with incompatible, out-of-stock and
 * coming-soon parts, plus sorting, currency and the share link. Saved as platform settings
 * (pcbuilder.*); the storefront reads them with the profile. */
export function SmartPcBuilderGeneral() {
  const section = findCategory("business", "pcbuilder")?.sections.find((s) => s.id === "general");
  const items: SettingItemDef[] = useMemo(() => section?.groups.flatMap((g) => g.items) ?? [], [section]);
  const values = useSettingsStore((s) => s.values);
  const setValue = useSettingsStore((s) => s.setValue);
  const [draft, setDraft] = useState<Record<string, Value>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadCategorySettingsFromPlatform(items).then((remote) => {
      for (const [key, value] of Object.entries(remote)) setValue(key, value, { label: key, reason: "Synced from platform" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const current = (item: SettingItemDef): Value => (item.key in draft ? draft[item.key] : (values[item.key] ?? item.defaultValue ?? ""));
  const dirty = Object.keys(draft).length;
  const toggles = items.filter((i) => i.type === "toggle");
  const sort = items.find((i) => i.key === "pcbuilder.default_sort");
  const language = items.find((i) => i.key === "pcbuilder.language");

  const save = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(draft)) {
        const item = items.find((i) => i.key === key);
        if (item) setValue(key, value, { label: item.label });
      }
      await syncCategorySettingsToPlatform(items, { ...values, ...draft });
      setDraft({});
      toast.success("সেভ হয়েছে");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "সেভ হয়নি");
    } finally {
      setSaving(false);
    }
  };

  if (!section) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-3xl text-xs text-muted-foreground">
        কাস্টমারের বিল্ডার পেজে অমিল, স্টক-শেষ আর Coming soon প্রোডাক্ট কীভাবে দেখাবে — এখান থেকে ঠিক করুন। দাম স্টোরের মুদ্রা অনুযায়ীই দেখায়। সেভ করলেই স্টোরফ্রন্টে কাজ করবে।
      </p>
      <section className="rounded-none border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-[15px] font-semibold">General</h2>
        </div>
        <div className="grid gap-2 p-4">
          {language && (
            <label className="flex items-center justify-between gap-3 border border-border bg-muted/20 px-3 py-2.5">
              <span>
                <span className="block text-[13px] font-semibold" data-no-translate>{language.label}</span>
                {language.description && <span className="block text-xs text-muted-foreground">{language.description}</span>}
              </span>
              <Select value={String(current(language))} onChange={(e) => setDraft((d) => ({ ...d, [language.key]: e.target.value }))} className="h-8 w-40 text-xs" data-no-translate>
                {(language.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {toggles.map((item) => {
            // "show incompatible (greyed)" is stored, but the admin ticks "hide": the box is the inverse.
            const inverted = item.key === INVERTED_KEY;
            const stored = current(item) === true || String(current(item)) === "true";
            const on = inverted ? !stored : stored;
            return (
              <label key={item.key} className="flex cursor-pointer items-start gap-3 border border-border bg-muted/20 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setDraft((d) => ({ ...d, [item.key]: inverted ? !e.target.checked : e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block text-[13px] font-semibold">{item.label}</span>
                  {item.description && <span className="block text-xs text-muted-foreground">{item.description}</span>}
                </span>
              </label>
            );
          })}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {sort && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {sort.label}
                <Select value={String(current(sort))} onChange={(e) => setDraft((d) => ({ ...d, [sort.key]: e.target.value }))} className="h-8 w-44 text-xs">
                  {(sort.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            ডিফল্ট সর্ট সব স্লটে চলবে। কোনো স্লটের নিজস্ব সর্ট (Tabs &amp; Slots) দেওয়া থাকলে সেটাই আগে।
          </p>
        </div>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <Button size="sm" onClick={() => void save()} disabled={saving || dirty === 0}>
            {saving ? "সেভ হচ্ছে…" : dirty ? `সেভ করুন (${dirty})` : "সেভ করুন"}
          </Button>
        </div>
      </section>
    </div>
  );
}
