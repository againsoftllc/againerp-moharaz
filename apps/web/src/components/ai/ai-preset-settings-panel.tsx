"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, Play, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteAiPreset,
  fetchAiPresetTargets,
  fetchAiPresets,
  fetchAiPresetVersions,
  rollbackAiPreset,
  saveAiPreset,
  testAiPreset,
  type AiPreset,
  type AiPresetTarget,
  type AiPresetTestResult,
  type AiPresetVersion,
} from "@/lib/api/ai-presets";

/**
 * AI → Settings → Presets (admins). One company rule per AI field/job, stored server-side
 * (app/services/ai/preset_service.py) and read by the product import, SEO tool and chat.
 * Every save keeps the previous text as a version that can be restored.
 */

type Draft = { instruction: string; examples: string; is_active: boolean };

const emptyDraft: Draft = { instruction: "", examples: "", is_active: true };

function toDraft(preset: AiPreset | undefined): Draft {
  if (!preset) return emptyDraft;
  return { instruction: preset.instruction, examples: preset.examples ?? "", is_active: preset.is_active };
}

/** Test-result fields each target governs — shown first, the rest folded away. */
const FOCUS: Record<string, (keyof AiPresetTestResult)[]> = {
  "catalog.product.name": ["name"],
  "catalog.product.short_description": ["short_description"],
  "catalog.product.description": ["description"],
  "catalog.product.category": ["category_name", "category_names"],
  "catalog.product.tags": ["tags"],
  "catalog.product.warranty": ["warranty"],
  "catalog.product.seo": ["seo_title", "seo_description"],
};

const FIELD_LABELS: Partial<Record<keyof AiPresetTestResult, string>> = {
  name: "Name",
  short_description: "Short description",
  description: "Description",
  category_name: "Primary category",
  category_names: "All categories",
  tags: "Tags",
  warranty: "Warranty",
  seo_title: "Meta title",
  seo_description: "Meta description",
};
const ALL_FIELDS = Object.keys(FIELD_LABELS) as (keyof AiPresetTestResult)[];

function fieldText(result: AiPresetTestResult, key: keyof AiPresetTestResult): string {
  const value = result[key];
  if (Array.isArray(value)) return value.join(", ");
  return value == null ? "" : String(value);
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "";
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function AiPresetSettingsPanel() {
  const [targets, setTargets] = useState<AiPresetTarget[]>([]);
  const [presets, setPresets] = useState<AiPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("catalog.product.description");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<AiPresetVersion[]>([]);
  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState("");
  const [testResult, setTestResult] = useState<AiPresetTestResult | null>(null);

  const target = targets.find((t) => t.key === selected);
  const preset = presets.find((p) => p.target === selected);
  const saved = toDraft(preset);
  const dirty =
    draft.instruction !== saved.instruction ||
    draft.examples !== saved.examples ||
    (preset !== undefined && draft.is_active !== saved.is_active);

  const loadVersions = useCallback(async (key: string) => {
    try {
      setVersions(await fetchAiPresetVersions(key));
    } catch {
      setVersions([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, p] = await Promise.all([fetchAiPresetTargets(), fetchAiPresets()]);
        if (cancelled) return;
        setTargets(t);
        setPresets(p);
        setDraft(toDraft(p.find((row) => row.target === selected)));
      } catch (err) {
        if (!cancelled) toast.error(errorText(err, "Could not load AI presets"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Initial load only — later selection changes go through select().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadVersions(selected);
  }, [selected, loadVersions]);

  const select = (key: string) => {
    if (key === selected) return;
    if (dirty && !window.confirm("Discard unsaved changes to this preset?")) return;
    setSelected(key);
    setDraft(toDraft(presets.find((p) => p.target === key)));
    setTestResult(null);
    setTestError("");
  };

  const applySaved = (row: AiPreset) => {
    setPresets((current) => [...current.filter((p) => p.target !== row.target), row]);
    setDraft(toDraft(row));
    void loadVersions(row.target);
  };

  const save = async () => {
    if (!draft.instruction.trim()) {
      toast.error("Write the rule first.");
      return;
    }
    setBusy(true);
    try {
      applySaved(
        await saveAiPreset(selected, {
          instruction: draft.instruction,
          examples: draft.examples.trim() || null,
          is_active: draft.is_active,
        }),
      );
      toast.success("Preset saved");
    } catch (err) {
      toast.error(errorText(err, "Could not save the preset"));
    } finally {
      setBusy(false);
    }
  };

  /** On/off applies immediately for a saved preset (keeping its saved text); before the first
   *  save it only sets the draft. */
  const toggle = async (on: boolean) => {
    if (!preset) {
      setDraft((d) => ({ ...d, is_active: on }));
      return;
    }
    setBusy(true);
    try {
      const row = await saveAiPreset(selected, {
        instruction: preset.instruction,
        examples: preset.examples,
        is_active: on,
        title: preset.title,
      });
      setPresets((current) => [...current.filter((p) => p.target !== row.target), row]);
      setDraft((d) => ({ ...d, is_active: row.is_active }));
      void loadVersions(row.target);
      toast.success(on ? "Preset switched on" : "Preset switched off");
    } catch (err) {
      toast.error(errorText(err, "Could not change the preset"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!preset || !window.confirm("Delete this preset? Its text stays in the version history.")) return;
    setBusy(true);
    try {
      await deleteAiPreset(selected);
      setPresets((current) => current.filter((p) => p.target !== selected));
      setDraft(emptyDraft);
      void loadVersions(selected);
      toast.success("Preset deleted");
    } catch (err) {
      toast.error(errorText(err, "Could not delete the preset"));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (version: AiPresetVersion) => {
    if (dirty && !window.confirm("Discard unsaved changes and restore this version?")) return;
    setBusy(true);
    try {
      applySaved(await rollbackAiPreset(selected, version.id));
      toast.success(`Restored version ${version.version}`);
    } catch (err) {
      toast.error(errorText(err, "Could not restore this version"));
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestError("");
    setTestResult(null);
    try {
      setTestResult(
        await testAiPreset(selected, {
          url: url.trim(),
          instruction: draft.instruction,
          examples: draft.examples.trim() || null,
          is_active: draft.is_active,
        }),
      );
    } catch (err) {
      setTestError(errorText(err, "Could not test this preset"));
    } finally {
      setTesting(false);
    }
  };

  const focus = useMemo(() => FOCUS[selected] ?? ALL_FIELDS, [selected]);
  const rest = ALL_FIELDS.filter((f) => !focus.includes(f));

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading presets…
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="AI presets" className="space-y-1">
        {targets.map((t) => {
          const row = presets.find((p) => p.target === t.key);
          const state = !row ? "Not set" : row.is_active ? "On" : "Off";
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => select(t.key)}
              aria-current={t.key === selected ? "page" : undefined}
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                t.key === selected ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
              }`}
            >
              <span className="block leading-snug">{t.label}</span>
              <span
                className={`mt-0.5 flex items-center gap-1.5 text-[11px] font-normal ${
                  state === "On" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    state === "On" ? "bg-emerald-500" : state === "Off" ? "bg-amber-500" : "bg-muted-foreground/40"
                  }`}
                />
                {state}
              </span>
            </button>
          );
        })}
      </nav>

      {target ? (
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{target.label}</h3>
              <p className="text-xs text-muted-foreground">Used by: {target.used_by}</p>
              {preset ? (
                <p className="text-[11px] text-muted-foreground">
                  Version {preset.version}
                  {preset.updated_at ? ` · saved ${formatDate(preset.updated_at)}` : ""}
                </p>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <SwitchPrimitive.Root
                checked={draft.is_active}
                disabled={busy}
                onCheckedChange={(on) => void toggle(on)}
                aria-label="Preset on or off"
                className="inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
              >
                <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
              </SwitchPrimitive.Root>
              {draft.is_active ? "On" : "Off"}
            </label>
          </div>

          <label className="block space-y-1 text-xs font-medium">
            Rule
            <Textarea
              value={draft.instruction}
              onChange={(e) => setDraft((d) => ({ ...d, instruction: e.target.value }))}
              placeholder={target.placeholder}
              rows={6}
              maxLength={4000}
              className="text-sm font-normal"
            />
          </label>
          <label className="block space-y-1 text-xs font-medium">
            Examples <span className="font-normal text-muted-foreground">(optional)</span>
            <Textarea
              value={draft.examples}
              onChange={(e) => setDraft((d) => ({ ...d, examples: e.target.value }))}
              placeholder="A good example of the finished field"
              rows={3}
              maxLength={4000}
              className="text-sm font-normal"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {preset ? (
              <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={() => void remove()}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {dirty ? <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span> : null}
              <Button type="button" variant="outline" size="sm" disabled={busy || !dirty} onClick={() => setDraft(saved)}>
                Discard
              </Button>
              <Button type="button" size="sm" disabled={busy || !dirty || !draft.instruction.trim()} onClick={() => void save()}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <h4 className="text-sm font-medium">Test with a product page</h4>
            <p className="text-xs text-muted-foreground">
              Runs the real product import on the page with the rule above (saved or not). Nothing is created or saved.
            </p>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (url.trim() && !testing) void runTest();
              }}
            >
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/product-page"
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <Button type="submit" size="sm" disabled={testing || !url.trim()}>
                {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                {testing ? "Testing…" : "Test"}
              </Button>
            </form>
            {testError ? (
              <p role="alert" className="text-sm text-destructive">
                {testError}
              </p>
            ) : null}
            {testResult ? (
              <div className="space-y-3 rounded-md bg-muted/40 p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {testResult.rule_applied ? "With this rule" : "Rule is off — default output"} ·{" "}
                  <span className="break-all">{testResult.url}</span>
                </p>
                {focus.map((key) => (
                  <div key={key}>
                    <p className="text-xs font-medium text-muted-foreground">{FIELD_LABELS[key]}</p>
                    <p className="whitespace-pre-wrap">{fieldText(testResult, key) || "—"}</p>
                  </div>
                ))}
                {rest.length ? (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">Other fields</summary>
                    <div className="mt-2 space-y-2">
                      {rest.map((key) => (
                        <div key={key}>
                          <p className="text-xs font-medium text-muted-foreground">{FIELD_LABELS[key]}</p>
                          <p className="whitespace-pre-wrap">{fieldText(testResult, key) || "—"}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
                {testResult.warnings.length ? (
                  <ul className="list-disc pl-4 text-xs text-amber-700 dark:text-amber-400">
                    {testResult.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <h4 className="flex items-center gap-1.5 text-sm font-medium">
              <History className="h-3.5 w-3.5" /> Version history
            </h4>
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">Earlier versions appear here after the first change.</p>
            ) : (
              <ul className="max-h-60 space-y-2 overflow-y-auto">
                {versions.map((v) => (
                  <li key={v.id} className="rounded-md border border-border px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 text-xs">
                        <span className="font-medium">Version {v.version}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {v.is_active ? "on" : "off"} · replaced {formatDate(v.created_at)}
                          {v.change === "delete" ? " (deleted)" : ""}
                        </span>
                      </span>
                      <Button type="button" variant="outline" size="sm" className="h-7" disabled={busy} onClick={() => void restore(v)}>
                        <RotateCcw className="mr-1.5 h-3 w-3" /> Restore
                      </Button>
                    </div>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{v.instruction}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
