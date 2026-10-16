import type { AudienceSegment } from "@/lib/mock-data/marketing";

export type ApiAudience = {
  id: string;
  name: string;
  members: number;
  growth: string;
  source: string;
  updated_at: string;
};

export type ApiAudienceListResponse = {
  data: ApiAudience[];
  meta: { count: number; total_members: number };
};

export type ApiAudienceResponse = {
  data: ApiAudience;
};

export type AudienceListParams = {
  search?: string;
};

export type UpdateAudienceInput = {
  name?: string;
  members?: number;
  growth?: string;
  source?: string;
};

export function apiAudienceToAudienceSegment(row: ApiAudience): AudienceSegment {
  return {
    id: row.id,
    name: row.name,
    members: row.members,
    growth: row.growth,
    source: row.source,
    updatedAt: row.updated_at.slice(0, 10),
  };
}

export function buildAudienceQuery(params?: AudienceListParams): string {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function audienceUpdateToApiPayload(input: UpdateAudienceInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.members !== undefined) payload.members = input.members;
  if (input.growth !== undefined) payload.growth = input.growth;
  if (input.source !== undefined) payload.source = input.source;
  return payload;
}
