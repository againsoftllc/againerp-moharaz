"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";
import { COMMAND_PALETTE_OPEN_EVENT } from "@/lib/navigation/command-palette";
import { useActivityStore } from "@/lib/store/activity-store";

const CommandPalette = dynamic(
  () => import("@/components/command-palette").then((m) => m.CommandPalette),
  { ssr: false },
);
const ActivityDrawer = dynamic(
  () => import("@/components/activity/activity-drawer").then((m) => m.ActivityDrawer),
  { ssr: false },
);

/**
 * Mount heavy global overlays only when first needed — keeps ordinary route
 * startup free of cmdk / activity chunk compilation.
 * AI chat is mounted from AdminShell (floating widget).
 */
function OnDemandGlobalFeatures() {
  const activityOpen = useActivityStore((s) => s.drawerOpen);

  const [paletteMounted, setPaletteMounted] = useState(false);
  const [activityMounted, setActivityMounted] = useState(false);
  const paletteMountedRef = useRef(false);

  // Keep drawers mounted after first open (avoid effect setState lint / remount flicker).
  if (activityOpen && !activityMounted) setActivityMounted(true);

  useEffect(() => {
    const markMounted = () => {
      paletteMountedRef.current = true;
      setPaletteMounted(true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      if (paletteMountedRef.current) return; // CommandPalette owns toggle after mount
      event.preventDefault();
      markMounted();
      // Palette mounts closed; re-fire so it opens after the chunk loads.
      queueMicrotask(() => {
        document.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN_EVENT));
      });
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener(COMMAND_PALETTE_OPEN_EVENT, markMounted);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, markMounted);
    };
  }, []);

  return (
    <>
      {paletteMounted ? <CommandPalette /> : null}
      {activityMounted ? <ActivityDrawer /> : null}
    </>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        richColors
        position="bottom-left"
        offset={16}
        gap={8}
        closeButton
        duration={15000}
        toastOptions={{
          classNames: {
            toast: "!p-2 !min-h-0 !rounded-md !shadow-md !text-xs !pr-8 pointer-events-auto",
            title: "!text-xs !font-medium !leading-tight !w-full",
            description: "!text-[10px] !leading-tight",
            icon: "!h-3.5 !w-3.5",
            closeButton: "!h-4 !w-4 !z-20",
          },
        }}
      />
      <OnDemandGlobalFeatures />
    </>
  );
}
