"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchStripePlugin,
  updateStripePlugin,
  type StripePluginRecord,
} from "@/lib/api/stripe-plugin";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SectionId = "credentials" | "checkout";

type Props = {
  activeSection: SectionId;
};

function statusBadge(status: string) {
  if (status === "connected") return <Badge variant="success">Connected</Badge>;
  if (status === "error") return <Badge variant="warning">Error</Badge>;
  return <Badge variant="muted">Disconnected</Badge>;
}

export function StripePluginPanel({ activeSection }: Props) {
  const canWrite = useAdminCanWrite();
  const [plugin, setPlugin] = useState<StripePluginRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [draftPublishable, setDraftPublishable] = useState("");
  const [draftSecret, setDraftSecret] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [bdtPerUsd, setBdtPerUsd] = useState("110");
  const [checkoutEnabled, setCheckoutEnabled] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchStripePlugin();
      setPlugin(row);
      setEnvironment(row.environment);
      setCurrency(row.currency || "USD");
      setBdtPerUsd(String(row.bdt_per_usd ?? 110));
      setCheckoutEnabled(row.checkout_enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Stripe plugin");
      setPlugin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const handleSave = async (verify: boolean) => {
    if (!canWrite) return;
    setSaving(true);
    try {
      await updateStripePlugin({
        environment,
        publishable_key: draftPublishable || undefined,
        secret_key: draftSecret || undefined,
        currency: currency.trim().toUpperCase() || "USD",
        bdt_per_usd: Number(bdtPerUsd) || 110,
        checkout_enabled: checkoutEnabled,
        verify_connection: verify,
      });
      setDraftPublishable("");
      setDraftSecret("");
      await refetch();
      toast.success(verify ? "Stripe credentials verified" : "Configuration saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Stripe settings…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">API: {error}</p>;
  }
  if (!plugin) return null;

  if (activeSection === "checkout") {
    return (
      <div className="overflow-hidden rounded-none border border-input bg-card shadow-sm">
        <div className="border-b border-input bg-muted/30 px-4 py-3">
          <p className="text-sm font-semibold">Checkout</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Control whether Stripe appears on the storefront checkout.
          </p>
        </div>
        <div className="space-y-4 p-4">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Show Stripe at Checkout</span>
              <span className="block text-[11px] text-muted-foreground">
                When off, Stripe is hidden from storefront checkout.
              </span>
            </span>
            <input
              type="checkbox"
              checked={checkoutEnabled}
              disabled={!canWrite}
              onChange={(e) => setCheckoutEnabled(e.target.checked)}
              className="h-4 w-4 rounded-none border-input"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-input px-4 py-3">
          <Button size="sm" disabled={!canWrite || saving} onClick={() => void handleSave(false)}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-none border border-input bg-card shadow-sm">
      <div className="border-b border-input bg-muted/30 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">API Credentials</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Stripe Checkout — get test keys from{" "}
              <a
                href="https://dashboard.stripe.com/test/apikeys"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                dashboard.stripe.com/test/apikeys
              </a>
              . Order totals in BDT are converted using the rate below.
            </p>
          </div>
          {statusBadge(plugin.connection_status)}
        </div>
        {plugin.connection_message ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{plugin.connection_message}</p>
        ) : null}
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="st-env">Environment</Label>
          <select
            id="st-env"
            value={environment}
            disabled={!canWrite}
            onChange={(e) =>
              setEnvironment(e.target.value === "production" ? "production" : "sandbox")
            }
            className="flex h-8 w-full rounded-none border border-input bg-background px-2.5 py-1 text-xs shadow-sm"
          >
            <option value="sandbox">Sandbox (Test)</option>
            <option value="production">Production (Live)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-currency">Charge currency</Label>
          <Input
            id="st-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="USD"
            disabled={!canWrite}
            className="rounded-none"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="st-pk">Publishable Key</Label>
          <Input
            id="st-pk"
            type="password"
            value={draftPublishable}
            onChange={(e) => setDraftPublishable(e.target.value)}
            placeholder={
              plugin.publishable_key_set
                ? `Saved ${plugin.publishable_key_hint} (leave blank to keep)`
                : "pk_test_…"
            }
            disabled={!canWrite}
            className="rounded-none"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="st-sk">Secret Key</Label>
          <Input
            id="st-sk"
            type="password"
            value={draftSecret}
            onChange={(e) => setDraftSecret(e.target.value)}
            placeholder={plugin.secret_key_set ? "•••••••• (leave blank to keep)" : "sk_test_…"}
            disabled={!canWrite}
            className="rounded-none"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-rate">BDT per 1 USD</Label>
          <Input
            id="st-rate"
            type="number"
            min="1"
            step="0.01"
            value={bdtPerUsd}
            onChange={(e) => setBdtPerUsd(e.target.value)}
            disabled={!canWrite}
            className="rounded-none"
          />
          <p className="text-[10px] text-muted-foreground">
            Used to convert order totals before charging on Stripe.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-input px-4 py-3">
        <Button
          size="sm"
          variant="outline"
          disabled={!canWrite || saving}
          onClick={() => void handleSave(false)}
        >
          Save
        </Button>
        <Button size="sm" disabled={!canWrite || saving} onClick={() => void handleSave(true)}>
          {saving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
          )}
          Verify Connection
        </Button>
      </div>
    </div>
  );
}
