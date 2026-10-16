"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchPathaoPlugin,
  updatePathaoPlugin,
  type PathaoPluginRecord,
} from "@/lib/api/pathao-plugin";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SectionId = "connection" | "pickup" | "automation";

type Props = {
  activeSection: SectionId;
};

function statusBadge(status: string) {
  if (status === "connected") return <Badge variant="success">Connected</Badge>;
  if (status === "error") return <Badge variant="warning">Error</Badge>;
  return <Badge variant="muted">Disconnected</Badge>;
}

export function PathaoPluginPanel({ activeSection }: Props) {
  const canWrite = useAdminCanWrite();
  const [plugin, setPlugin] = useState<PathaoPluginRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [draftClientId, setDraftClientId] = useState("");
  const [draftClientSecret, setDraftClientSecret] = useState("");
  const [username, setUsername] = useState("");
  const [draftPassword, setDraftPassword] = useState("");
  const [storeId, setStoreId] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [defaultService, setDefaultService] = useState("regular");
  const [itemType, setItemType] = useState("parcel");
  const [autoCreate, setAutoCreate] = useState(true);
  const [syncTracking, setSyncTracking] = useState(true);
  const [codEnabled, setCodEnabled] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchPathaoPlugin();
      setPlugin(row);
      setEnvironment(row.environment);
      setUsername(row.username || "");
      setStoreId(row.store_id || "");
      setPickupAddress(row.pickup_address || "");
      setPickupPhone(row.pickup_phone || "");
      setDefaultService(row.default_service || "regular");
      setItemType(row.item_type || "parcel");
      setAutoCreate(row.auto_create_shipment);
      setSyncTracking(row.sync_tracking);
      setCodEnabled(row.cod_enabled);
      setWebhookUrl(row.webhook_url || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Pathao plugin");
      setPlugin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refetch(), 0);
    return () => window.clearTimeout(timer);
  }, [refetch]);

  const handleSave = async (verify: boolean) => {
    if (!canWrite) return;
    setSaving(true);
    try {
      await updatePathaoPlugin({
        environment,
        client_id: draftClientId || undefined,
        client_secret: draftClientSecret || undefined,
        username,
        password: draftPassword || undefined,
        store_id: storeId,
        pickup_address: pickupAddress,
        pickup_phone: pickupPhone,
        default_service: defaultService,
        item_type: itemType,
        auto_create_shipment: autoCreate,
        sync_tracking: syncTracking,
        cod_enabled: codEnabled,
        webhook_url: webhookUrl,
        verify_connection: verify,
      });
      setDraftClientId("");
      setDraftClientSecret("");
      setDraftPassword("");
      await refetch();
      toast.success(verify ? "Pathao credentials verified" : "Configuration saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Pathao settings…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">API: {error}</p>;
  }
  if (!plugin) return null;

  if (activeSection === "pickup") {
    return (
      <div className="overflow-hidden rounded-none border border-input bg-card shadow-sm">
        <div className="border-b border-input bg-muted/30 px-4 py-3">
          <p className="text-sm font-semibold">Pickup & Delivery</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Defaults used when creating Pathao consignments from orders.
          </p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ph-pickup">Default pickup address</Label>
            <Input
              id="ph-pickup"
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              disabled={!canWrite}
              className="rounded-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph-phone">Pickup phone</Label>
            <Input
              id="ph-phone"
              value={pickupPhone}
              onChange={(e) => setPickupPhone(e.target.value)}
              disabled={!canWrite}
              className="rounded-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph-service">Default service</Label>
            <select
              id="ph-service"
              value={defaultService}
              disabled={!canWrite}
              onChange={(e) => setDefaultService(e.target.value)}
              className="flex h-8 w-full rounded-none border border-input bg-background px-2.5 py-1 text-xs shadow-sm"
            >
              <option value="regular">Regular (48h)</option>
              <option value="express">Express / On Demand</option>
              <option value="same_day">Same Day</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph-item">Default item type</Label>
            <select
              id="ph-item"
              value={itemType}
              disabled={!canWrite}
              onChange={(e) => setItemType(e.target.value)}
              className="flex h-8 w-full rounded-none border border-input bg-background px-2.5 py-1 text-xs shadow-sm"
            >
              <option value="parcel">Parcel</option>
              <option value="document">Document</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-input px-4 py-3">
          <Button
            size="sm"
            className="rounded-none"
            disabled={!canWrite || saving}
            onClick={() => void handleSave(false)}
          >
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (activeSection === "automation") {
    return (
      <div className="overflow-hidden rounded-none border border-input bg-card shadow-sm">
        <div className="border-b border-input bg-muted/30 px-4 py-3">
          <p className="text-sm font-semibold">Order Automation</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            When Auto create is on and Pathao is installed, creating a shipment with
            courier Pathao (or empty courier) will request a Pathao consignment.
            Orders also support{" "}
            <code className="text-[10px]">POST /api/v1/commerce/orders/&#123;id&#125;/pathao-consignment</code>.
          </p>
        </div>
        <div className="space-y-4 p-4">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Auto create shipment</span>
              <span className="block text-[11px] text-muted-foreground">
                When order is confirmed, queue a Pathao consignment.
              </span>
            </span>
            <input
              type="checkbox"
              checked={autoCreate}
              disabled={!canWrite}
              onChange={(e) => setAutoCreate(e.target.checked)}
              className="h-4 w-4 rounded-none border-input"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Sync tracking to order</span>
              <span className="block text-[11px] text-muted-foreground">
                Write Pathao consignment / tracking onto the commerce order.
              </span>
            </span>
            <input
              type="checkbox"
              checked={syncTracking}
              disabled={!canWrite}
              onChange={(e) => setSyncTracking(e.target.checked)}
              className="h-4 w-4 rounded-none border-input"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Cash on Delivery (COD)</span>
              <span className="block text-[11px] text-muted-foreground">
                Allow amount_to_collect on Pathao orders.
              </span>
            </span>
            <input
              type="checkbox"
              checked={codEnabled}
              disabled={!canWrite}
              onChange={(e) => setCodEnabled(e.target.checked)}
              className="h-4 w-4 rounded-none border-input"
            />
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="ph-webhook">Webhook URL (optional)</Label>
            <Input
              id="ph-webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://…/api/webhooks/pathao"
              disabled={!canWrite}
              className="rounded-none"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-input px-4 py-3">
          <Button
            size="sm"
            className="rounded-none"
            disabled={!canWrite || saving}
            onClick={() => void handleSave(false)}
          >
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
              Pathao Merchant API — sandbox public test keys work for Verify. Production keys from{" "}
              <a
                href="https://merchant.pathao.com/developer"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                merchant.pathao.com/developer
              </a>
              .
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
          <Label htmlFor="ph-env">Environment</Label>
          <select
            id="ph-env"
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
          <Label htmlFor="ph-store">Store ID</Label>
          <Input
            id="ph-store"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            placeholder="Auto-filled after Verify if empty"
            disabled={!canWrite}
            className="rounded-none"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ph-cid">Client ID</Label>
          <Input
            id="ph-cid"
            type="password"
            value={draftClientId}
            onChange={(e) => setDraftClientId(e.target.value)}
            placeholder={
              plugin.client_id_set
                ? `Saved ${plugin.client_id_hint} (leave blank to keep)`
                : "Client ID"
            }
            disabled={!canWrite}
            className="rounded-none"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ph-csec">Client Secret</Label>
          <Input
            id="ph-csec"
            type="password"
            value={draftClientSecret}
            onChange={(e) => setDraftClientSecret(e.target.value)}
            placeholder={plugin.client_secret_set ? "•••••••• (leave blank to keep)" : "Client Secret"}
            disabled={!canWrite}
            className="rounded-none"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ph-user">Username (email)</Label>
          <Input
            id="ph-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="merchant@email.com"
            disabled={!canWrite}
            className="rounded-none"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ph-pass">Password</Label>
          <Input
            id="ph-pass"
            type="password"
            value={draftPassword}
            onChange={(e) => setDraftPassword(e.target.value)}
            placeholder={plugin.password_set ? "•••••••• (leave blank to keep)" : "Password"}
            disabled={!canWrite}
            className="rounded-none"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-input px-4 py-3">
        <Button
          size="sm"
          variant="outline"
          className="rounded-none"
          disabled={!canWrite || saving}
          onClick={() => void handleSave(false)}
        >
          Save
        </Button>
        <Button
          size="sm"
          className="rounded-none"
          disabled={!canWrite || saving}
          onClick={() => void handleSave(true)}
        >
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
