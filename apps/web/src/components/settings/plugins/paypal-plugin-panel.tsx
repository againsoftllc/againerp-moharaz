"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchPaypalPlugin,
  updatePaypalPlugin,
  type PaypalPluginRecord,
} from "@/lib/api/paypal-plugin";
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

export function PaypalPluginPanel({ activeSection }: Props) {
  const canWrite = useAdminCanWrite();
  const [plugin, setPlugin] = useState<PaypalPluginRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [draftClientId, setDraftClientId] = useState("");
  const [draftClientSecret, setDraftClientSecret] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [bdtPerUsd, setBdtPerUsd] = useState("110");
  const [checkoutEnabled, setCheckoutEnabled] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchPaypalPlugin();
      setPlugin(row);
      setEnvironment(row.environment);
      setCurrency(row.currency || "USD");
      setBdtPerUsd(String(row.bdt_per_usd ?? 110));
      setCheckoutEnabled(row.checkout_enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PayPal plugin");
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
      await updatePaypalPlugin({
        environment,
        client_id: draftClientId || undefined,
        client_secret: draftClientSecret || undefined,
        currency: currency.trim().toUpperCase() || "USD",
        bdt_per_usd: Number(bdtPerUsd) || 110,
        checkout_enabled: checkoutEnabled,
        verify_connection: verify,
      });
      setDraftClientId("");
      setDraftClientSecret("");
      await refetch();
      toast.success(verify ? "PayPal credentials verified" : "Configuration saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading PayPal settings…</p>;
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
            Control whether PayPal appears on the storefront checkout.
          </p>
        </div>
        <div className="space-y-4 p-4">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Show PayPal at Checkout</span>
              <span className="block text-[11px] text-muted-foreground">
                When off, PayPal is hidden from storefront checkout.
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
              PayPal REST Checkout — create a sandbox app at{" "}
              <a
                href="https://developer.paypal.com/dashboard/"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                developer.paypal.com
              </a>{" "}
              and paste Client ID / Secret here. Order totals in BDT are converted using the rate below.
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
          <Label htmlFor="pp-env">Environment</Label>
          <select
            id="pp-env"
            value={environment}
            disabled={!canWrite}
            onChange={(e) =>
              setEnvironment(e.target.value === "production" ? "production" : "sandbox")
            }
            className="flex h-8 w-full rounded-none border border-input bg-background px-2.5 py-1 text-xs shadow-sm"
          >
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pp-currency">Charge currency</Label>
          <Input
            id="pp-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="USD"
            disabled={!canWrite}
            className="rounded-none"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="pp-client-id">Client ID</Label>
          <Input
            id="pp-client-id"
            type="password"
            value={draftClientId}
            onChange={(e) => setDraftClientId(e.target.value)}
            placeholder={
              plugin.client_id_set
                ? `Saved ${plugin.client_id_hint} (leave blank to keep)`
                : "PayPal Client ID"
            }
            disabled={!canWrite}
            className="rounded-none"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="pp-client-secret">Client Secret</Label>
          <Input
            id="pp-client-secret"
            type="password"
            value={draftClientSecret}
            onChange={(e) => setDraftClientSecret(e.target.value)}
            placeholder={
              plugin.client_secret_set ? "•••••••• (leave blank to keep)" : "PayPal Client Secret"
            }
            disabled={!canWrite}
            className="rounded-none"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pp-rate">BDT per 1 USD</Label>
          <Input
            id="pp-rate"
            type="number"
            min="1"
            step="0.01"
            value={bdtPerUsd}
            onChange={(e) => setBdtPerUsd(e.target.value)}
            disabled={!canWrite}
            className="rounded-none"
          />
          <p className="text-[10px] text-muted-foreground">
            Used to convert order totals before charging on PayPal.
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
