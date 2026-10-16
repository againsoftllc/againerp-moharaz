"use client";

import { GitBranch, Lightbulb } from "lucide-react";
import { compatibilityRuleQuickStart } from "@/lib/mock-data/compatibility-scenarios";
import { Badge } from "@/components/ui/badge";

type Props = {
  onCreateRule?: () => void;
};

export function CompatibilityRuleQuickStart({ onCreateRule }: Props) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-semibold">Quick Start — common rules</h3>
        </div>
        <Badge variant="secondary" className="text-[9px]">Admin-friendly</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        প্রতিটি rule-এর সহজ ব্যাখ্যা। Design demo — seed rules-এ ইতিমধ্যে আছে; নতুন rule তৈরি করতে Create ব্যবহার করুন।
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {compatibilityRuleQuickStart.map((t) => (
          <div
            key={t.id}
            className="rounded-lg border border-background bg-background/90 p-3 shadow-sm"
          >
            <div className="flex items-start gap-2">
              <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{t.titleBn}</p>
                <p className="text-[10px] text-muted-foreground">{t.title}</p>
                <p className="mt-1 text-[11px]">{t.summaryBn}</p>
                <p className="mt-1 rounded bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                  উদাহরণ: {t.example}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {onCreateRule && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Custom rule দরকার?{" "}
          <button type="button" onClick={onCreateRule} className="font-medium text-primary hover:underline">
            Create rule
          </button>{" "}
          — IF/THEN form খুলবে
        </p>
      )}
    </div>
  );
}
