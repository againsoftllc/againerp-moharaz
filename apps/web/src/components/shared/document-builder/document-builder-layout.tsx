"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  subtitle?: string;
  statusBadge?: ReactNode;
  canvas: ReactNode;
  context: ReactNode;
  footer: ReactNode;
  previewMode?: "document" | "email";
  onPreviewModeChange?: (mode: "document" | "email") => void;
  className?: string;
};

/** Shared 70/30 document builder shell — SMW quotations & future doc types */
export function DocumentBuilderLayout({
  title,
  subtitle,
  statusBadge,
  canvas,
  context,
  footer,
  previewMode = "document",
  onPreviewModeChange,
  className,
}: Props) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <header className="shrink-0 border-b bg-background px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold">{title}</h1>
              {statusBadge}
            </div>
            {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          {onPreviewModeChange && (
            <div className="flex rounded-md border border-input p-0.5">
              {(["document", "email"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onPreviewModeChange(mode)}
                  className={cn(
                    "rounded px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                    previewMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="min-h-0 overflow-y-auto border-b lg:border-b-0 lg:border-r">{canvas}</div>
        <aside className="min-h-0 overflow-y-auto bg-muted/10 p-4">{context}</aside>
      </div>

      <footer className="sticky bottom-0 z-10 shrink-0 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {footer}
      </footer>
    </div>
  );
}
