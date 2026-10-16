"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  GitBranch,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { CONFIGURATOR_BUILDER_PROFILES } from "@/lib/mock-data/compatibility-rules";
import type { CompatibilityScenario } from "@/lib/mock-data/compatibility-scenarios";
import { describeCondition, describeRuleBody } from "@/lib/compatibility/types";
import { useConfiguratorAttributeStore } from "@/lib/store/configurator-attribute-store";
import { useCompatibilityRuleStore } from "@/lib/store/compatibility-rule-store";
import { CompatibilityRuleFormSheet } from "@/components/configurator/compatibility-rule-form-sheet";
import { CompatibilityEvaluatorPanel } from "@/components/configurator/compatibility-evaluator-panel";
import { CompatibilityRuleQuickStart } from "@/components/configurator/compatibility-rule-quick-start";
import { CompatibilityScenarioCards } from "@/components/configurator/compatibility-scenario-cards";
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function statusVariant(status: string) {
  if (status === "compatible") return "success" as const;
  if (status === "warning") return "warning" as const;
  return "outline" as const;
}

type Props = {
  addTrigger?: number;
};

export function CompatibilityRulesList({ addTrigger = 0 }: Props) {
  const rules = useCompatibilityRuleStore((s) => s.rules);
  const loaded = useCompatibilityRuleStore((s) => s.loaded);
  const fetchRules = useCompatibilityRuleStore((s) => s.fetchRules);
  const deleteRule = useCompatibilityRuleStore((s) => s.deleteRule);
  const duplicateRule = useCompatibilityRuleStore((s) => s.duplicateRule);
  const attrProfiles = useConfiguratorAttributeStore((s) => s.profiles);

  useEffect(() => {
    if (!loaded) void fetchRules();
  }, [loaded, fetchRules]);

  const [builderFilter, setBuilderFilter] = useState("cfg_pc");
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<(typeof rules)[0] | null>(null);
  const [lastAddTrigger, setLastAddTrigger] = useState(addTrigger);
  const [showEvaluator, setShowEvaluator] = useState(true);
  const [activeScenario, setActiveScenario] = useState<CompatibilityScenario | null>(null);

  useEffect(() => {
    if (addTrigger !== lastAddTrigger) {
      setLastAddTrigger(addTrigger);
      setEditing(null);
      setSheetOpen(true);
    }
  }, [addTrigger, lastAddTrigger]);

  const profileNames = useMemo(
    () => new Map(attrProfiles.map((p) => [p.id, p.name])),
    [attrProfiles],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules
      .filter((r) => r.configuratorProfileId === builderFilter)
      .filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          describeRuleBody(r.body, profileNames).toLowerCase().includes(q),
      )
      .sort((a, b) => a.priority - b.priority);
  }, [rules, builderFilter, query, profileNames]);

  const builderName =
    CONFIGURATOR_BUILDER_PROFILES.find((p) => p.id === builderFilter)?.name ?? "Builder";

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const handleScenarioSelect = (scenario: CompatibilityScenario) => {
    setActiveScenario(scenario);
    setShowEvaluator(true);
    toast.info(`Scenario loaded: ${scenario.titleBn} — Evaluate চাপুন`);
  };

  return (
    <>
      <CompatibilityRuleQuickStart onCreateRule={openCreate} />

      <div className="mt-4">
        <CompatibilityScenarioCards
          activeScenarioId={activeScenario?.id ?? null}
          onSelectScenario={handleScenarioSelect}
        />
      </div>

      <div className="mt-4 rounded-lg border border-input bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Rule list — IF / THEN / ELSE</p>
        <p className="mt-1 text-[11px]">
          প্রতিটি rule-এ সহজ ব্যাখ্যা + technical IF block। Storefront PC Builder এই rules দিয়ে product filter করে।
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          value={builderFilter}
          onChange={(e) => setBuilderFilter(e.target.value)}
          className="h-8 w-[160px] text-xs"
        >
          {CONFIGURATOR_BUILDER_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search rules…"
          className="h-8 max-w-xs flex-1 text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setShowEvaluator((v) => !v)}
        >
          {showEvaluator ? "Hide tester" : "Show tester"}
        </Button>
        <Button size="sm" className="ml-auto h-8" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Create rule
        </Button>
      </div>

      {showEvaluator && (
        <div className="mt-3">
          <CompatibilityEvaluatorPanel
            configuratorProfileId={builderFilter}
            scenario={activeScenario}
          />
        </div>
      )}

      <div className="mt-3 space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-input py-12 text-center">
            <GitBranch className="mx-auto h-8 w-8 text-indigo-500/70" />
            <p className="mt-2 text-sm font-medium">No compatibility rules for {builderName}</p>
            <Button size="sm" className="mt-4" onClick={openCreate}>
              Create rule
            </Button>
          </div>
        ) : (
          filtered.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-input bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(rule);
                        setSheetOpen(true);
                      }}
                      className="text-left text-base font-semibold hover:text-primary"
                    >
                      {rule.name}
                    </button>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      priority {rule.priority}
                    </Badge>
                    <Badge variant={rule.active ? "success" : "muted"}>
                      {rule.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-foreground/80">
                    {describeRuleBody(rule.body, profileNames)}
                  </p>
                  {rule.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{rule.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={statusVariant(rule.body.then.status)} className="text-[10px]">
                      THEN: {rule.body.then.status}
                    </Badge>
                    <Badge variant={statusVariant(rule.body.else.status)} className="text-[10px]">
                      ELSE: {rule.body.else.status}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <ActivityTriggerButton
                    entity={{ type: "configurator_rule", id: rule.id, label: rule.name }}
                  />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(rule);
                        setSheetOpen(true);
                      }}
                    >
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        void duplicateRule(rule.id).then((id) => {
                          if (id) toast.success("Duplicated as draft");
                        });
                      }}
                    >
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        void deleteRule(rule.id).then(() => toast.success("Rule deleted"));
                      }}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
              </div>

              <div className="mt-3 rounded-md border border-dashed border-input bg-muted/10 p-2 text-[11px]">
                <span className="font-semibold text-indigo-600">IF</span>{" "}
                {rule.body.conditions.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && <span className="text-muted-foreground"> AND </span>}
                    {describeCondition(c, profileNames)}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <CompatibilityRuleFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        rule={editing}
        defaultConfiguratorProfileId={builderFilter}
      />
    </>
  );
}
