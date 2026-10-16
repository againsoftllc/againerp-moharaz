"use client";

import { apiFetch } from "@/lib/api/client";

export type AiUsageBreakdownEntry = {
  input_tokens?: number;
  output_tokens?: number;
  calls?: number;
  estimated_cost_usd?: number;
  errors?: number;
};

export type ApiAiUsageSummary = {
  chat_turns: number;
  tool_calls: number;
  tool_errors: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  estimated_cost_usd: number;
  estimated_cost_is_partial: boolean;
  by_provider: Record<string, AiUsageBreakdownEntry>;
  by_model: Record<string, AiUsageBreakdownEntry>;
  by_tool: Record<string, AiUsageBreakdownEntry>;
};

export async function fetchMyAiUsage(days = 30): Promise<ApiAiUsageSummary> {
  return apiFetch<ApiAiUsageSummary>(`/api/v1/ai/usage/me?days=${days}`, { cache: "no-store" });
}

export async function fetchCompanyAiUsage(days = 30): Promise<ApiAiUsageSummary> {
  return apiFetch<ApiAiUsageSummary>(`/api/v1/ai/usage?days=${days}`, { cache: "no-store" });
}
