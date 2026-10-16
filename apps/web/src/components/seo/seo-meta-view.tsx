"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { SeoStatBar } from "@/components/seo/seo-stat-bar";
import { fetchSeoMeta, updateSeoMeta, type ApiSeoMeta } from "@/lib/api/seo-meta";
import {
  ENTITY_TYPE_LABELS,
  SCHEMA_TYPES,
  type SchemaType,
  type SeoEntityType,
} from "@/lib/mock-data/seo";

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

function scoreTone(score: number): string {
  if (score >= 80) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400";
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Counts down to the length search engines will actually show. */
function LengthHint({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return (
    <span className={cn("text-[11px] tabular-nums", over ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
      {value.length}/{max}
    </span>
  );
}

function MetaDrawer({
  open,
  onOpenChange,
  row,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ApiSeoMeta | null;
  onSaved?: () => void;
}) {
  const [metaTitle, setMetaTitle] = useState(row?.meta_title ?? "");
  const [metaDescription, setMetaDescription] = useState(row?.meta_description ?? "");
  const [ogImage, setOgImage] = useState(row?.og_image ?? "");
  const [canonicalUrl, setCanonicalUrl] = useState(row?.canonical_url ?? "");
  const [indexable, setIndexable] = useState(row?.indexable ?? true);
  const [schemaType, setSchemaType] = useState<SchemaType>(
    (row?.schema_type as SchemaType) ?? "WebPage",
  );
  const [saving, setSaving] = useState(false);

  if (!row) return null;

  const save = async () => {
    setSaving(true);
    try {
      await updateSeoMeta(row.id, {
        meta_title: metaTitle,
        meta_description: metaDescription,
        og_image: ogImage || null,
        canonical_url: canonicalUrl || null,
        indexable,
        schema_type: schemaType,
      });
      toast.success(`${row.title} saved`);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the meta tags");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[460px] flex-col gap-0 overflow-y-auto">
        <div className="border-b border-border pb-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {ENTITY_TYPE_LABELS[row.entity_type as SeoEntityType] ?? row.entity_type}
          </p>
          <h3 className="mt-0.5 truncate text-sm font-semibold">{row.title}</h3>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{row.url}</p>
        </div>

        {/* What the result actually looks like on a search page. */}
        <div className="mt-3 border border-border bg-muted/30 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Search preview
          </p>
          <p className="mt-1.5 truncate text-[13px] text-sky-700 dark:text-sky-400">
            {metaTitle || row.title}
          </p>
          <p className="truncate text-[11px] text-emerald-700 dark:text-emerald-500">{row.url}</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {metaDescription || "No description — search engines will invent one from the page."}
          </p>
        </div>

        <div className="flex-1 space-y-4 py-4">
          <Field label="Meta title">
            <Input
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              className="rounded-none text-[12px]"
            />
            <LengthHint value={metaTitle} max={TITLE_MAX} />
          </Field>

          <Field label="Meta description">
            <Textarea
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              rows={3}
              className="rounded-none text-[12px]"
            />
            <LengthHint value={metaDescription} max={DESCRIPTION_MAX} />
          </Field>

          <Field label="Social image" hint="1200×630px renders best when the page is shared.">
            <Input
              value={ogImage}
              onChange={(e) => setOgImage(e.target.value)}
              placeholder="https://…"
              className="rounded-none text-[12px]"
            />
          </Field>

          <Field label="Canonical URL" hint="Leave empty to let the page be its own canonical.">
            <Input
              value={canonicalUrl}
              onChange={(e) => setCanonicalUrl(e.target.value)}
              placeholder="https://…"
              className="rounded-none text-[12px]"
            />
          </Field>

          <Field label="Structured data type">
            <FilterSelect
              value={schemaType}
              onChange={(next) => setSchemaType(next as SchemaType)}
              width="w-full"
              ariaLabel="Schema type"
              options={SCHEMA_TYPES.map((value) => ({ value, label: value }))}
            />
          </Field>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={indexable}
              onChange={(e) => setIndexable(e.target.checked)}
            />
            <span>Allow search engines to index this page</span>
          </label>

          {row.issues.length > 0 && (
            <div className="border border-border p-2.5">
              <p className="text-[11px] font-medium">Detected problems</p>
              <ul className="mt-1 space-y-0.5">
                {row.issues.map((issue) => (
                  <li key={issue} className="text-[11px] text-muted-foreground">
                    · {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border pt-3">
          <Button className="rounded-none" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outline"
            className="rounded-none"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SeoMetaView() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<ApiSeoMeta[]>([]);
  const [avgScore, setAvgScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [editing, setEditing] = useState<ApiSeoMeta | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSeoMeta();
      setRows(res.data);
      setAvgScore(res.meta.avg_score);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load meta records");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !`${row.title} ${row.url}`.toLowerCase().includes(q)) return false;
      if (entityType !== "all" && row.entity_type !== entityType) return false;
      return true;
    });
  }, [rows, search, entityType]);

  const weak = rows.filter((row) => row.score < 50).length;
  const missing = rows.filter((row) => !row.meta_title || !row.meta_description).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SeoStatBar
        stats={[
          { label: "Records", value: String(rows.length) },
          { label: "Avg score", value: String(avgScore), tone: avgScore >= 70 ? "good" : "warn" },
          { label: "Weak", value: String(weak), tone: weak ? "danger" : "default" },
          { label: "Incomplete", value: String(missing), tone: missing ? "warn" : "default" },
        ]}
      />

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
        <Input
          placeholder="Search title or URL…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[240px] shrink-0 rounded-none"
        />
        <FilterSelect
          value={entityType}
          onChange={setEntityType}
          width="w-[160px]"
          ariaLabel="Type"
          options={[
            { value: "all", label: "All types" },
            ...(Object.keys(ENTITY_TYPE_LABELS) as SeoEntityType[]).map((value) => ({
              value,
              label: ENTITY_TYPE_LABELS[value],
            })),
          ]}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 rounded-none text-xs"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className={cn("mr-1 h-3 w-3", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading meta tags…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-3 py-12">
            <p className="text-sm font-medium">No meta records match</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Meta records are written for the pages you curate by hand.
            </p>
          </div>
        ) : (
          filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className="flex w-full items-start gap-3 border-b border-border px-3 py-2 text-left hover:bg-muted/30"
              onClick={() => canWrite && setEditing(row)}
            >
              <Badge
                variant="outline"
                className={cn("mt-0.5 shrink-0 rounded-none tabular-nums text-[10px]", scoreTone(row.score))}
              >
                {row.score}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[12px] font-medium">
                    {row.meta_title || row.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {ENTITY_TYPE_LABELS[row.entity_type as SeoEntityType] ?? row.entity_type}
                  </span>
                  {!row.indexable && (
                    <Badge variant="outline" className="rounded-none text-[10px]">
                      no-index
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {row.url}
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {row.meta_description || "No meta description."}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      <MetaDrawer
        key={`seo-meta:${editing?.id ?? "none"}`}
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        row={editing}
        onSaved={load}
      />
    </div>
  );
}
