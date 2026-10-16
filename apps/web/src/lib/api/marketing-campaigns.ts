import type { CampaignStatus, CampaignType, MarketingCampaign } from "@/lib/mock-data/marketing";

export type ApiCampaign = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  audience: string;
  channels: string[];
  starts_at: string;
  ends_at: string | null;
  goal: string;
  progress: number;
  revenue: string;
  updated_at: string;
};

export type ApiCampaignListResponse = {
  data: ApiCampaign[];
  meta: { count: number; running_count: number };
};

export type ApiCampaignResponse = {
  data: ApiCampaign;
};

export type CampaignListParams = {
  search?: string;
  status?: string;
};

export type UpdateCampaignInput = {
  status?: CampaignStatus;
  name?: string;
  goal?: string;
  progress?: number;
};

export function apiCampaignToMarketingCampaign(row: ApiCampaign): MarketingCampaign {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type as CampaignType,
    status: row.status as CampaignStatus,
    audience: row.audience,
    channels: row.channels,
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? undefined,
    goal: row.goal,
    progress: row.progress,
    revenue: Number(row.revenue),
    updatedAt: row.updated_at.slice(0, 10),
  };
}

export function buildCampaignQuery(params?: CampaignListParams): string {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function campaignUpdateToApiPayload(input: UpdateCampaignInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.status !== undefined) payload.status = input.status;
  if (input.name !== undefined) payload.name = input.name;
  if (input.goal !== undefined) payload.goal = input.goal;
  if (input.progress !== undefined) payload.progress = input.progress;
  return payload;
}
