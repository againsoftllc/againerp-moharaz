"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import type { ThemePreference } from "@/lib/theme/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

type Props = {
  /** `segmented` — three-option control; `icon` — single cycle button */
  variant?: "segmented" | "icon" | "menu";
  className?: string;
};

/** Theme switching UI — wired to ThemeProvider + persistent store. */
export function ThemeSwitch({ variant = "segmented", className }: Props) {
  const { preference, setPreference, toggle, resolvedMode } = useTheme();

  if (variant === "icon") {
    const Icon = resolvedMode === "dark" ? Moon : Sun;
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9", className)}
        onClick={toggle}
        aria-label={`Theme: ${preference}. Click to change.`}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </Button>
    );
  }

  if (variant === "menu") {
    return (
      <div className={cn("space-y-1 px-2 py-1.5", className)}>
        <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Appearance</p>
        <div className="flex gap-1">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = preference === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPreference(opt.value)}
                className={cn(
                  "flex min-h-[36px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md border text-[10px] font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input bg-background text-muted-foreground hover:bg-muted",
                )}
                aria-pressed={active}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn("inline-flex rounded-lg border border-input bg-muted/40 p-0.5", className)}
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = preference === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPreference(opt.value)}
            className={cn(
              "flex min-h-[32px] items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={active}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
