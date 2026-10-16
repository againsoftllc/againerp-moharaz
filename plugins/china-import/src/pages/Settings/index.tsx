"use client";

import type { ChinaImportSettings, ConnectionTestResult } from "../../types";
import type { ProviderMeta } from "../../core/types";
import { Card, Field, inputClassName, buttonClassName, StateBlock } from "../../components";

export function SettingsPage({
  settings,
  dirty,
  providers,
  onChange,
  onSave,
  onReset,
  onTest,
  testing,
  testResult,
}: {
  settings: ChinaImportSettings;
  dirty: boolean;
  providers: ProviderMeta[];
  onChange: (patch: Partial<ChinaImportSettings>) => void;
  onSave: () => void;
  onReset: () => void;
  onTest: () => void;
  testing: boolean;
  testResult: ConnectionTestResult | null;
}) {
  const implemented = providers.filter((p) => p.implemented);
  const planned = providers.filter((p) => !p.implemented);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground">API Settings</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Stored in browser localStorage only. Never synced to catalog or inventory.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Active Provider" hint="Core UI never binds to a marketplace SDK">
            <select
              className={inputClassName()}
              value={settings.activeProviderId}
              onChange={(e) =>
                onChange({ activeProviderId: e.target.value as ChinaImportSettings["activeProviderId"] })
              }
            >
              {implemented.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Debug Mode" hint="Show raw request/response + cURL in API Explorer">
            <select
              className={inputClassName()}
              value={settings.debugMode ? "1" : "0"}
              onChange={(e) => onChange({ debugMode: e.target.value === "1" })}
            >
              <option value="0">Off</option>
              <option value="1">On</option>
            </select>
          </Field>

          <Field label="API Base URL" hint="Default: https://openapi.elim.asia">
            <input
              className={inputClassName()}
              value={settings.baseUrl}
              onChange={(e) => onChange({ baseUrl: e.target.value })}
              placeholder="https://openapi.elim.asia"
            />
          </Field>

          <Field label="API Key" hint="Sent as x-api-key header">
            <input
              className={inputClassName()}
              type="password"
              autoComplete="off"
              value={settings.apiKey}
              onChange={(e) => onChange({ apiKey: e.target.value })}
              placeholder="Your Elim API key"
            />
          </Field>

          <Field label="Timeout (ms)">
            <input
              className={inputClassName()}
              type="number"
              min={3000}
              max={120000}
              value={settings.timeoutMs}
              onChange={(e) => onChange({ timeoutMs: Number(e.target.value) })}
            />
          </Field>

          <Field label="Retry Count">
            <input
              className={inputClassName()}
              type="number"
              min={0}
              max={5}
              value={settings.retryCount}
              onChange={(e) => onChange({ retryCount: Number(e.target.value) })}
            />
          </Field>

          <Field label="Environment">
            <select
              className={inputClassName()}
              value={settings.environment}
              onChange={(e) =>
                onChange({
                  environment: e.target.value === "production" ? "production" : "sandbox",
                })
              }
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </Field>

          <Field label="Default Platform">
            <select
              className={inputClassName()}
              value={settings.defaultPlatform}
              onChange={(e) =>
                onChange({
                  defaultPlatform: e.target.value === "alibaba" ? "alibaba" : "taobao",
                })
              }
            >
              <option value="taobao">Taobao</option>
              <option value="alibaba">1688 / Alibaba</option>
            </select>
          </Field>

          <Field label="Default Language">
            <select
              className={inputClassName()}
              value={settings.defaultLang}
              onChange={(e) => {
                const v = e.target.value;
                onChange({
                  defaultLang: v === "vi" || v === "zh" || v === "en" ? v : "en",
                });
              }}
            >
              <option value="en">English</option>
              <option value="vi">Vietnamese</option>
              <option value="zh">Chinese</option>
            </select>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={buttonClassName("primary")} onClick={onSave}>
            Save{dirty ? " *" : ""}
          </button>
          <button
            type="button"
            className={buttonClassName("secondary")}
            onClick={onTest}
            disabled={testing}
          >
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <button type="button" className={buttonClassName("ghost")} onClick={onReset}>
            Reset defaults
          </button>
        </div>
      </Card>

      {planned.length > 0 ? (
        <Card className="p-4">
          <p className="text-xs font-semibold text-foreground">Future providers (registered stubs)</p>
          <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            {planned.map((p) => (
              <li key={p.id}>
                {p.name} — not implemented
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {testResult ? (
        <StateBlock
          tone={testResult.ok ? "success" : "error"}
          title={testResult.ok ? "✅ Connected" : "❌ Failed"}
          description={`API Version: ${testResult.apiVersion ?? "—"} · Latency: ${testResult.latencyMs}ms · Quota: ${
            testResult.quota
              ? `${testResult.quota.remaining ?? "?"} remaining of ${testResult.quota.limit ?? "?"}`
              : "not available"
          } · ${testResult.message}`}
        />
      ) : null}
    </div>
  );
}
