"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  fetchMarketingTrackingPlugin,
  testMarketingTrackingCapi,
  updateMarketingTrackingSite,
  type MarketingTrackingPluginRecord,
  type MarketingTrackingSiteRecord,
  type MarketingTrackingSiteUpdateInput,
} from "@/lib/api/marketing-tracking-plugin";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SectionId = "sites" | "events" | "capi";

const EVENT_HELP: Record<string, string> = {
  PageView: "Every page the shopper opens",
  ViewContent: "A product page",
  AddToCart: "A product added to the cart",
  InitiateCheckout: "The checkout page opened",
  Purchase: "An order placed (value, currency, products)",
  Search: "A search submitted",
  CompleteRegistration: "A customer account created",
  Contact: "A call, WhatsApp or Messenger link tapped",
};

type Draft = {
  enabled: boolean;
  gtm_id: string;
  ga4_id: string;
  fb_pixel_id: string;
  pixel_events: string[];
  capi_enabled: boolean;
  capi_access_token: string;
  capi_test_event_code: string;
};

const toDraft = (s: MarketingTrackingSiteRecord): Draft => ({
  enabled: s.enabled,
  gtm_id: s.gtm_id,
  ga4_id: s.ga4_id,
  fb_pixel_id: s.fb_pixel_id,
  pixel_events: s.pixel_events,
  capi_enabled: s.capi_enabled,
  capi_access_token: "",
  capi_test_event_code: s.capi_test_event_code,
});

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

export function MarketingTrackingPluginPanel({ activeSection }: { activeSection: SectionId }) {
  const canWrite = useAdminCanWrite();
  const [plugin, setPlugin] = useState<MarketingTrackingPluginRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [siteId, setSiteId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const site = useMemo(() => plugin?.sites.find((s) => s.site_id === siteId) ?? null, [plugin, siteId]);

  const refetch = useCallback(async (keepSite?: string) => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchMarketingTrackingPlugin();
      setPlugin(row);
      const pick = row.sites.find((s) => s.site_id === keepSite) ?? row.sites[0];
      setSiteId(pick?.site_id ?? "");
      setDraft(pick ? toDraft(pick) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refetch(), 0);
    return () => window.clearTimeout(timer);
  }, [refetch]);

  const chooseSite = (id: string) => {
    const next = plugin?.sites.find((s) => s.site_id === id);
    setSiteId(id);
    setDraft(next ? toDraft(next) : null);
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async (extra: MarketingTrackingSiteUpdateInput = {}) => {
    if (!draft || !site) return;
    setSaving(true);
    try {
      await updateMarketingTrackingSite(site.site_id, {
        enabled: draft.enabled,
        gtm_id: draft.gtm_id,
        ga4_id: draft.ga4_id,
        fb_pixel_id: draft.fb_pixel_id,
        pixel_events: draft.pixel_events,
        capi_enabled: draft.capi_enabled,
        capi_access_token: draft.capi_access_token.trim() || undefined,
        capi_test_event_code: draft.capi_test_event_code,
        ...extra,
      });
      toast.success(`Saved for ${site.site_name}`);
      await refetch(site.site_id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!site) return;
    setTesting(true);
    try {
      const res = await testMarketingTrackingCapi(site.site_id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      await refetch(site.site_id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  if (loading && !plugin) return <p className="text-sm text-muted-foreground">Loading tracking settings…</p>;
  if (error) return <p className="text-sm text-destructive">API: {error}</p>;
  if (!plugin || !draft || !site) return <p className="text-sm text-muted-foreground">No storefront site yet — add one under Workspace → Sites.</p>;

  const saveButton = (label = "Save") => (
    <Button size="sm" className="rounded-none" disabled={!canWrite || saving} onClick={() => void save()}>
      {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
      {label}
    </Button>
  );

  const sitePicker = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Label htmlFor="mt-site" className="text-xs">Site</Label>
      <select
        id="mt-site"
        value={siteId}
        onChange={(e) => chooseSite(e.target.value)}
        className="flex h-8 min-w-[220px] rounded-none border border-input bg-background px-2.5 py-1 text-xs shadow-sm"
      >
        {plugin.sites.map((s) => (
          <option key={s.site_id} value={s.site_id}>
            {s.site_name}
            {s.site_domain ? ` — ${s.site_domain}` : ""}
          </option>
        ))}
      </select>
      {!plugin.enabled ? <Badge variant="warning">Plugin disabled — no site loads tags</Badge> : null}
      {site.configured && draft.enabled && plugin.enabled ? <Badge variant="success">Live on this site</Badge> : null}
      {!site.configured ? <Badge variant="muted">Not set up yet</Badge> : null}
    </div>
  );

  if (activeSection === "events") {
    const all = plugin.available_events;
    return (
      <div>
        {sitePicker}
        <Card
          title="Pixel Events"
          hint="Standard Meta events the storefront sends (to the Pixel, and to the Conversions API when it is on). Google Tag Manager receives all of them in the dataLayer."
          footer={<>{saveButton()}<span className="text-[11px] text-muted-foreground">{draft.pixel_events.length} of {all.length} on</span></>}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {all.map((ev) => (
              <label key={ev} className="flex items-start gap-2 border border-input px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  disabled={!canWrite}
                  checked={draft.pixel_events.includes(ev)}
                  onChange={(e) =>
                    set("pixel_events", e.target.checked ? all.filter((x) => x === ev || draft.pixel_events.includes(x)) : draft.pixel_events.filter((x) => x !== ev))
                  }
                />
                <span>
                  <b className="font-semibold">{ev}</b>
                  <span className="block text-muted-foreground">{EVENT_HELP[ev] ?? ""}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (activeSection === "capi") {
    return (
      <div>
        {sitePicker}
        <Card
          title="Meta Conversions API"
          hint="Sends each event from the server too, with the same event ID as the browser Pixel so Meta counts it once. The access token stays on the server and is never shown again after saving."
          footer={
            <>
              {saveButton()}
              <Button size="sm" variant="outline" className="rounded-none" disabled={!canWrite || testing || !site.capi_access_token_set} onClick={() => void sendTest()}>
                {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                Send test event
              </Button>
              {site.capi_last_status ? (
                <span className="text-[11px] text-muted-foreground">
                  Last: {site.capi_last_status}
                  {site.capi_last_sent_at ? ` · ${new Date(site.capi_last_sent_at).toLocaleString()}` : ""}
                </span>
              ) : null}
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <input type="checkbox" disabled={!canWrite} checked={draft.capi_enabled} onChange={(e) => set("capi_enabled", e.target.checked)} />
              Send events through the Conversions API
            </label>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="mt-token">Access token</Label>
              <Input
                id="mt-token"
                type="password"
                autoComplete="off"
                value={draft.capi_access_token}
                onChange={(e) => set("capi_access_token", e.target.value)}
                disabled={!canWrite}
                placeholder={site.capi_access_token_set ? `Saved ${site.capi_access_token_hint} (leave blank to keep)` : "Events Manager → Settings → Conversions API → Generate access token"}
                className="rounded-none"
              />
              {site.capi_access_token_set ? (
                <button type="button" className="text-[11px] text-destructive underline" disabled={!canWrite || saving} onClick={() => void save({ clear_capi_access_token: true, capi_enabled: false })}>
                  Remove the saved token
                </button>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mt-test">Test event code</Label>
              <Input
                id="mt-test"
                value={draft.capi_test_event_code}
                onChange={(e) => set("capi_test_event_code", e.target.value)}
                disabled={!canWrite}
                placeholder="TEST12345 — clear it when you go live"
                className="rounded-none"
              />
              <p className="text-[11px] text-muted-foreground">While set, every server event shows under Events Manager → Test events instead of counting.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Pixel</Label>
              <p className="text-xs">{draft.fb_pixel_id || <span className="text-destructive">Set the Meta Pixel ID under Sites &amp; Tags first</span>}</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {sitePicker}
      <Card
        title="Sites & Tags"
        hint="Each storefront site loads its own tags. Leave an ID empty to not load that tag."
        footer={saveButton()}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs sm:col-span-2">
            <input type="checkbox" disabled={!canWrite} checked={draft.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            Load tracking on this site
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="mt-gtm">Google Tag Manager container ID</Label>
            <Input id="mt-gtm" value={draft.gtm_id} onChange={(e) => set("gtm_id", e.target.value.toUpperCase())} disabled={!canWrite} placeholder="GTM-XXXXXXX" className="rounded-none" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mt-ga4">GA4 Measurement ID</Label>
            <Input id="mt-ga4" value={draft.ga4_id} onChange={(e) => set("ga4_id", e.target.value.toUpperCase())} disabled={!canWrite} placeholder="G-XXXXXXXXXX (skip it if GA4 runs inside GTM)" className="rounded-none" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mt-pixel">Meta (Facebook) Pixel ID</Label>
            <Input id="mt-pixel" value={draft.fb_pixel_id} onChange={(e) => set("fb_pixel_id", e.target.value.replace(/\D/g, ""))} disabled={!canWrite} placeholder="1234567890123456" className="rounded-none" />
          </div>
          <div className="space-y-1.5">
            <Label>Domain</Label>
            <p className="text-xs">{site.site_domain || "—"}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
