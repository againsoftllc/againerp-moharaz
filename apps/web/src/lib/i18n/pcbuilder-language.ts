import { useEffect } from "react";
import { loadCategorySettingsFromPlatform } from "@/lib/api/business-settings-sync";
import { findCategory } from "@/lib/settings/settings-schema";
import { useSettingsStore } from "@/lib/store/settings-store";

export type PcBuilderLanguage = "en" | "bn";
export const LANGUAGE_KEY = "pcbuilder.language";

/** The Smart PC Builder admin panel language (General tab). English unless Bangla is chosen. */
export function usePcBuilderLanguage(): PcBuilderLanguage {
  const raw = useSettingsStore((s) => s.values[LANGUAGE_KEY]);
  const setValue = useSettingsStore((s) => s.setValue);

  useEffect(() => {
    const item = findCategory("business", "pcbuilder")
      ?.sections.flatMap((s) => s.groups.flatMap((g) => g.items))
      .find((i) => i.key === LANGUAGE_KEY);
    if (!item) return;
    void loadCategorySettingsFromPlatform([item]).then((remote) => {
      const v = remote[LANGUAGE_KEY];
      if (v !== undefined) setValue(LANGUAGE_KEY, v, { label: "Language", reason: "Synced from platform" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return raw === "bn" ? "bn" : "en";
}
