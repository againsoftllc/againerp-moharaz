"use client";

import { useMemo } from "react";
import { useSettingsStore } from "@/lib/store/settings-store";
import {
  defaultSalesSettingsValues,
  mergeSalesSettingsValues,
  salesSettingsToFlags,
  type SalesFeatureFlags,
  type SalesSettingKey,
  type SalesSettingsValues,
} from "@/lib/sales/sales-settings";

export function useSalesSettingsValues(): SalesSettingsValues {
  const values = useSettingsStore((s) => s.values);
  return useMemo(() => mergeSalesSettingsValues(values), [values]);
}

export function useSalesFeatureFlags(): SalesFeatureFlags {
  const values = useSalesSettingsValues();
  return useMemo(() => salesSettingsToFlags(values), [values]);
}

export function useSetSalesSetting() {
  const setValue = useSettingsStore((s) => s.setValue);
  return (key: SalesSettingKey, value: boolean, label: string) => {
    setValue(key, value, { label });
  };
}

export function useResetSalesSettings() {
  const resetCategory = useSettingsStore((s) => s.resetCategory);
  return () => {
    resetCategory(Object.keys(defaultSalesSettingsValues()));
  };
}
