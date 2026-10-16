"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store/app-store";
import type { AiBriefing } from "@/lib/dashboard/types";

type Props = {
  briefing: AiBriefing;
};

/** DS-AI-BRIEFING — narrative summary with follow-up CTA. */
export function AiWidget({ briefing }: Props) {
  const setAiDrawerOpen = useAppStore((s) => s.setAiDrawerOpen);

  return (
    <div data-component="DS-AI-BRIEFING" className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500 dark:text-violet-400" aria-hidden />
        <p className="text-xs font-medium">{briefing.title}</p>
      </div>
      <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
        {briefing.bullets.map((bullet, i) => (
          <li key={i}>{bullet}</li>
        ))}
      </ul>
      {briefing.ctaLabel ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-0 text-xs text-primary hover:bg-transparent"
          onClick={() => setAiDrawerOpen(true)}
        >
          {briefing.ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}
