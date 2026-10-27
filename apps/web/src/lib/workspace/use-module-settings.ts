"use client";

import { useEffect, useState } from "react";
import { fetchModuleSettings } from "@/lib/api/module-settings";
import { defaultSimpleModuleValues, mergeModuleSettings, type SimpleSettingsValues } from "./simple-module-settings";

/** A module's company settings for the screens they configure. Defaults until loaded (or when the load fails). */
export function useModuleSettings(moduleId: string): { values: SimpleSettingsValues; loaded: boolean } {
  const [values, setValues] = useState<SimpleSettingsValues>(() => defaultSimpleModuleValues(moduleId));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchModuleSettings(moduleId)
      .then((res) => {
        if (!cancelled) setValues(mergeModuleSettings(moduleId, res.values));
      })
      .catch(() => {
        /* keep the defaults: a settings read must never block the screen */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  return { values, loaded };
}
