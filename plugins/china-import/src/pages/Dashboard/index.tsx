"use client";

import type { ConnectionTestResult, ChinaImportSettings } from "../../types";
import type { ProviderMeta } from "../../core/types";
import { CHINA_IMPORT_PLUGIN_VERSION } from "../../config";
import { Card, StateBlock, buttonClassName } from "../../components";
import { ProviderHealthWidget } from "../../components/explorer/health-widget";
import { maskSecret } from "../../utils";

export function DashboardPage({
  settings,
  lastTest,
  onGoSettings,
  onGoSearch,
  onGoImageSearch,
  onGoExplorer,
  onGoMapping,
  onGoImportQueue,
  onGoEntityMapping,
  onTest,
  testing,
  providers,
}: {
  settings: ChinaImportSettings;
  lastTest: ConnectionTestResult | null;
  onGoSettings: () => void;
  onGoSearch: () => void;
  onGoImageSearch: () => void;
  onGoExplorer: () => void;
  onGoMapping: () => void;
  onGoImportQueue: () => void;
  onGoEntityMapping: () => void;
  onTest: () => void;
  testing: boolean;
  providers: ProviderMeta[];
}) {
  const configured = Boolean(settings.apiKey.trim()) || settings.activeProviderId === "mock";
  const active = providers.find((p) => p.id === settings.activeProviderId);
  const health = lastTest
    ? {
        ok: lastTest.ok,
        connected: lastTest.ok,
        latencyMs: lastTest.latencyMs,
        apiVersion: lastTest.apiVersion,
        quota: lastTest.quota,
        message: lastTest.message,
        checkedAt: lastTest.checkedAt,
        dailyRequests: 0,
        failedRequests: lastTest.ok ? 0 : 1,
        raw: lastTest.raw,
      }
    : null;

  return (
    <div className="space-y-4">
      <ProviderHealthWidget
        health={health}
        providerName={active?.name ?? settings.activeProviderId}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Plugin</p>
          <p className="mt-1 text-sm font-semibold text-foreground">China Import</p>
          <p className="mt-1 text-xs text-muted-foreground">
            v{CHINA_IMPORT_PLUGIN_VERSION} · provider engine
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Active Provider</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{active?.name ?? "—"}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground capitalize">
            {settings.environment} · {settings.baseUrl}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">API Key</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{maskSecret(settings.apiKey)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {configured ? "Ready" : "Not configured"}
          </p>
        </Card>
      </div>

      {lastTest ? (
        <StateBlock
          tone={lastTest.ok ? "success" : "error"}
          title={lastTest.ok ? "✅ Connected" : "❌ Failed"}
          description={`${lastTest.message} · latency ${lastTest.latencyMs}ms · version ${lastTest.apiVersion ?? "—"}`}
        />
      ) : (
        <StateBlock
          title="Connection not tested yet"
          description="Save settings, pick a provider, then run Test Connection. STEP-02 never writes ERP products."
        />
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClassName("primary")} onClick={onTest} disabled={testing}>
          {testing ? "Testing…" : "Test Connection"}
        </button>
        <button type="button" className={buttonClassName("secondary")} onClick={onGoMapping}>
          Mapping Preview
        </button>
        <button type="button" className={buttonClassName("secondary")} onClick={onGoExplorer}>
          API Explorer
        </button>
        <button type="button" className={buttonClassName("secondary")} onClick={onGoImportQueue}>
          Import Queue
        </button>
        <button type="button" className={buttonClassName("secondary")} onClick={onGoEntityMapping}>
          Smart Mapping
        </button>
        <button type="button" className={buttonClassName("secondary")} onClick={onGoSettings}>
          API Settings
        </button>
        <button type="button" className={buttonClassName("secondary")} onClick={onGoSearch}>
          Product Search
        </button>
        <button type="button" className={buttonClassName("secondary")} onClick={onGoImageSearch}>
          Image Search
        </button>
      </div>

      <Card className="p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">STEP 05 scope</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Smart mapping engine — brand, category, attribute, supplier</li>
          <li>Auto-detect existing ERP records · reuse or create suggestion</li>
          <li>Rule-based, fuzzy, AI suggestion stub, manual mapping</li>
          <li>Conflict resolution, merge tool, approval workflow</li>
        </ul>
      </Card>
    </div>
  );
}
