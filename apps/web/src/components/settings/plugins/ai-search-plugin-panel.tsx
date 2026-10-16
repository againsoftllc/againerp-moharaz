"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { fetchAiSettings, removeAiKey, saveAiKey, type AiSettings } from "@/lib/api/ai-chat";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SectionId = "connection" | "test";

type SearchAnswer = {
  summary: string;
  total: number;
  relaxed: string[];
  filters: { category_name: string | null; brand_names: string[]; price_min: number | null; price_max: number | null; keyword: string | null; in_stock: boolean; sort: string };
} | null;
type AssistantAnswer = { answer: string; products: { name: string; price: string | number; stock_status?: string | null; slug: string }[]; follow_ups: string[] } | null;

const taka = (n: number | string) => `৳${Number(n).toLocaleString("en-IN")}`;

function Card({ title, hint, children, footer }: { title: string; hint: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-none border border-input bg-card shadow-sm">
      <div className="border-b border-input bg-muted/30 px-4 py-3">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <div className="p-4">{children}</div>
      {footer ? <div className="flex flex-wrap items-center gap-2 border-t border-input px-4 py-3">{footer}</div> : null}
    </div>
  );
}

/** AI Search plugin: the OpenAI connection the storefront's AI search and shopping assistant use, and a tester. */
export function AiSearchPluginPanel({ activeSection }: { activeSection: SectionId }) {
  const canWrite = useAdminCanWrite();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [question, setQuestion] = useState("১ লাখের মধ্যে ভালো গেমিং ল্যাপটপ কোনটা?");
  const [testing, setTesting] = useState(false);
  const [search, setSearch] = useState<SearchAnswer | undefined>(undefined);
  const [assistant, setAssistant] = useState<AssistantAnswer | undefined>(undefined);

  const refetch = useCallback(async () => {
    try {
      setSettings(await fetchAiSettings());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refetch(), 0);
    return () => window.clearTimeout(timer);
  }, [refetch]);

  const connect = async () => {
    if (!draftKey.trim()) return;
    setSaving(true);
    try {
      setSettings(await saveAiKey(draftKey.trim()));
      setDraftKey("");
      toast.success("OpenAI connected — the key was verified");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The key could not be verified");
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setSaving(true);
    try {
      setSettings(await removeAiKey());
      toast.success("OpenAI key removed — AI search is off");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove the key");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!question.trim()) return;
    setTesting(true);
    setSearch(undefined);
    setAssistant(undefined);
    try {
      const [s, a] = await Promise.all([
        apiFetch<{ data: SearchAnswer }>("/api/v1/storefront/ai-search", { method: "POST", body: JSON.stringify({ query: question.trim() }) }),
        apiFetch<{ data: AssistantAnswer }>("/api/v1/storefront/ai-search/assistant", {
          method: "POST",
          body: JSON.stringify({ messages: [{ role: "user", content: question.trim() }] }),
        }),
      ]);
      setSearch(s.data);
      setAssistant(a.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  if (error) return <p className="text-sm text-destructive">API: {error}</p>;
  if (!settings) return <p className="text-sm text-muted-foreground">Loading AI settings…</p>;

  const status = settings.configured ? (
    <Badge variant="success">Connected{settings.source === "env" ? " (server environment)" : ""}</Badge>
  ) : (
    <Badge variant="warning">Not connected — AI search is off</Badge>
  );

  if (activeSection === "test") {
    const f = search?.filters;
    return (
      <Card
        title="Test AI search"
        hint="Ask the way a shopper would (Bangla, Banglish or English). Shows the filters the AI search builds and the shopping assistant's answer from the live catalogue."
        footer={
          <Button size="sm" className="rounded-none" disabled={testing || !settings.configured} onClick={() => void runTest()}>
            {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
            Ask
          </Button>
        }
      >
        <div className="space-y-3">
          {!settings.configured ? <p className="text-xs text-destructive">Connect OpenAI first (OpenAI Connection).</p> : null}
          <div className="space-y-1.5">
            <Label htmlFor="ais-q">Question</Label>
            <Input id="ais-q" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void runTest()} className="rounded-none" />
          </div>
          {search === null || assistant === null ? (
            <p className="text-xs text-destructive">No answer — check the plugin is enabled and the OpenAI key works.</p>
          ) : null}
          {search && f ? (
            <div className="border border-input p-3 text-xs">
              <p className="mb-1 font-semibold">AI search filters — {search.total} products</p>
              <p className="text-muted-foreground">{search.summary}</p>
              <p className="mt-1">
                {[f.category_name, ...f.brand_names, f.price_min && f.price_max ? `${taka(f.price_min)}–${taka(f.price_max)}` : f.price_max ? `under ${taka(f.price_max)}` : f.price_min ? `over ${taka(f.price_min)}` : "", f.keyword ? `“${f.keyword}”` : "", f.in_stock ? "in stock" : "", f.sort !== "relevance" ? f.sort : ""].filter(Boolean).join(" · ") || "no filters"}
                {search.relaxed.length ? <span className="text-muted-foreground"> (relaxed: {search.relaxed.join(", ")})</span> : null}
              </p>
            </div>
          ) : null}
          {assistant ? (
            <div className="border border-input p-3 text-xs">
              <p className="mb-1 font-semibold">Shopping assistant</p>
              <p className="whitespace-pre-line">{assistant.answer}</p>
              {assistant.products.length ? (
                <ul className="mt-2 list-disc pl-4">
                  {assistant.products.map((p) => <li key={p.slug}>{p.name} — {Number(p.price) > 0 ? taka(p.price) : "call for price"}{p.stock_status ? ` · ${p.stock_status.replace(/_/g, " ")}` : ""}</li>)}
                </ul>
              ) : null}
              {assistant.follow_ups.length ? <p className="mt-2 text-muted-foreground">Follow-ups: {assistant.follow_ups.join(" · ")}</p> : null}
            </div>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="OpenAI Connection"
      hint="The storefront's AI search and shopping assistant use this OpenAI key (the same key the admin AI uses). It is checked with OpenAI before it is saved and never sent to the storefront."
      footer={
        <>
          <Button size="sm" className="rounded-none" disabled={!canWrite || saving || !draftKey.trim()} onClick={() => void connect()}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {settings.configured ? "Replace key" : "Connect"}
          </Button>
          {settings.configured && settings.source === "workspace" ? (
            <Button size="sm" variant="outline" className="rounded-none" disabled={!canWrite || saving} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          ) : null}
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Status</Label>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {status}
            {settings.configured ? <span className="text-muted-foreground">Key {settings.key_hint} · model {settings.model}</span> : null}
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ais-key">OpenAI API key</Label>
          <Input
            id="ais-key"
            type="password"
            autoComplete="off"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            disabled={!canWrite}
            placeholder={settings.configured ? "Saved (enter a new key to replace it)" : "sk-… from platform.openai.com → API keys"}
            className="rounded-none"
          />
          <p className="text-[11px] text-muted-foreground">
            Cost: gpt-4o-mini, roughly $0.2–0.5 per thousand AI searches and a fraction of a cent per assistant answer. Shoppers are limited to 20 searches and 10 assistant questions a minute.
          </p>
        </div>
      </div>
    </Card>
  );
}
