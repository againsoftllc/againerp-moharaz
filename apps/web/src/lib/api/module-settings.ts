import { apiFetch } from "./client";
import type { SimpleSettingsValues } from "@/lib/workspace/simple-module-settings";

export type ModuleSettingsResponse = {
  module_id: string;
  values: SimpleSettingsValues;
  /** False until someone saves the settings page for this company. */
  saved: boolean;
};

export function fetchModuleSettings(moduleId: string): Promise<ModuleSettingsResponse> {
  return apiFetch<ModuleSettingsResponse>(`/api/v1/module-settings/${moduleId}`);
}

export function saveModuleSettings(moduleId: string, values: SimpleSettingsValues): Promise<ModuleSettingsResponse> {
  return apiFetch<ModuleSettingsResponse>(`/api/v1/module-settings/${moduleId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
}
