"use client";

import { useMemo } from "react";
import { useSettingsStore } from "@/lib/store/settings-store";
import {
  customerSettingsToFlags,
  defaultCustomerSettingsValues,
  mergeCustomerSettingsValues,
  type CustomerFeatureFlags,
  type CustomerSettingKey,
  type CustomerSettingsValues,
} from "@/lib/customers/customer-settings";

export function useCustomerSettingsValues(): CustomerSettingsValues {
  const values = useSettingsStore((s) => s.values);
  return useMemo(() => mergeCustomerSettingsValues(values), [values]);
}

export function useCustomerFeatureFlags(): CustomerFeatureFlags {
  const values = useCustomerSettingsValues();
  return useMemo(() => customerSettingsToFlags(values), [values]);
}

export function useSetCustomerSetting() {
  const setValue = useSettingsStore((s) => s.setValue);
  return (key: CustomerSettingKey, value: boolean, label: string) => {
    setValue(key, value, { label });
  };
}

export function useResetCustomerSettings() {
  const resetCategory = useSettingsStore((s) => s.resetCategory);
  return () => {
    resetCategory(Object.keys(defaultCustomerSettingsValues()));
  };
}
