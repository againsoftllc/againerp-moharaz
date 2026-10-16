"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import type { SettingItemDef, SettingsLayer } from "@/lib/settings/types";
import { SETTINGS_LAYER_META, findCategory } from "@/lib/settings/settings-schema";
import { useSettingsStore } from "@/lib/store/settings-store";
import { SettingsLayerNav } from "@/components/settings/settings-layer-nav";
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingFieldRow } from "@/components/settings/setting-field-row";
import { formatDateTime } from "@/lib/utils";

type Props = { layer: SettingsLayer; categoryId: string };

export function SettingsCategoryWorkspace({ layer, categoryId }: Props) {
  const category = findCategory(layer, categoryId);
  const meta = SETTINGS_LAYER_META[layer];
  const values = useSettingsStore((s) => s.values);
  const history = useSettingsStore((s) => s.history);
  const setValue = useSettingsStore((s) => s.setValue);
  const resetCategory = useSettingsStore((s) => s.resetCategory);

  const [draft, setDraft] = useState<Record<string, string | boolean | number>>({});
  const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const allKeys = useMemo(() => {
    if (!category) return [] as string[];
    return category.sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.key)));
  }, [category]);

  const current = (item: SettingItemDef) => {
    if (item.key in draft) return draft[item.key];
    return values[item.key] ?? item.defaultValue;
  };

  const patchDraft = (key: string, value: string | boolean | number) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const handleSave = () => {
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

  if (!category) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">Settings category not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href={meta.basePath}>Back to {meta.title}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingsLayerNav compact />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={meta.basePath}
            className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {meta.title}
          </Link>
          <h1 className="page-title">{category.title}</h1>
          <p className="page-subtitle">{category.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActivityTriggerButton
            entity={{
              type: "settings",
              id: `${layer}:${categoryId}`,
              label: `${category.title} Settings`,
            }}
          />
          <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
            <History className="mr-1.5 h-3.5 w-3.5" /> History
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={Object.keys(draft).length === 0}>
            <Save className="mr-1.5 h-3.5 w-3.5" /> Save Changes
          </Button>
        </div>
      </div>

      {showHistory && (
        <div className="rounded-lg border border-input bg-muted/20 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change History</p>
          {categoryHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {categoryHistory.map((h) => (
                <li key={h.id} className="rounded-md border border-input bg-card px-3 py-2 text-[11px]">
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

      <div className="rounded-lg border border-input bg-card p-3">
        <label className="block text-xs font-medium text-muted-foreground">Change reason (optional)</label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Business requirement, seasonal policy…"
          className="mt-1 h-8 text-xs"
        />
      </div>

      <div className="space-y-6">
        {category.sections.map((section) => (
          <section key={section.id}>
            <h2 className="mb-3 text-sm font-semibold text-foreground">{section.title}</h2>
            <div className="space-y-4">
              {section.groups.map((group) => (
                <div key={group.id} className="rounded-xl border border-input bg-card shadow-sm">
                  <div className="border-b border-input px-4 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.title}
                    </p>
                  </div>
                  <div className="divide-y divide-input">
                    {group.items.map((item) => (
                      <SettingFieldRow
                        key={item.key}
                        item={item}
                        value={current(item)}
                        dirty={item.key in draft}
                        compact
                        onChange={(v) => patchDraft(item.key, v)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
