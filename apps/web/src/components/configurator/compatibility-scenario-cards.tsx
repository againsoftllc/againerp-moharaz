"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import {
  compatibilityScenarios,
  type CompatibilityScenario,
} from "@/lib/mock-data/compatibility-scenarios";
import { STATUS_LABELS } from "@/lib/compatibility/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
};

type Props = {
  activeScenarioId?: string | null;
  onSelectScenario: (scenario: CompatibilityScenario) => void;
};

export function CompatibilityScenarioCards({ activeScenarioId, onSelectScenario }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Scenario tester — এক ক্লিকে দেখুন rule কী করে
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {compatibilityScenarios.map((scenario) => {
          const Icon = ICONS[scenario.icon];
          const active = activeScenarioId === scenario.id;
          return (
            <button
              key={scenario.id}
              type="button"
              onClick={() => onSelectScenario(scenario)}
              className={cn(
                "rounded-lg border p-3 text-left transition-all hover:shadow-sm",
                active
                  ? "border-indigo-400 bg-indigo-50/50 ring-1 ring-indigo-400 dark:bg-indigo-950/40"
                  : "border-input bg-card hover:border-indigo-200",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    scenario.icon === "success" && "text-emerald-600",
                    scenario.icon === "error" && "text-red-600",
                    scenario.icon === "warning" && "text-amber-600",
                  )}
                />
                <span className="text-xs font-semibold leading-tight">{scenario.titleBn}</span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{scenario.descriptionBn}</p>
              <Badge variant="outline" className="mt-2 text-[9px]">
                Expected: {STATUS_LABELS[scenario.expectedStatus]}
              </Badge>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Card ক্লিক করলে নিচের evaluator-এ load হবে — Evaluate চাপুন। Storefront PC Builder-এ same rules।
      </p>
    </div>
  );
}
