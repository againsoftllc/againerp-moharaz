"use client";

import { useMemo, useState } from "react";
import type { ProviderId } from "../../core/types";
import { MAPPING_FIXTURES } from "../../fixtures/mapping-samples";
import { mapProduct, type MappingResult } from "../../mapper/ProductMapper";
import { ExplorerJsonViewer } from "../../components/explorer/json-viewer";
import { MappingDebugPanel } from "../../components/mapping/debug-panel";
import { Card, Field, StateBlock, buttonClassName, inputClassName } from "../../components";
import { copyText, prettyJson } from "../../utils";
import { submitStagingJob } from "../../hooks/use-staging";

export function MappingPreviewPage({ onStaged }: { onStaged?: () => void } = {}) {
  const [provider, setProvider] = useState<ProviderId>("elim");
  const [fixtureId, setFixtureId] = useState("elim");
  const [rawJson, setRawJson] = useState(() => prettyJson(MAPPING_FIXTURES[0].raw));
  const [result, setResult] = useState<MappingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [staging, setStaging] = useState(false);
  const [stageMsg, setStageMsg] = useState<string | null>(null);

  const fixture = MAPPING_FIXTURES.find((f) => f.id === fixtureId) ?? MAPPING_FIXTURES[0];

  function runMapping(nextRaw?: unknown, nextProvider?: ProviderId) {
    setError(null);
    try {
      const parsed = nextRaw ?? JSON.parse(rawJson);
      const mapped = mapProduct(nextProvider ?? provider, parsed);
      setResult(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
      setResult(null);
    }
  }

  function loadFixture(id: string) {
    const f = MAPPING_FIXTURES.find((x) => x.id === id);
    if (!f) return;
    setFixtureId(id);
    setProvider(f.provider);
    setRawJson(prettyJson(f.raw));
    runMapping(f.raw, f.provider);
  }

  const universalJson = useMemo(
    () => (result ? prettyJson(result.product) : ""),
    [result],
  );

  async function onCopy() {
    if (!universalJson) return;
    const ok = await copyText(universalJson);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function onDownload() {
    if (!result) return;
    const blob = new Blob([prettyJson(result.product)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `universal-product-${result.product.providerProductId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onStageImport() {
    if (!result) return;
    setStaging(true);
    setStageMsg(null);
    try {
      const raw = JSON.parse(rawJson) as Record<string, unknown>;
      await submitStagingJob({
        provider: result.product.provider,
        source_label: `Mapping Preview · ${result.product.providerProductId}`,
        products: [
          {
            provider_product_id: String(result.product.providerProductId),
            universal: result.product as unknown as Record<string, unknown>,
            raw,
          },
        ],
      });
      setStageMsg("Staged for review — no ERP product created");
      onStaged?.();
    } catch (err) {
      setStageMsg(err instanceof Error ? err.message : "Staging failed");
    } finally {
      setStaging(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-foreground">Mapping Preview</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Provider JSON → Universal Product. No ERP writes. rawData always preserved.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {MAPPING_FIXTURES.map((f) => (
            <button
              key={f.id}
              type="button"
              className={buttonClassName(fixtureId === f.id ? "primary" : "secondary")}
              onClick={() => loadFixture(f.id)}
            >
              {f.label}
            </button>
          ))}
          <button type="button" className={buttonClassName("secondary")} onClick={() => runMapping()}>
            Run Mapping
          </button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Provider">
            <select
              className={inputClassName()}
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderId)}
            >
              <option value="elim">Elim</option>
              <option value="mock">Mock</option>
            </select>
          </Field>
          <Field label="Paste provider JSON">
            <span className="text-[11px] text-muted-foreground">Edit left panel or load a fixture</span>
          </Field>
        </div>
      </Card>

      {error ? <StateBlock tone="error" title="Mapping failed" description={error} /> : null}

      <div className="grid min-h-[28rem] gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Provider JSON</p>
          </div>
          <textarea
            className={inputClassName("min-h-[24rem] font-mono text-[11px] leading-relaxed")}
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-foreground">Universal Product</p>
            <button
              type="button"
              className={buttonClassName("secondary", "ml-auto")}
              disabled={!result}
              onClick={() => void onCopy()}
            >
              {copied ? "Copied" : "Copy JSON"}
            </button>
            <button
              type="button"
              className={buttonClassName("secondary")}
              disabled={!result}
              onClick={onDownload}
            >
              Download JSON
            </button>
            <button
              type="button"
              className={buttonClassName("primary")}
              disabled={!result || staging}
              onClick={() => void onStageImport()}
            >
              {staging ? "Staging…" : "Stage for import"}
            </button>
          </div>
          {stageMsg ? <p className="text-[11px] text-muted-foreground">{stageMsg}</p> : null}
          {result ? (
            <ExplorerJsonViewer value={result.product} title="Universal Product JSON" />
          ) : (
            <StateBlock title="No mapping yet" description="Load a fixture or paste JSON, then Run Mapping." />
          )}
        </div>
      </div>

      {result ? (
        <MappingDebugPanel validation={result.validation} traces={result.traces} />
      ) : null}
    </div>
  );
}
