"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  History,
  RotateCcw,
  Save,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { findPlugin, PLUGIN_CATEGORIES } from "@/lib/settings/plugins/registry";
import { usePluginsStore } from "@/lib/store/plugins-store";
import { useSmartPcBuilderNavStore } from "@/lib/store/smart-pc-builder-nav-store";
import { fetchServerPluginStates } from "@/lib/api/plugin-install-state";
import {
  installCloudflarePlugin,
  uninstallCloudflarePlugin,
  updateCloudflarePlugin,
  useCloudflarePlugin,
} from "@/lib/api/use-cloudflare-plugin";
import {
  installAgainDropApiPlugin,
  uninstallAgainDropApiPlugin,
  updateAgainDropApiPlugin,
  type AgainDropApiPluginUpdateInput,
} from "@/lib/api/again-drop-api-plugin";
import {
  installBkashPlugin,
  uninstallBkashPlugin,
  updateBkashPlugin,
} from "@/lib/api/bkash-plugin";
import {
  installSslcommerzPlugin,
  uninstallSslcommerzPlugin,
  updateSslcommerzPlugin,
} from "@/lib/api/sslcommerz-plugin";
import {
  installPaypalPlugin,
  uninstallPaypalPlugin,
  updatePaypalPlugin,
} from "@/lib/api/paypal-plugin";
import {
  installStripePlugin,
  uninstallStripePlugin,
  updateStripePlugin,
} from "@/lib/api/stripe-plugin";
import { upsertPlatformSetting } from "@/lib/api/platform-settings";
import {
  installZktecoPlugin,
  uninstallZktecoPlugin,
  updateZktecoPlugin,
} from "@/lib/api/zkteco-plugin";
import {
  installPathaoPlugin,
  uninstallPathaoPlugin,
  updatePathaoPlugin,
} from "@/lib/api/pathao-plugin";
import {
  installMarketingTrackingPlugin,
  uninstallMarketingTrackingPlugin,
  updateMarketingTrackingPlugin,
} from "@/lib/api/marketing-tracking-plugin";
import {
  installAgainBuilderPlugin,
  uninstallAgainBuilderPlugin,
  updateAgainBuilderPlugin,
} from "@/lib/api/again-builder-plugin";
import {
  installSmartPcBuilderPlugin,
  uninstallSmartPcBuilderPlugin,
  updateSmartPcBuilderPlugin,
} from "@/lib/api/smart-pc-builder-plugin";
import {
  installPriceUpdatePlugin,
  uninstallPriceUpdatePlugin,
  updatePriceUpdatePlugin,
} from "@/lib/api/price-update-plugin";
import { SettingsLayerNav } from "@/components/settings/settings-layer-nav";
import { PluginBrandMark, PluginFieldRow } from "@/components/settings/plugins/plugin-field-row";
import { BankEmiBanksPanel } from "@/components/settings/plugins/bank-emi-banks-panel";
import { AiSearchPluginPanel } from "@/components/settings/plugins/ai-search-plugin-panel";
import { BkashPluginPanel } from "@/components/settings/plugins/bkash-plugin-panel";
import { SslcommerzPluginPanel } from "@/components/settings/plugins/sslcommerz-plugin-panel";
import { PaypalPluginPanel } from "@/components/settings/plugins/paypal-plugin-panel";
import { StripePluginPanel } from "@/components/settings/plugins/stripe-plugin-panel";
import { ZktecoPluginPanel } from "@/components/settings/plugins/zkteco-plugin-panel";
import { PathaoPluginPanel } from "@/components/settings/plugins/pathao-plugin-panel";
import { SmsGatewayPluginPanel } from "@/components/settings/plugins/sms-gateway-plugin-panel";
import {
  installSmsGatewayPlugin,
  isSmsGatewayPluginId as isSmsGateway,
  uninstallSmsGatewayPlugin,
  updateSmsGatewayPlugin,
} from "@/lib/api/sms-gateway-plugin";
import { MarketingTrackingPluginPanel } from "@/components/settings/plugins/marketing-tracking-plugin-panel";
import { CloudflareConnectButton } from "@/components/settings/plugins/cloudflare-connect-button";
import { CloudflarePluginPanel } from "@/components/settings/plugins/cloudflare-plugin-panel";
import { AgainDropApiPanel } from "@/components/settings/plugins/again-drop-api-panel";
import { AgainBuilderPluginPanel } from "@/components/settings/plugins/again-builder-plugin-panel";
import { SmartPcBuilderPluginPanel } from "@/components/settings/plugins/smart-pc-builder-plugin-panel";
import { PriceUpdatePluginPanel } from "@/components/settings/plugins/price-update-plugin-panel";
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";

type Props = { pluginId: string };

export function PluginConfigWorkspace({ pluginId }: Props) {
  const plugin = findPlugin(pluginId);
  const pluginState = usePluginsStore((s) => s.plugins[pluginId]);
  const cloudflareState = useCloudflarePlugin();
  const cloudflareApi = pluginId === "cloudflare" ? cloudflareState.plugin : null;
  const history = usePluginsStore((s) => s.history);
  const installPlugin = usePluginsStore((s) => s.installPlugin);
  const uninstallPlugin = usePluginsStore((s) => s.uninstallPlugin);
  const setEnabled = usePluginsStore((s) => s.setEnabled);
  const savePluginConfig = usePluginsStore((s) => s.savePluginConfig);
  const resetPluginConfig = usePluginsStore((s) => s.resetPluginConfig);

  const [activeSection, setActiveSection] = useState("");
  const [draft, setDraft] = useState<Record<string, string | boolean | number>>({});
  const [showHistory, setShowHistory] = useState(false);

  const installed = Boolean(pluginState?.installed);
  const enabled = Boolean(pluginState?.enabled);

  useEffect(() => {
    if (plugin?.sections[0] && !activeSection) {
      setActiveSection(plugin.sections[0].id);
    }
  }, [plugin, activeSection]);

  const smartPcBuilderBadges = useSmartPcBuilderNavStore((s) => s.badges);
  const smartPcBuilderJumpToken = useSmartPcBuilderNavStore((s) => s.jumpToken);
  useEffect(() => {
    if (pluginId !== "smart-pc-builder" || smartPcBuilderJumpToken === 0) return;
    const target = useSmartPcBuilderNavStore.getState().targetSection;
    if (target) setActiveSection(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartPcBuilderJumpToken, pluginId]);

  // The browser's install flag is only a cache — an install made in another
  // browser or machine must show up here too. The server is the truth.
  const hydrateFromServer = usePluginsStore((s) => s.hydrateFromServer);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const states = await fetchServerPluginStates();
        if (!cancelled) hydrateFromServer(states);
      } catch {
        /* keep whatever the browser had rather than blanking the screen */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateFromServer]);

  const current = (key: string, defaultValue: string | boolean | number) => {
    if (key in draft) return draft[key];
    if (pluginState?.config && key in pluginState.config) return pluginState.config[key];
    return defaultValue;
  };

  const patchDraft = (key: string, value: string | boolean | number) => {
    setDraft((d) => {
      const next: Record<string, string | boolean | number> = { ...d, [key]: value };
      // AgainDropAPI: typing a real API key auto-disables the server-key toggle.
      if (pluginId === "again-drop-api" && key === "api_key") {
        const raw = String(value).trim();
        if (
          raw &&
          raw !== "__server_again_drop_key__" &&
          raw !== "__server_elim_key__" &&
          raw !== "__custom_key_saved__"
        ) {
          next.use_server_key = false;
        }
      }
      if (pluginId === "again-drop-api" && key === "use_server_key" && value === true) {
        next.api_key = "__server_again_drop_key__";
      }
      return next;
    });
  };

  const dirtyCount = Object.keys(draft).length;
  const activeSectionDef = plugin?.sections.find((s) => s.id === activeSection);
  const pluginHistory = history.filter((h) => h.pluginId === pluginId).slice(0, 15);

  const fieldLabels = useMemo(() => {
    if (!plugin) return {};
    const labels: Record<string, string> = {};
    for (const section of plugin.sections) {
      for (const field of section.fields) labels[field.key] = field.label;
    }
    return labels;
  }, [plugin]);

  const handleSave = () => {
    if (!plugin || !installed) return;
    if (dirtyCount === 0) {
      toast.info("No changes to save");
      return;
    }
    let payload = { ...draft };
    if (pluginId === "again-drop-api") {
      const rawKey = String(payload.api_key ?? pluginState?.config?.api_key ?? "").trim();
      const isMarker =
        !rawKey ||
        rawKey === "__server_again_drop_key__" ||
        rawKey === "__server_elim_key__" ||
        rawKey === "__custom_key_saved__";
      if (!isMarker) {
        payload = { ...payload, use_server_key: false, api_key: rawKey };
      }
      // Persist to the database via the API; localStorage only mirrors state.
      const update: AgainDropApiPluginUpdateInput = {};
      if ("base_url" in payload) update.base_url = String(payload.base_url);
      if ("api_key" in payload && !isMarker) update.api_key = rawKey;
      if ("use_server_key" in payload) {
        update.use_server_key = payload.use_server_key === true;
        if (update.use_server_key) update.api_key = "";
      }
      if ("environment" in payload)
        update.environment = payload.environment === "production" ? "production" : "sandbox";
      if ("timeout_ms" in payload) update.timeout_ms = Number(payload.timeout_ms) || 30000;
      if ("retry_count" in payload) update.retry_count = Number(payload.retry_count) || 0;
      if ("default_platform" in payload)
        update.default_platform = payload.default_platform === "alibaba" ? "alibaba" : "taobao";
      if ("default_lang" in payload) update.default_lang = String(payload.default_lang);

      void updateAgainDropApiPlugin(update)
        .then(() => {
          window.dispatchEvent(new Event("again-drop-api:refresh"));
          toast.success("Saved to database");
        })
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : "Failed to save to database");
        });

      // Don't keep the raw secret in localStorage — store a marker instead.
      if (!isMarker) {
        payload = { ...payload, api_key: "__custom_key_saved__" };
      }
    }
    savePluginConfig(pluginId, payload, { labels: fieldLabels });
    setDraft({});
    toast.success("Plugin configuration saved");
  };

  const handleReset = () => {
    resetPluginConfig(pluginId);
    setDraft({});
    toast.success("Configuration reset to defaults");
  };

  const handleInstall = () => {
    installPlugin(pluginId);
    if (pluginId === "cloudflare") {
      void installCloudflarePlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register Cloudflare plugin");
      });
    }
    if (pluginId === "again-drop-api") {
      void installAgainDropApiPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register AgainDropAPI plugin");
      });
    }
    if (pluginId === "bkash") {
      void installBkashPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register bKash plugin");
      });
    }
    if (pluginId === "sslcommerz") {
      void installSslcommerzPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register SSLCommerz plugin");
      });
    }
    if (pluginId === "paypal") {
      void installPaypalPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register PayPal plugin");
      });
    }
    if (pluginId === "stripe") {
      void installStripePlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register Stripe plugin");
      });
    }
    if (pluginId === "zkteco") {
      void installZktecoPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register ZKTeco plugin");
      });
    }
    if (pluginId === "pathao") {
      void installPathaoPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register Pathao plugin");
      });
    }
    if (isSmsGateway(pluginId)) {
      void installSmsGatewayPlugin(pluginId).catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register SMS gateway");
      });
    }
    if (pluginId === "marketing-tracking") {
      void installMarketingTrackingPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register Marketing Tracking plugin");
      });
    }
    if (pluginId === "again-builder") {
      void installAgainBuilderPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register Again Builder plugin");
      });
    }
    if (pluginId === "smart-pc-builder") {
      void installSmartPcBuilderPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register Smart PC Builder plugin");
      });
    }
    if (pluginId === "price-update") {
      void installPriceUpdatePlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register Price Compare plugin");
      });
    }
    if (pluginId === "bank-emi") {
      void upsertPlatformSetting("plugin.bank_emi.installed", "true").catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to enable Bank EMI for checkout");
      });
    }
    if (pluginId === "ai-search") {
      void Promise.all([
        upsertPlatformSetting("plugin.ai_search.installed", "true"),
        upsertPlatformSetting("plugin.ai_search.enabled", "true"),
      ]).catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to register AI Search plugin");
      });
    }
    toast.success(`${plugin?.name} installed`);
  };

  const handleUninstall = () => {
    uninstallPlugin(pluginId);
    if (pluginId === "cloudflare") {
      void uninstallCloudflarePlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to uninstall Cloudflare plugin");
      });
    }
    if (pluginId === "again-drop-api") {
      void uninstallAgainDropApiPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to uninstall AgainDropAPI plugin");
      });
    }
    if (pluginId === "bkash") {
      void uninstallBkashPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to uninstall bKash plugin");
      });
    }
    if (pluginId === "sslcommerz") {
      void uninstallSslcommerzPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to uninstall SSLCommerz plugin");
      });
    }
    if (pluginId === "paypal") {
      void uninstallPaypalPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to uninstall PayPal plugin");
      });
    }
    if (pluginId === "stripe") {
      void uninstallStripePlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to uninstall Stripe plugin");
      });
    }
    if (pluginId === "zkteco") {
      void uninstallZktecoPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to uninstall ZKTeco plugin");
      });
    }
    if (pluginId === "pathao") {
      void uninstallPathaoPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to uninstall Pathao plugin");
      });
    }
    if (isSmsGateway(pluginId)) {
      void uninstallSmsGatewayPlugin(pluginId).catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to uninstall SMS gateway");
      });
    }
    if (pluginId === "marketing-tracking") {
      void uninstallMarketingTrackingPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to uninstall Marketing Tracking plugin");
      });
    }
    if (pluginId === "again-builder") {
      void uninstallAgainBuilderPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to uninstall Again Builder plugin");
      });
    }
    if (pluginId === "smart-pc-builder") {
      void uninstallSmartPcBuilderPlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to uninstall Smart PC Builder plugin");
      });
    }
    if (pluginId === "price-update") {
      void uninstallPriceUpdatePlugin().catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to uninstall Price Compare plugin");
      });
    }
    if (pluginId === "bank-emi") {
      void upsertPlatformSetting("plugin.bank_emi.installed", "false").catch(() => undefined);
    }
    if (pluginId === "ai-search") {
      void upsertPlatformSetting("plugin.ai_search.installed", "false").catch(() => undefined);
    }
    setDraft({});
    toast.success(`${plugin?.name} uninstalled`);
  };

  if (!plugin) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">Plugin not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href="/workspace/plugins">Back to Plugins</Link>
        </Button>
      </div>
    );
  }

  if (!installed) {
    return (
      <div className="space-y-5">
        <SettingsLayerNav compact />
        <div className="rounded-none border border-dashed border-border bg-muted/20 p-8 text-center">
          <PluginBrandMark name={plugin.name} color={plugin.brandColor} />
          <h1 className="mt-4 page-title">{plugin.name}</h1>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{plugin.longDescription ?? plugin.description}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Badge variant="outline">{PLUGIN_CATEGORIES[plugin.category].label}</Badge>
            <Badge variant="muted">v{plugin.version}</Badge>
          </div>
          {pluginId === "cloudflare" ? (
            <div className="mx-auto mt-6 max-w-sm">
              <CloudflareConnectButton
                oauthAvailable={cloudflareApi?.oauthAvailable ?? false}
                size="default"
              />
              <p className="mt-4 text-[11px] text-muted-foreground">অথবা আগে plugin install করুন</p>
            </div>
          ) : null}
          <Button className={pluginId === "cloudflare" ? "mt-3" : "mt-6"} onClick={handleInstall}>
            Install Plugin
          </Button>
          <p className="mt-3">
            <Link href="/workspace/plugins" className="text-xs text-muted-foreground hover:text-foreground">
              ← Back to all plugins
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative pb-20">
      <SettingsLayerNav compact />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <PluginBrandMark name={plugin.name} color={plugin.brandColor} />
          <div>
            <Link
              href="/workspace/plugins"
              className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Plugins
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="page-title">{plugin.name}</h1>
              <Badge variant={enabled ? "success" : "muted"}>{enabled ? "Active" : "Disabled"}</Badge>
            </div>
            <p className="page-subtitle">{plugin.description}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {PLUGIN_CATEGORIES[plugin.category].label} · v{plugin.version} · {plugin.author}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {plugin.appHref && (
            <Button size="sm" asChild>
              <Link href={plugin.appHref}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open app
              </Link>
            </Button>
          )}
          {pluginId === "cloudflare" && (
            <CloudflareConnectButton
              oauthAvailable={cloudflareApi?.oauthAvailable ?? false}
              connected={cloudflareApi?.accountStatus === "connected"}
            />
          )}
          <ActivityTriggerButton
            entity={{
              type: "settings",
              id: `plugin:${pluginId}`,
              label: `${plugin.name} Plugin`,
            }}
          />
          {plugin.docsUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={plugin.docsUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Docs
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
            <History className="mr-1.5 h-3.5 w-3.5" /> History
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
          <Button variant="outline" size="sm" onClick={handleUninstall}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Uninstall
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-none border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Zap className={cn("h-4 w-4", enabled ? "text-emerald-500" : "text-muted-foreground")} />
          <div>
            <p className="text-sm font-medium">Plugin Status</p>
            <p className="text-[11px] text-muted-foreground">
              {enabled
                ? "Integration is active"
                : "Plugin is installed but disabled"}
            </p>
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <span className="text-xs text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const next = e.target.checked;
              setEnabled(pluginId, next);
              if (pluginId === "cloudflare") {
                void updateCloudflarePlugin({ enabled: next }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to update plugin status");
                });
              }
              if (pluginId === "bkash") {
                void updateBkashPlugin({ enabled: next }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to update plugin status");
                });
              }
              if (pluginId === "sslcommerz") {
                void updateSslcommerzPlugin({ enabled: next }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to update plugin status");
                });
              }
              if (pluginId === "paypal") {
                void updatePaypalPlugin({ enabled: next }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to update plugin status");
                });
              }
              if (pluginId === "stripe") {
                void updateStripePlugin({ enabled: next }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to update plugin status");
                });
              }
              if (pluginId === "zkteco") {
                void updateZktecoPlugin({ enabled: next }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to update plugin status");
                });
              }
              if (pluginId === "pathao") {
                void updatePathaoPlugin({ enabled: next }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to update plugin status");
                });
              }
              if (isSmsGateway(pluginId)) {
                void updateSmsGatewayPlugin(pluginId, { enabled: next }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to update plugin status");
                });
              }
              if (pluginId === "marketing-tracking") {
                void updateMarketingTrackingPlugin({ enabled: next }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to update plugin status");
                });
              }
              if (pluginId === "ai-search") {
                void upsertPlatformSetting("plugin.ai_search.enabled", next ? "true" : "false").catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to update plugin status");
                });
              }
              if (pluginId === "price-update") {
                void updatePriceUpdatePlugin({ enabled: next }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to update plugin status");
                });
              }
              if (pluginId === "again-builder") {
                void updateAgainBuilderPlugin({ enabled: next }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to update plugin status");
                });
              }
              if (pluginId === "smart-pc-builder") {
                void updateSmartPcBuilderPlugin({ enabled: next }).catch((err) => {
                  toast.error(err instanceof Error ? err.message : "Failed to update plugin status");
                });
              }
              toast.success(next ? "Plugin enabled" : "Plugin disabled");
            }}
            className="h-4 w-4 rounded border-input"
          />
        </label>
      </div>

      {showHistory && (
        <div className="mt-4 rounded-none border border-border bg-muted/20 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change History</p>
          {pluginHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">No configuration changes yet.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {pluginHistory.map((h) => (
                <li key={h.id} className="rounded-none border border-border bg-card px-3 py-2 text-[11px]">
                  <p className="font-semibold">{h.label}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    <span className="line-through">{String(h.oldValue)}</span>
                    {" → "}
                    <span className="font-medium text-foreground">{String(h.newValue)}</span>
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {h.changedBy} · {formatDateTime(h.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[220px_1fr]">
        <nav className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Configuration
          </p>
          <ul className="space-y-0.5 rounded-none border border-border bg-card p-1">
            {plugin.sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-none px-3 py-2 text-left text-xs transition-colors",
                    activeSection === section.id
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <span>{section.title}</span>
                  {pluginId === "smart-pc-builder" ? (
                    smartPcBuilderBadges[section.id] ? (
                      <span
                        className={cn(
                          "text-[10px] font-semibold tabular-nums",
                          section.id === "overview" ? "bg-amber-500/15 px-1.5 text-amber-600" : "opacity-70",
                        )}
                      >
                        {smartPcBuilderBadges[section.id]}
                      </span>
                    ) : null
                  ) : (
                    <span className="text-[10px] tabular-nums opacity-70">{section.fields.length}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          {pluginId === "again-drop-api" ? <AgainDropApiPanel /> : null}
          {pluginId === "again-builder" ? <AgainBuilderPluginPanel activeSection={activeSection} /> : null}
          {pluginId === "smart-pc-builder" ? <SmartPcBuilderPluginPanel activeSection={activeSection} /> : null}
          {pluginId === "bank-emi" && activeSection === "banks" ? (
            <BankEmiBanksPanel pluginId={pluginId} />
          ) : pluginId === "cloudflare" ? (
            <CloudflarePluginPanel activeSection={activeSection as "account" | "media" | "r2" | "images"} />
          ) : pluginId === "bkash" ? (
            <BkashPluginPanel activeSection={activeSection as "credentials" | "checkout"} />
          ) : pluginId === "sslcommerz" ? (
            <SslcommerzPluginPanel activeSection={activeSection as "credentials" | "checkout"} />
          ) : pluginId === "paypal" ? (
            <PaypalPluginPanel activeSection={activeSection as "credentials" | "checkout"} />
          ) : pluginId === "stripe" ? (
            <StripePluginPanel activeSection={activeSection as "credentials" | "checkout"} />
          ) : pluginId === "zkteco" ? (
            <ZktecoPluginPanel activeSection={activeSection as "connection" | "list"} />
          ) : pluginId === "pathao" ? (
            <PathaoPluginPanel activeSection={activeSection as "connection" | "pickup" | "automation"} />
          ) : isSmsGateway(pluginId) ? (
            <SmsGatewayPluginPanel pluginId={pluginId} activeSection={activeSection as "credentials" | "test"} />
          ) : pluginId === "ai-search" ? (
            <AiSearchPluginPanel activeSection={activeSection as "connection" | "test"} />
          ) : pluginId === "marketing-tracking" ? (
            <MarketingTrackingPluginPanel activeSection={activeSection as "sites" | "events" | "capi"} />
          ) : pluginId === "price-update" ? (
            <PriceUpdatePluginPanel activeSection={activeSection as "settings"} />
          ) : pluginId === "again-builder" || pluginId === "smart-pc-builder" ? null : (
            activeSectionDef && (
            <div className="overflow-hidden rounded-none border border-border bg-card">
              <div className="border-b border-border bg-muted/40 px-4 py-3">
                <p className="text-sm font-semibold">{activeSectionDef.title}</p>
                {activeSectionDef.description && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{activeSectionDef.description}</p>
                )}
              </div>
              <div>
                {activeSectionDef.fields.map((field) => (
                  <PluginFieldRow
                    key={field.key}
                    field={field}
                    value={current(field.key, field.defaultValue)}
                    dirty={field.key in draft}
                    onChange={(v) => patchDraft(field.key, v)}
                  />
                ))}
              </div>
            </div>
            )
          )}
        </div>
      </div>

      {dirtyCount > 0 && (
        <div className="settings-save-bar print-hide fixed inset-x-0 bottom-0 z-40 border-t border-input bg-card/95 px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{dirtyCount}</span> unsaved change
              {dirtyCount !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft({})}>
                Discard
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="mr-1.5 h-3.5 w-3.5" /> Save Configuration
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
