"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchSmsGatewayPlugin,
  testSmsGatewayPlugin,
  updateSmsGatewayPlugin,
  type SmsGatewayPluginId,
  type SmsGatewayPluginRecord,
} from "@/lib/api/sms-gateway-plugin";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SectionId = "credentials" | "test";

type Props = {
  pluginId: SmsGatewayPluginId;
  activeSection: SectionId;
};

function statusBadge(status: string) {
  if (status === "connected") return <Badge className="rounded-none" variant="success">Connected</Badge>;
  if (status === "error") return <Badge className="rounded-none" variant="warning">Error</Badge>;
  return <Badge className="rounded-none" variant="muted">Disconnected</Badge>;
}

export function SmsGatewayPluginPanel({ pluginId, activeSection }: Props) {
  const canWrite = useAdminCanWrite();
  const [plugin, setPlugin] = useState<SmsGatewayPluginRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [draftApiSecret, setDraftApiSecret] = useState("");
  const [senderId, setSenderId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [testPhone, setTestPhone] = useState("");

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchSmsGatewayPlugin(pluginId);
      setPlugin(row);
      setEnvironment(row.environment);
      setSenderId(row.sender_id);
      setBaseUrl(row.base_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SMS plugin");
      setPlugin(null);
    } finally {
      setLoading(false);
    }
  }, [pluginId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const handleSave = async (verify: boolean) => {
    if (!canWrite) return;
    setSaving(true);
    try {
      await updateSmsGatewayPlugin(pluginId, {
        environment,
        api_key: draftApiKey || undefined,
        api_secret: draftApiSecret || undefined,
        sender_id: senderId,
        base_url: baseUrl,
        verify_connection: verify,
        test_phone: verify ? testPhone || undefined : undefined,
      });
      setDraftApiKey("");
      setDraftApiSecret("");
      await refetch();
      toast.success(verify ? "Credentials checked" : "Configuration saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleTestSms = async () => {
    if (!canWrite) return;
    if (!testPhone.trim()) {
      toast.error("Enter a test phone number");
      return;
    }
    setSaving(true);
    try {
      // Save drafts first so Check now uses latest credentials.
      await updateSmsGatewayPlugin(pluginId, {
        environment,
        api_key: draftApiKey || undefined,
        api_secret: draftApiSecret || undefined,
        sender_id: senderId,
        base_url: baseUrl,
      });
      const result = await testSmsGatewayPlugin(pluginId, testPhone.trim());
      setDraftApiKey("");
      setDraftApiSecret("");
      await refetch();
      toast.success(result.message || "Test SMS sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test SMS failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading SMS settings…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">API: {error}</p>;
  }
  if (!plugin) return null;

  if (activeSection === "test") {
    return (
      <div className="overflow-hidden rounded-none border border-border bg-card">
        <div className="border-b border-border bg-muted/40 px-4 py-3">
          <p className="text-sm font-semibold">Check now</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Send a test SMS to verify API credentials and delivery.
          </p>
        </div>
        <div className="space-y-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${pluginId}-test-phone`}>Test phone</Label>
            <Input
              id={`${pluginId}-test-phone`}
              className="rounded-none"
              placeholder="01XXXXXXXXX"
              value={testPhone}
              disabled={!canWrite}
              onChange={(e) => setTestPhone(e.target.value)}
            />
          </div>
          <Button
            className="rounded-none"
            disabled={!canWrite || saving}
            onClick={() => void handleTestSms()}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            Check now
          </Button>
          {plugin.connection_message ? (
            <p className="text-[11px] text-muted-foreground">{plugin.connection_message}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-none border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">API Credentials</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Storefront phone OTP uses the active (enabled) SMS gateway.
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
          <Label htmlFor={`${pluginId}-env`}>Environment</Label>
          <select
            id={`${pluginId}-env`}
            value={environment}
            disabled={!canWrite}
            onChange={(e) => setEnvironment(e.target.value === "production" ? "production" : "sandbox")}
            className="flex h-8 w-full rounded-none border border-input bg-background px-2.5 py-1 text-xs shadow-sm"
          >
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${pluginId}-sender`}>Sender ID</Label>
          <Input
            id={`${pluginId}-sender`}
            className="rounded-none"
            value={senderId}
            disabled={!canWrite}
            onChange={(e) => setSenderId(e.target.value)}
            placeholder="Approved sender / SID"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${pluginId}-key`}>API Key</Label>
          <Input
            id={`${pluginId}-key`}
            type="password"
            className="rounded-none"
            value={draftApiKey}
            disabled={!canWrite}
            onChange={(e) => setDraftApiKey(e.target.value)}
            placeholder={plugin.api_key_set ? `Saved ${plugin.api_key_hint || "••••"}` : "API key"}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${pluginId}-secret`}>API Secret (optional)</Label>
          <Input
            id={`${pluginId}-secret`}
            type="password"
            className="rounded-none"
            value={draftApiSecret}
            disabled={!canWrite}
            onChange={(e) => setDraftApiSecret(e.target.value)}
            placeholder={plugin.api_secret_set ? "••••••••" : "API secret"}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${pluginId}-url`}>Base URL (optional override)</Label>
          <Input
            id={`${pluginId}-url`}
            className="rounded-none"
            value={baseUrl}
            disabled={!canWrite}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
        <Button
          className="rounded-none"
          disabled={!canWrite || saving}
          onClick={() => void handleSave(false)}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
        <Button
          variant="outline"
          className="rounded-none"
          disabled={!canWrite || saving}
          onClick={() => void handleSave(true)}
        >
          Save &amp; check
        </Button>
      </div>
    </div>
  );
}
