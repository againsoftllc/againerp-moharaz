"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Cloud, HardDrive, ImageIcon, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  updateCloudflarePlugin,
  useCloudflarePlugin,
} from "@/lib/api/use-cloudflare-plugin";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { isCloudflareAccountVerified } from "@/lib/plugins/cloudflare";
import { CloudflareConnectButton } from "@/components/settings/plugins/cloudflare-connect-button";
import { usePluginsStore } from "@/lib/store/plugins-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SectionId = "account" | "media" | "r2" | "images";

type Props = {
  activeSection: SectionId;
};

function statusBadge(status: string) {
  if (status === "connected") return <Badge variant="success">Connected</Badge>;
  if (status === "error") return <Badge variant="warning">Error</Badge>;
  return <Badge variant="muted">Disconnected</Badge>;
}

function PanelShell({
  title,
  description,
  trailing,
  children,
  footer,
}: {
  title: string;
  description?: string;
  trailing?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-none border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description ? (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
      <div className="space-y-4 p-4">{children}</div>
      {footer ? (
        <div className="flex flex-wrap gap-2 border-t border-border bg-muted/20 px-4 py-3">{footer}</div>
      ) : null}
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-[11px] font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function CloudflarePluginPanel({ activeSection }: Props) {
  const canWrite = useAdminCanWrite();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { plugin, loading, error, refetch } = useCloudflarePlugin();
  const [saving, setSaving] = useState<string | null>(null);
  const [draftToken, setDraftToken] = useState("");
  const [draftOauthClientId, setDraftOauthClientId] = useState("");
  const [draftOauthClientSecret, setDraftOauthClientSecret] = useState("");
  const [draftR2Secret, setDraftR2Secret] = useState("");
  const [draftImagesToken, setDraftImagesToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [r2Bucket, setR2Bucket] = useState("");
  const [r2AccessKeyId, setR2AccessKeyId] = useState("");
  const [r2PublicBaseUrl, setR2PublicBaseUrl] = useState("");
  const [imagesAccountHash, setImagesAccountHash] = useState("");
  const [mediaStorage, setMediaStorage] = useState<"local" | "r2">("local");

  const verified = isCloudflareAccountVerified(plugin);

  useEffect(() => {
    if (!plugin) return;
    setAccountId(plugin.accountId);
    setDraftOauthClientId(plugin.oauthClientId || "");
    setR2Bucket(plugin.r2Bucket);
    setR2AccessKeyId(plugin.r2AccessKeySet ? "********" : "");
    setR2PublicBaseUrl(plugin.r2PublicBaseUrl);
    setImagesAccountHash(plugin.imagesAccountHash);
    setMediaStorage(plugin.mediaStorage);
  }, [plugin]);

  useEffect(() => {
    const oauth = searchParams.get("oauth");
    if (!oauth) return;
    if (oauth === "success") {
      usePluginsStore.getState().installPlugin("cloudflare");
      toast.success("Cloudflare connected successfully");
      void refetch();
    } else if (oauth === "error") {
      const message = searchParams.get("message") ?? "Cloudflare connection failed";
      toast.error(decodeURIComponent(message.replace(/\+/g, " ")));
    }
    router.replace("/workspace/plugins/cloudflare");
  }, [searchParams, router, refetch]);

  const handleSave = async (
    action: "account" | "r2" | "images" | "media",
    verify: boolean,
  ) => {
    if (!canWrite) return;
    setSaving(action);
    try {
      if (action === "account") {
        await updateCloudflarePlugin({
          accountId: accountId.trim() || undefined,
          apiToken: draftToken.trim() || undefined,
          oauthClientId: draftOauthClientId.trim() || undefined,
          oauthClientSecret: draftOauthClientSecret.trim() || undefined,
          verifyAccount: verify,
        });
        setDraftToken("");
        setDraftOauthClientSecret("");
      } else if (action === "r2") {
        await updateCloudflarePlugin({
          r2Bucket,
          r2AccessKeyId: r2AccessKeyId === "********" ? undefined : r2AccessKeyId,
          r2SecretAccessKey: draftR2Secret || undefined,
          r2PublicBaseUrl,
          verifyR2: verify,
        });
        setDraftR2Secret("");
      } else if (action === "images") {
        await updateCloudflarePlugin({
          imagesAccountHash,
          imagesApiToken: draftImagesToken || undefined,
          verifyImages: verify,
        });
        setDraftImagesToken("");
      } else {
        await updateCloudflarePlugin({ mediaStorage });
      }
      await refetch();
      toast.success(verify ? "Verified and saved" : "Configuration saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Cloudflare settings…
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        <p className="font-medium text-destructive">Could not load Cloudflare settings</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 rounded-none"
          onClick={() => void refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!plugin) return null;

  if (activeSection === "account") {
    return (
      <PanelShell
        title="Cloudflare Access"
        description="Save Account ID + API token (and optional OAuth app keys). Verify once — R2, media, and automation reuse this access."
        trailing={statusBadge(plugin.accountStatus)}
        footer={
          <>
            <Button
              size="sm"
              variant="outline"
              className="rounded-none"
              disabled={!canWrite || saving === "account"}
              onClick={() => void handleSave("account", false)}
            >
              {saving === "account" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Save access
            </Button>
            <Button
              size="sm"
              className="rounded-none"
              disabled={!canWrite || saving === "account"}
              onClick={() => void handleSave("account", true)}
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              Verify &amp; Connect
            </Button>
          </>
        }
      >
        <div className="border border-border bg-muted/30 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Connect with Cloudflare (OAuth)</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Optional one-click login. Set OAuth Client ID / Secret below first if the button is
                disabled.
              </p>
            </div>
            <Cloud className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          </div>
          <CloudflareConnectButton
            className="mt-3"
            disabled={!canWrite}
            ensureInstalled={false}
            connected={plugin.accountStatus === "connected" && plugin.authMethod === "oauth"}
            oauthAvailable={plugin.oauthAvailable}
          />
          {plugin.accountStatus === "connected" && plugin.authMethod === "oauth" ? (
            <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400">
              Connected via OAuth{plugin.accountName ? ` · ${plugin.accountName}` : ""}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="cf-oauth-client-id"
            label="OAuth Client ID"
            hint="From Cloudflare → Manage Account → OAuth clients"
          >
            <Input
              id="cf-oauth-client-id"
              className="rounded-none font-mono text-[12px]"
              value={draftOauthClientId}
              onChange={(e) => setDraftOauthClientId(e.target.value)}
              placeholder={
                plugin.oauthClientIdSet ? "Saved — paste to replace" : "2360… OAuth Client ID"
              }
              disabled={!canWrite}
              autoComplete="off"
            />
          </Field>
          <Field
            id="cf-oauth-client-secret"
            label="OAuth Client Secret"
            hint={plugin.oauthClientSecretSet ? "Secret saved — leave blank to keep" : "Shown once when you create the OAuth app"}
          >
            <Input
              id="cf-oauth-client-secret"
              type="password"
              className="rounded-none font-mono text-[12px]"
              value={draftOauthClientSecret}
              onChange={(e) => setDraftOauthClientSecret(e.target.value)}
              placeholder={
                plugin.oauthClientSecretSet ? "•••••••• (leave blank to keep)" : "cfoc_…"
              }
              disabled={!canWrite}
              autoComplete="new-password"
            />
          </Field>
        </div>

        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>API token access (recommended)</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground">
          <Cloud className="h-4 w-4 text-primary" />
          <span className="font-medium">Saved Cloudflare access</span>
          {statusBadge(plugin.accountStatus)}
          {plugin.apiTokenHint ? (
            <span className="text-muted-foreground">Token {plugin.apiTokenHint}</span>
          ) : null}
          {plugin.accountName ? (
            <span className="text-muted-foreground">· {plugin.accountName}</span>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="cf-account-id"
            label="Account ID"
            hint="Dashboard URL / right sidebar — or leave blank and Verify will auto-detect"
            className="sm:col-span-2"
          >
            <Input
              id="cf-account-id"
              className="rounded-none font-mono text-[12px]"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="059a2f76e81a299afdd8265409806f2f"
              disabled={!canWrite}
              autoComplete="off"
            />
          </Field>
          <Field
            id="cf-api-token"
            label="API Token"
            hint="Create at My Profile → API Tokens — needs Account read + Workers R2 Storage Write"
            className="sm:col-span-2"
          >
            <Input
              id="cf-api-token"
              type="password"
              className="rounded-none font-mono text-[12px]"
              value={draftToken}
              onChange={(e) => setDraftToken(e.target.value)}
              placeholder={
                plugin.apiTokenSet
                  ? "•••••••• (leave blank to keep saved token)"
                  : "cfut_… paste API token"
              }
              disabled={!canWrite}
              autoComplete="new-password"
            />
          </Field>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          After <strong className="font-medium text-foreground">Verify &amp; Connect</strong>, this
          token is stored for R2 uploads and reuse. You can rotate it anytime by pasting a new token
          and verifying again.
        </p>
      </PanelShell>
    );
  }

  if (!verified) {
    return (
      <div className="border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
        <Cloud className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
        <p className="mt-3 text-sm font-medium text-foreground">Account verification required</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          Open <strong>Account Verification</strong> and connect via OAuth or API token. Then Media,
          R2, and Images options unlock.
        </p>
      </div>
    );
  }

  if (activeSection === "media") {
    return (
      <PanelShell
        title="Media Storage"
        description="Choose where new image and media files are stored — local disk or Cloudflare R2."
        footer={
          <Button
            size="sm"
            className="rounded-none"
            disabled={!canWrite || saving === "media"}
            onClick={() => void handleSave("media", false)}
          >
            {saving === "media" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save storage preference
          </Button>
        }
      >
        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 border border-border p-3 transition-colors",
            mediaStorage === "local" ? "border-primary bg-primary/5" : "hover:bg-muted/30",
          )}
        >
          <input
            type="radio"
            name="media-storage"
            checked={mediaStorage === "local"}
            onChange={() => setMediaStorage("local")}
            disabled={!canWrite}
            className="mt-1 rounded-none"
          />
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              Local storage
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Files save to API server disk (`/uploads/media/`).
            </p>
          </div>
        </label>
        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 border border-border p-3 transition-colors",
            mediaStorage === "r2" ? "border-primary bg-primary/5" : "hover:bg-muted/30",
            plugin.r2Status !== "connected" && "opacity-60",
          )}
        >
          <input
            type="radio"
            name="media-storage"
            checked={mediaStorage === "r2"}
            onChange={() => setMediaStorage("r2")}
            disabled={!canWrite || plugin.r2Status !== "connected"}
            className="mt-1 rounded-none"
          />
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Cloud className="h-4 w-4 text-primary" />
              Cloudflare R2
              {plugin.r2Status !== "connected" ? (
                <Badge variant="muted">Connect R2 first</Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              New uploads go to your R2 bucket via CDN URL.
            </p>
          </div>
        </label>
      </PanelShell>
    );
  }

  if (activeSection === "r2") {
    return (
      <PanelShell
        title="R2 Object Storage"
        description="Bucket + public CDN URL required. S3 access keys optional if the Cloudflare API token already has R2 write."
        trailing={statusBadge(plugin.r2Status)}
        footer={
          <>
            <Button
              size="sm"
              variant="outline"
              className="rounded-none"
              disabled={!canWrite || saving === "r2"}
              onClick={() => void handleSave("r2", false)}
            >
              Save
            </Button>
            <Button
              size="sm"
              className="rounded-none"
              disabled={!canWrite || saving === "r2"}
              onClick={() => void handleSave("r2", true)}
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              Verify R2 Connection
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="cf-r2-bucket" label="Bucket name" className="sm:col-span-2">
            <Input
              id="cf-r2-bucket"
              className="rounded-none"
              value={r2Bucket}
              onChange={(e) => setR2Bucket(e.target.value)}
              placeholder="againerp-media"
              disabled={!canWrite}
            />
          </Field>
          <Field id="cf-r2-key" label="Access Key ID (optional)">
            <Input
              id="cf-r2-key"
              className="rounded-none"
              value={r2AccessKeyId}
              onChange={(e) => setR2AccessKeyId(e.target.value)}
              placeholder="Leave blank to use API token"
              disabled={!canWrite}
            />
          </Field>
          <Field id="cf-r2-secret" label="Secret Access Key (optional)">
            <Input
              id="cf-r2-secret"
              type="password"
              className="rounded-none"
              value={draftR2Secret}
              onChange={(e) => setDraftR2Secret(e.target.value)}
              placeholder="Leave blank to use API token"
              disabled={!canWrite}
            />
          </Field>
          <Field id="cf-r2-cdn" label="Public CDN base URL" className="sm:col-span-2">
            <Input
              id="cf-r2-cdn"
              className="rounded-none"
              value={r2PublicBaseUrl}
              onChange={(e) => setR2PublicBaseUrl(e.target.value)}
              placeholder="https://pub-xxxxx.r2.dev"
              disabled={!canWrite}
            />
          </Field>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      title="Cloudflare Images"
      description="Optional image optimization API — account hash and a dedicated Images token."
      trailing={statusBadge(plugin.imagesStatus)}
      footer={
        <>
          <Button
            size="sm"
            variant="outline"
            className="rounded-none"
            disabled={!canWrite || saving === "images"}
            onClick={() => void handleSave("images", false)}
          >
            Save
          </Button>
          <Button
            size="sm"
            className="rounded-none"
            disabled={!canWrite || saving === "images"}
            onClick={() => void handleSave("images", true)}
          >
            <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
            Verify Images API
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="cf-images-hash" label="Account hash" className="sm:col-span-2">
          <Input
            id="cf-images-hash"
            className="rounded-none"
            value={imagesAccountHash}
            onChange={(e) => setImagesAccountHash(e.target.value)}
            placeholder="Images delivery account hash"
            disabled={!canWrite}
          />
        </Field>
        <Field
          id="cf-images-token"
          label="Images API token"
          className="sm:col-span-2"
          hint={plugin.imagesApiTokenHint ? `Current: ${plugin.imagesApiTokenHint}` : undefined}
        >
          <Input
            id="cf-images-token"
            type="password"
            className="rounded-none"
            value={draftImagesToken}
            onChange={(e) => setDraftImagesToken(e.target.value)}
            placeholder={
              plugin.imagesApiTokenSet ? "Leave blank to keep current" : "Images API token"
            }
            disabled={!canWrite}
          />
        </Field>
      </div>
    </PanelShell>
  );
}
