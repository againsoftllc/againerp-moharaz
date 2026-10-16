import type { MarketingJourney } from "@/lib/mock-data/marketing";

export type JourneyStatus = MarketingJourney["status"];

export type ApiJourney = {
  id: string;
  name: string;
  trigger: string;
  steps: number;
  enrolled: number;
  completed: number;
  status: string;
  updated_at: string;
};

export type ApiJourneyListResponse = {
  data: ApiJourney[];
  meta: { count: number; active_count: number };
};

export type ApiJourneyResponse = {
  data: ApiJourney;
};

export type JourneyListParams = {
  search?: string;
  status?: string;
};

export type UpdateJourneyInput = {
  status?: JourneyStatus;
  name?: string;
  trigger?: string;
  steps?: number;
  enrolled?: number;
  completed?: number;
};

export function apiJourneyToMarketingJourney(row: ApiJourney): MarketingJourney {
  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger,
    steps: row.steps,
    enrolled: row.enrolled,
    completed: row.completed,
    status: row.status as JourneyStatus,
  };
}

export function buildJourneyQuery(params?: JourneyListParams): string {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function journeyUpdateToApiPayload(input: UpdateJourneyInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.status !== undefined) payload.status = input.status;
  if (input.name !== undefined) payload.name = input.name;
  if (input.trigger !== undefined) payload.trigger = input.trigger;
  if (input.steps !== undefined) payload.steps = input.steps;
  if (input.enrolled !== undefined) payload.enrolled = input.enrolled;
  if (input.completed !== undefined) payload.completed = input.completed;
  return payload;
}
