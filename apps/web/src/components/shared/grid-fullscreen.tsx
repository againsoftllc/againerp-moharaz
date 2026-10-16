"use client";

import { useCallback, useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

type HeaderProps = {
  fullscreen?: boolean;
  onToggle?: () => void;
};

/** AG Grid header control — sits left of select-all (actions column). */
export function GridFullscreenHeader({ fullscreen = false, onToggle }: HeaderProps) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <button
        type="button"
        aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen table"}
        title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded-none text-muted-foreground",
          "hover:text-foreground focus:outline-none focus-visible:ring-0",
        )}
      >
        {fullscreen ? (
          <Minimize2 className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        ) : (
          <Maximize2 className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        )}
      </button>
    </div>
  );
}

export function useGridFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    setFullscreen((v) => !v);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  return {
    fullscreen,
    toggleFullscreen,
    fullscreenClassName: fullscreen
      ? "fixed inset-0 z-[100] flex flex-col bg-background p-0"
      : undefined,
  };
}
