"use client";

import { useEffect } from "react";
import {
  blockedPluginsFromCenter,
  type CenterEntitlements,
} from "@/lib/center/entitlements";
import { useModuleSettingsStore } from "@/lib/store/module-settings-store";
import { usePluginsStore } from "@/lib/store/plugins-store";

type EntitlementsResponse =
  | { bound: false; detail?: string }
  | { bound: true; error: true; detail?: string; status?: number }
  | { bound: true; error: false; data: CenterEntitlements };

/**
 * Pull Center entitlements once on admin mount and apply to module + plugin visibility.
 */
export function useCenterEntitlementsSync() {
  const applyCenterEntitlements = useModuleSettingsStore((s) => s.applyCenterEntitlements);
  const applyCenterPluginEntitlements = usePluginsStore((s) => s.applyCenterPluginEntitlements);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/center/entitlements", { cache: "no-store" });
        const body = (await res.json()) as EntitlementsResponse;
        if (cancelled) return;

        if (!body.bound) {
          applyCenterEntitlements({ bound: false, error: null });
          applyCenterPluginEntitlements({ bound: false });
          return;
        }
        if ("error" in body && body.error) {
          applyCenterEntitlements({
            bound: true,
            error: body.detail || "Center entitlements failed",
          });
          return;
        }
        if ("data" in body && body.data) {
          applyCenterEntitlements({ bound: true, data: body.data, error: null });
          applyCenterPluginEntitlements({
            bound: true,
            blocked: blockedPluginsFromCenter(body.data),
          });
        }
      } catch (err) {
        if (!cancelled) {
          applyCenterEntitlements({
            bound: true,
            error: err instanceof Error ? err.message : "Center sync failed",
          });
        }
      }
    }

    void run();
    const id = window.setInterval(() => void run(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [applyCenterEntitlements, applyCenterPluginEntitlements]);
}
