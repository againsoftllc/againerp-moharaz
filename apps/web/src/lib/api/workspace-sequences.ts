"use client";

import { apiFetch } from "@/lib/api/client";

export type ApiSequence = {
  id: string;
  code: string;
  name: string;
  prefix: string;
  suffix: string;
  padding: number;
  next_number: number;
  step: number;
  reset_policy: "never" | "yearly" | "monthly";
  period_key: string;
  is_active: boolean;
  preview: string;
};

export type SequencePatch = Partial<
  Pick<ApiSequence, "name" | "prefix" | "suffix" | "padding" | "next_number" | "step" | "reset_policy" | "is_active">
>;

export async function fetchSequences(): Promise<ApiSequence[]> {
  const res = await apiFetch<{ data: ApiSequence[]; meta: { count: number } }>(
    "/api/v1/workspace/sequences",
    { cache: "no-store" },
  );
  return res.data;
}

export async function updateSequence(code: string, patch: SequencePatch): Promise<ApiSequence> {
  const res = await apiFetch<{ data: ApiSequence }>(
    `/api/v1/workspace/sequences/${encodeURIComponent(code)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return res.data;
}
