"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/native-select";
import { Chip } from "@/components/configurator/admin/pcb-ui";
import { useCatalogAttributeProfiles } from "@/lib/api/use-catalog-attribute-profiles";
import { type FieldSource, updateFieldSource } from "@/lib/api/configurator-lookups";

/** Field Sources: which attribute (of which attribute profile) feeds each built-in builder field.
 * Nothing chosen = the default attribute, so the builder keeps working exactly as before. */
export function SmartPcBuilderFieldSources({ sources, onChanged }: { sources: FieldSource[]; onChanged: () => void | Promise<void> }) {
  const { profiles, groups, attributes } = useCatalogAttributeProfiles();
  const [pickedProfile, setPickedProfile] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  const activeProfiles = profiles.filter((p) => p.active);
  const profileIdFor = (src: FieldSource) =>
    pickedProfile[src.key] ?? src.attribute?.profile_id ?? profiles.find((p) => p.code === src.default_profile_code)?.id ?? "";

  const attributesFor = (src: FieldSource) => {
    const groupIds = new Set(groups.filter((g) => g.profileId === profileIdFor(src)).map((g) => g.id));
    return attributes.filter((a) => groupIds.has(a.groupId) && a.active && src.types.includes(a.fieldType as string));
  };

  const save = async (src: FieldSource, attributeId: string | null) => {
    setBusy(src.key);
    try {
      await updateFieldSource(src.key, attributeId);
      setPickedProfile((p) => {
        const next = { ...p };
        delete next[src.key];
        return next;
      });
      await onChanged();
      toast.success(attributeId ? `${src.label}: নতুন সোর্স সেভ হয়েছে` : `${src.label}: ডিফল্টে ফিরেছে`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "সেভ হয়নি");
    } finally {
      setBusy(null);
    }
  };

  const row = (src: FieldSource) => {
    const attrs = attributesFor(src);
    const current = src.attribute && attrs.some((a) => a.id === src.attribute!.id) ? src.attribute.id : "";
    const { filled, total } = src.coverage;
    const coverageCls =
      total === 0 || filled === 0
        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
        : filled < total
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    return (
      <div key={src.key} className="grid items-start gap-2 border-b border-border/60 px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
            {src.label}
            <Chip cls="bg-muted text-muted-foreground">{src.component}</Chip>
            {src.mode === "custom" && <Chip cls="bg-primary/15 text-primary">কাস্টম</Chip>}
          </div>
          {src.hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{src.hint}</p>}
          {src.mode === "missing" && (
            <p className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400">ডিফল্ট অ্যাট্রিবিউট ({src.default_code}) পাওয়া যায়নি, একটা বাছুন।</p>
          )}
        </div>
        <Select
          value={profileIdFor(src)}
          onChange={(e) => setPickedProfile((p) => ({ ...p, [src.key]: e.target.value }))}
          className="h-8 text-xs"
          aria-label={`${src.label} — attribute profile`}
          disabled={busy === src.key}
        >
          {!profileIdFor(src) && <option value="">প্রোফাইল বাছুন</option>}
          {activeProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <div className="grid gap-1">
          <Select
            value={current}
            onChange={(e) => e.target.value && void save(src, e.target.value)}
            className="h-8 text-xs"
            aria-label={`${src.label} — attribute`}
            disabled={busy === src.key}
          >
            <option value="">অ্যাট্রিবিউট বাছুন</option>
            {attrs.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.code}){src.mode !== "custom" && src.attribute?.id === a.id ? " — ডিফল্ট" : ""}
              </option>
            ))}
          </Select>
          {attrs.length === 0 && <span className="text-[11px] text-muted-foreground">এই প্রোফাইলে মানানসই ({src.types.join("/")}) অ্যাট্রিবিউট নেই।</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
          {src.attribute && (
            <Chip cls={coverageCls}>
              {total === 0 ? "প্রোডাক্ট নেই" : `${filled}/${total} প্রোডাক্টে মান আছে`}
            </Chip>
          )}
          {src.mode === "custom" && (
            <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" disabled={busy === src.key} onClick={() => void save(src, null)}>
              ডিফল্টে ফেরান
            </Button>
          )}
        </div>
      </div>
    );
  };

  const lookup = sources.filter((s) => s.group === "lookup");
  const more = sources.filter((s) => s.group !== "lookup");
  // Only a field the admin pointed somewhere is worth a warning: defaults often rely on values the builder reads from the product name.
  const lowCoverage = sources.filter((s) => s.mode === "custom" && s.attribute && s.coverage.total > 0 && s.coverage.filled === 0);

  return (
    <section className="rounded-none border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[15px] font-semibold">ফিল্ড সোর্স</h2>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
          বিল্ডারের কয়েকটা ফিল্ড (Chipset, CPU Socket, Generation…) কোন প্রোফাইলের কোন অ্যাট্রিবিউট থেকে মান নেবে, এখান থেকে বাছুন। কিছু না বাছলে ডিফল্ট অ্যাট্রিবিউট
          চলে। রুল, Lookup, Test Build আর স্টোরফ্রন্ট সবাই একই সোর্স ধরে।
        </p>
      </div>
      {lowCoverage.length > 0 && (
        <p className="border-b border-border bg-rose-500/5 px-4 py-2 text-xs text-rose-600 dark:text-rose-400">
          {lowCoverage.map((s) => s.label).join(", ")}: বাছাই করা অ্যাট্রিবিউটে কোনো প্রোডাক্টেই মান নেই। প্রোডাক্টের নিজের পুরনো মান (বা নাম থেকে ধরা মান) না থাকলে এই ফিল্ডের রুল স্কিপ হবে।
        </p>
      )}
      <div>{lookup.map(row)}</div>
      {more.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="w-full border-t border-border bg-muted/20 px-4 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showMore ? "▾" : "▸"} আরও ফিল্ড ({more.length}টি): RAM টাইপ, TDP, ওয়াটেজ, কেসিংয়ের মাপ…
          </button>
          {showMore && <div>{more.map(row)}</div>}
        </>
      )}
    </section>
  );
}
