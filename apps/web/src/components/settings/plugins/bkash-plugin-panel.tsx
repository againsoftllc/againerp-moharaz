"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchBkashPlugin,
  updateBkashPlugin,
  type BkashPluginRecord,
} from "@/lib/api/bkash-plugin";
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

export function BkashPluginPanel({ activeSection }: Props) {
  const canWrite = useAdminCanWrite();
  const [plugin, setPlugin] = useState<BkashPluginRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [username, setUsername] = useState("");
  const [draftPassword, setDraftPassword] = useState("");
  const [draftAppKey, setDraftAppKey] = useState("");
  const [draftAppSecret, setDraftAppSecret] = useState("");
  const [checkoutEnabled, setCheckoutEnabled] = useState(true);
  const [autoVerify, setAutoVerify] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchBkashPlugin();
      setPlugin(row);
      setEnvironment(row.environment);
      setUsername(row.username);
      setCheckoutEnabled(row.checkout_enabled);
      setAutoVerify(row.auto_verify);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bKash plugin");
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
      await updateBkashPlugin({
        environment,
        username,
        password: draftPassword || undefined,
        app_key: draftAppKey || undefined,
        app_secret: draftAppSecret || undefined,
        checkout_enabled: checkoutEnabled,
        auto_verify: autoVerify,
        verify_connection: verify,
      });
      setDraftPassword("");
      setDraftAppKey("");
      setDraftAppSecret("");
      await refetch();
      toast.success(verify ? "bKash credentials verified" : "Configuration saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading bKash settings…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">API: {error}</p>;
  }
  if (!plugin) return null;

  if (activeSection === "checkout") {
    return (
      <div className="overflow-hidden rounded-xl border border-input bg-card shadow-sm">
        <div className="border-b border-input bg-muted/30 px-4 py-3">
          <p className="text-sm font-semibold">Checkout</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Storefront checkout-এ bKash option ও auto verification নিয়ন্ত্রণ করুন।
          </p>
        </div>
        <div className="space-y-4 p-4">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Show bKash at Checkout</span>
              <span className="block text-[11px] text-muted-foreground">
                বন্ধ করলে storefront checkout-এ bKash দেখা যাবে না।
              </span>
            </span>
            <input
              type="checkbox"
              checked={checkoutEnabled}
              disabled={!canWrite}
              onChange={(e) => setCheckoutEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Auto Verify Payment</span>
              <span className="block text-[11px] text-muted-foreground">
                Callback-এ execute/query দিয়ে payment স্বয়ংক্রিয়ভাবে verify হবে।
              </span>
            </span>
            <input
              type="checkbox"
              checked={autoVerify}
              disabled={!canWrite}
              onChange={(e) => setAutoVerify(e.target.checked)}
              className="h-4 w-4 rounded border-input"
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
    <div className="overflow-hidden rounded-xl border border-input bg-card shadow-sm">
      <div className="border-b border-input bg-muted/30 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Merchant Credentials</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              bKash Tokenized Checkout credentials — sandbox টেস্টের জন্য{" "}
              <a
                href="https://developer.bka.sh"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                developer.bka.sh
              </a>{" "}
              থেকে নিন।
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
          <Label htmlFor="bkash-env">Environment</Label>
          <select
            id="bkash-env"
            value={environment}
            disabled={!canWrite}
            onChange={(e) => setEnvironment(e.target.value === "production" ? "production" : "sandbox")}
            className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-sm"
          >
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bkash-username">Username</Label>
          <Input
            id="bkash-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Merchant username (wallet number)"
            disabled={!canWrite}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bkash-password">Password</Label>
          <Input
            id="bkash-password"
            type="password"
            value={draftPassword}
            onChange={(e) => setDraftPassword(e.target.value)}
            placeholder={plugin.password_set ? "•••••••• (leave blank to keep)" : "Merchant password"}
            disabled={!canWrite}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bkash-app-key">App Key</Label>
          <Input
            id="bkash-app-key"
            type="password"
            value={draftAppKey}
            onChange={(e) => setDraftAppKey(e.target.value)}
            placeholder={
              plugin.app_key_set ? `Saved ${plugin.app_key_hint} (leave blank to keep)` : "App key"
            }
            disabled={!canWrite}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bkash-app-secret">App Secret</Label>
          <Input
            id="bkash-app-secret"
            type="password"
            value={draftAppSecret}
            onChange={(e) => setDraftAppSecret(e.target.value)}
            placeholder={plugin.app_secret_set ? "•••••••• (leave blank to keep)" : "App secret"}
            disabled={!canWrite}
          />
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
