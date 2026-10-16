"use client";

import { useMemo } from "react";
import { calculateEmiPlans, formatEmiLabel } from "@/lib/plugins/bank-emi/calculator";
import { resolveEmiSettings } from "@/lib/plugins/bank-emi/settings";
import { usePluginsStore } from "@/lib/store/plugins-store";

export function useBankEmi(amount: number) {
  const pluginState = usePluginsStore((s) => s.plugins["bank-emi"]);

  const settings = useMemo(
    () =>
      resolveEmiSettings(
        pluginState?.config,
        pluginState?.installed ?? false,
        pluginState?.enabled ?? false,
      ),
    [pluginState],
  );

  const calculation = useMemo(() => calculateEmiPlans(amount, settings), [amount, settings]);

  const label = formatEmiLabel(settings.labelEn, settings.minOrderAmount);

  return {
    settings,
    calculation,
    label,
    isActive: settings.enabled && calculation.eligible,
    lowestMonthly: calculation.lowestMonthlyEmi,
  };
}
