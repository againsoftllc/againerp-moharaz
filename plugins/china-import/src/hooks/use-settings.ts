"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChinaImportSettings, ChinaImportSettingsInput, ConnectionTestResult } from "../types";
import { connectionService } from "../services/connection.service";

export function useChinaImportSettings() {
  const [settings, setSettings] = useState<ChinaImportSettings>(() =>
    connectionService.getSettings(),
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSettings(connectionService.getSettings());
  }, []);

  const updateLocal = useCallback((patch: ChinaImportSettingsInput) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const save = useCallback(() => {
    const next = connectionService.saveSettings(settings);
    setSettings(next);
    setDirty(false);
    return next;
  }, [settings]);

  const reload = useCallback(() => {
    const next = connectionService.getSettings();
    setSettings(next);
    setDirty(false);
    return next;
  }, []);

  const reset = useCallback(() => {
    const next = connectionService.resetSettings();
    setSettings(next);
    setDirty(false);
    return next;
  }, []);

  return { settings, dirty, updateLocal, save, reload, reset, setSettings };
}

export function useTestConnection() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);

  const test = useCallback(async (settings?: ChinaImportSettings) => {
    setTesting(true);
    try {
      const next = await connectionService.testConnection(settings);
      setResult(next);
      return next;
    } finally {
      setTesting(false);
    }
  }, []);

  return { testing, result, test, setResult };
}
