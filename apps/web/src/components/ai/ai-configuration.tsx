"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Gauge, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AiPresetSettingsPanel } from "@/components/ai/ai-preset-settings-panel";
import { fetchAiSettings, removeAiKey, saveAiKey, type AiSettings } from "@/lib/api/ai-chat";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { cn } from "@/lib/utils";

type Tab = "engine" | "presets";

/** Aladin configuration (administrators): the engine key, the company rules for what Aladin writes, and the usage / approval screens. */
export function AiConfiguration() {
  const user = useAdminAuth((s) => s.user);
  const isAdmin =
    ["admin", "system_manager"].includes((user?.role ?? "").toLowerCase()) ||
    Boolean(user?.role_ids?.includes("role_system_manager"));
  const [tab, setTab] = useState<Tab>("engine");
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    void fetchAiSettings()
      .then(setSettings)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load Aladin settings"));
  }, [isAdmin]);

  const submitKey = useCallback(async () => {
    const key = keyDraft.trim();
    if (!key) return;
    setBusy(true);
    try {
      setSettings(await saveAiKey(key));
      setKeyDraft("");
      toast.success("Aladin is connected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the key");
    } finally {
      setBusy(false);
    }
  }, [keyDraft]);

  const clearKey = useCallback(async () => {
    setBusy(true);
    try {
      setSettings(await removeAiKey());
      toast.success("Aladin key removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the key");
    } finally {
      setBusy(false);
    }
  }, []);

  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Only administrators can change how Aladin is configured.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 pb-10">
        <header>
          <h1 className="page-title">Configuration</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">How Aladin connects, what it writes, and what it is allowed to do.</p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { href: "/workspace/ai-usage", title: "AI Usage", blurb: "Tokens, cost and calls per day and per user", icon: Gauge },
            { href: "/workspace/ai-approvals", title: "AI Approvals", blurb: "Actions Aladin prepared that wait for a person", icon: ShieldCheck },
          ].map(({ href, title, blurb, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 border border-border bg-card p-3 hover:border-primary/50">
              <span className="flex h-9 w-9 items-center justify-center bg-primary/10 text-primary">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{blurb}</span>
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>

        <div className="flex gap-1 border-b border-border" role="tablist" aria-label="Aladin configuration">
          {(
            [
              ["engine", "Engine"],
              ["presets", "Presets"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                tab === id ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "presets" ? (
          <section role="tabpanel">
            <p className="mb-4 text-sm text-muted-foreground">Company rules Aladin follows when it writes each field.</p>
            <AiPresetSettingsPanel />
          </section>
        ) : (
          <section role="tabpanel" className="max-w-lg">
            <p className="text-sm text-muted-foreground">
              Aladin needs an engine key to answer from your ERP data. The key is stored securely on the server and is never shown again.
            </p>
            <div className="mt-4 border border-border bg-muted/40 px-3 py-2 text-sm">
              {settings === null ? (
                <span className="text-muted-foreground">Checking status…</span>
              ) : settings.configured ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Connected{settings.key_hint ? ` · key ending in ${settings.key_hint}` : ""}
                  <span className="text-muted-foreground">· {settings.source === "workspace" ? "set from this screen" : "set on the server"}</span>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Not connected - Aladin can&rsquo;t reply yet.
                </span>
              )}
            </div>
            <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor="againai-key">
              Aladin API key
            </label>
            <input
              id="againai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitKey();
                }
              }}
              placeholder={settings?.configured ? "Paste a new key to replace the current one" : "Paste the key here"}
              className="mt-1 h-9 w-full rounded-none border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">The key is verified before it is saved.</p>
            <div className="mt-4 flex items-center justify-between gap-2">
              {settings?.configured && settings.source === "workspace" ? (
                <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={() => void clearKey()}>
                  Remove key
                </Button>
              ) : (
                <span />
              )}
              <Button size="sm" disabled={busy || keyDraft.trim().length < 8} onClick={() => void submitKey()}>
                {busy ? "Verifying…" : "Save & verify"}
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
