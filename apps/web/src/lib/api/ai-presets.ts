import { apiFetch } from "@/lib/api/client";

/** AI presets — company rules per AI field/job (AI → Settings → Presets), /api/v1/ai/presets. */

export type AiPresetTarget = {
  key: string;
  label: string;
  module: string;
  used_by: string;
  placeholder: string;
};

export type AiPreset = {
  id: string;
  target: string;
  title: string;
  instruction: string;
  examples: string | null;
  is_active: boolean;
  version: number;
  updated_at: string | null;
};

export type AiPresetVersion = {
  id: string;
  version: number;
  title: string;
  instruction: string;
  examples: string | null;
  is_active: boolean;
  change: "update" | "delete" | "rollback" | string;
  changed_by: string | null;
  created_at: string | null;
};

export type AiPresetInput = {
  instruction: string;
  examples: string | null;
  is_active: boolean;
  title?: string;
};

export type AiPresetTestResult = {
  url: string;
  rule_applied: boolean;
  name: string;
  short_description: string | null;
  description: string | null;
  category_name: string | null;
  category_names: string[];
  tags: string[];
  warranty: string | null;
  seo_title: string | null;
  seo_description: string | null;
  warnings: string[];
};

const BASE = "/api/v1/ai/presets";
const path = (target: string) => `${BASE}/${encodeURIComponent(target)}`;

export function fetchAiPresetTargets(): Promise<AiPresetTarget[]> {
  return apiFetch<AiPresetTarget[]>(`${BASE}/targets`);
}

export function fetchAiPresets(): Promise<AiPreset[]> {
  return apiFetch<AiPreset[]>(BASE, { cache: "no-store" });
}

export function saveAiPreset(target: string, input: AiPresetInput): Promise<AiPreset> {
  return apiFetch<AiPreset>(path(target), { method: "PUT", body: JSON.stringify(input) });
}

export function deleteAiPreset(target: string): Promise<void> {
  return apiFetch<void>(path(target), { method: "DELETE" });
}

export function fetchAiPresetVersions(target: string): Promise<AiPresetVersion[]> {
  return apiFetch<AiPresetVersion[]>(`${path(target)}/versions`, { cache: "no-store" });
}

export function rollbackAiPreset(target: string, versionId: string): Promise<AiPreset> {
  return apiFetch<AiPreset>(`${path(target)}/rollback`, {
    method: "POST",
    body: JSON.stringify({ version_id: versionId }),
  });
}

export function testAiPreset(
  target: string,
  input: { url: string; instruction: string; examples: string | null; is_active: boolean },
): Promise<AiPresetTestResult> {
  return apiFetch<AiPresetTestResult>(`${path(target)}/test`, { method: "POST", body: JSON.stringify(input) });
}
