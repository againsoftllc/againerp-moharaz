"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import type { CompatibilityScenario } from "@/lib/mock-data/compatibility-scenarios";
import { compatibilityCache } from "@/lib/compatibility/compatibility-cache";
import { STATUS_LABELS } from "@/lib/compatibility/types";
import { useConfiguratorAttributeStore } from "@/lib/store/configurator-attribute-store";
import { useCompatibilityRuleStore } from "@/lib/store/compatibility-rule-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";

const SAMPLE_BUILD = {
  cap_cpu: { socket: "lga_1700", tdp: 125, core_count: 8 },
  cap_mobo: { socket: "lga_1700", ram_type: "ddr5", chipset: "z790" },
  cap_ram: { type: "ddr5", speed: 5600, capacity: 32 },
};

type Props = {
  configuratorProfileId: string;
  scenario?: CompatibilityScenario | null;
};

function statusBadge(status: string) {
  if (status === "compatible") return "success" as const;
  if (status === "warning") return "warning" as const;
  return "outline" as const;
}

function attrsFromScenario(scenario: CompatibilityScenario | null | undefined) {
  if (!scenario) return null;
  const cpu = scenario.components.find((c) => c.componentProfileId === "cap_cpu");
  const mobo = scenario.components.find((c) => c.componentProfileId === "cap_mobo");
  const ram = scenario.components.find((c) => c.componentProfileId === "cap_ram");
  return {
    cpuSocket: String(cpu?.attributes.socket ?? "lga_1700"),
    moboSocket: String(mobo?.attributes.socket ?? "lga_1700"),
    moboRamType: String(mobo?.attributes.ram_type ?? "ddr5"),
    ramType: String(ram?.attributes.type ?? "ddr5"),
    cpuTdp: String(cpu?.attributes.tdp ?? 125),
  };
}

export function CompatibilityEvaluatorPanel({ configuratorProfileId, scenario }: Props) {
  const evaluateBuild = useCompatibilityRuleStore((s) => s.evaluateBuild);
  const invalidateCache = useCompatibilityRuleStore((s) => s.invalidateCache);
  const fields = useConfiguratorAttributeStore((s) => s.fields);

  const scenarioAttrs = useMemo(() => attrsFromScenario(scenario), [scenario]);

  const [cpuSocket, setCpuSocket] = useState("lga_1700");
  const [moboSocket, setMoboSocket] = useState("lga_1700");
  const [moboRamType, setMoboRamType] = useState("ddr5");
  const [ramType, setRamType] = useState("ddr5");
  const [cpuTdp, setCpuTdp] = useState("125");
  const [result, setResult] = useState<ReturnType<typeof evaluateBuild> | null>(null);

  useEffect(() => {
    if (!scenarioAttrs) return;
    setCpuSocket(scenarioAttrs.cpuSocket);
    setMoboSocket(scenarioAttrs.moboSocket);
    setMoboRamType(scenarioAttrs.moboRamType);
    setRamType(scenarioAttrs.ramType);
    setCpuTdp(scenarioAttrs.cpuTdp);
    setResult(null);
  }, [scenarioAttrs, scenario?.id]);

  const socketOptions = useMemo(() => {
    const f = fields.find((x) => x.profileId === "cap_cpu" && x.code === "socket");
    return f?.options ?? [];
  }, [fields]);

  const ramOptions = useMemo(() => {
    const f = fields.find((x) => x.profileId === "cap_mobo" && x.code === "ram_type");
    return f?.options ?? [];
  }, [fields]);

  const runEvaluate = (skipCache = false) => {
    if (skipCache) invalidateCache(configuratorProfileId);
    const components = scenario?.components ?? [
      {
        componentProfileId: "cap_cpu",
        componentName: "CPU",
        attributes: {
          ...SAMPLE_BUILD.cap_cpu,
          socket: cpuSocket,
          tdp: Number(cpuTdp),
        },
      },
      {
        componentProfileId: "cap_mobo",
        componentName: "Motherboard",
        attributes: {
          ...SAMPLE_BUILD.cap_mobo,
          socket: moboSocket,
          ram_type: moboRamType,
        },
      },
      {
        componentProfileId: "cap_ram",
        componentName: "RAM",
        attributes: {
          ...SAMPLE_BUILD.cap_ram,
          type: ramType,
        },
      },
    ];
    const evaluation = evaluateBuild(configuratorProfileId, components);
    setResult(evaluation);
  };

  const cacheStats = compatibilityCache.stats();

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Live evaluator — storefront-এ same engine
        </p>
        {scenario && (
          <Badge variant="secondary" className="text-[9px]">
            Scenario: {scenario.titleBn}
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground">
          Cache: {cacheStats.size} · TTL {cacheStats.ttlMs / 1000}s
        </span>
      </div>

      {scenario && (
        <p className="mt-2 text-[11px] text-muted-foreground">{scenario.descriptionBn}</p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-[10px]">CPU Socket</Label>
          <Select value={cpuSocket} onChange={(e) => setCpuSocket(e.target.value)} className="h-8 text-xs">
            {socketOptions.map((o) => (
              <option key={o.id} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Motherboard Socket</Label>
          <Select value={moboSocket} onChange={(e) => setMoboSocket(e.target.value)} className="h-8 text-xs">
            {socketOptions.map((o) => (
              <option key={o.id} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">CPU TDP (W)</Label>
          <Input value={cpuTdp} onChange={(e) => setCpuTdp(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Motherboard RAM Type</Label>
          <Select value={moboRamType} onChange={(e) => setMoboRamType(e.target.value)} className="h-8 text-xs">
            {ramOptions.map((o) => (
              <option key={o.id} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">RAM Type</Label>
          <Select value={ramType} onChange={(e) => setRamType(e.target.value)} className="h-8 text-xs">
            {ramOptions.map((o) => (
              <option key={o.id} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => runEvaluate(false)}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Evaluate
        </Button>
        <Button size="sm" variant="outline" onClick={() => runEvaluate(true)}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Bypass cache
        </Button>
      </div>

      {result && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusBadge(result.status)} className="text-sm">
              {STATUS_LABELS[result.status]}
            </Badge>
            {scenario && (
              <Badge
                variant={result.status === scenario.expectedStatus ? "success" : "warning"}
                className="text-[10px]"
              >
                Expected: {STATUS_LABELS[scenario.expectedStatus]}
              </Badge>
            )}
            {result.cached && (
              <Badge variant="secondary" className="text-[10px]">
                cached
              </Badge>
            )}
          </div>
          <ul className="space-y-1 text-[11px]">
            {result.results.map((r) => (
              <li
                key={r.ruleId}
                className="rounded border border-input bg-background px-2 py-1"
              >
                <span className="font-medium">{r.ruleName}</span>
                <span className="text-muted-foreground"> — {r.branch.toUpperCase()}: </span>
                {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
