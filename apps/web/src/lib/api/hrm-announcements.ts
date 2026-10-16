import { apiFetch } from "@/lib/api/client";
import type { MasterRow } from "@/lib/mock-data/hrm-recruitment-setup";

export type ApiHrmAnnouncement = {
  id: string;
  company_id: string;
  title: string;
  category: string | null;
  description: string | null;
  content: string | null;
  start_date: string | null;
  end_date: string | null;
  attachments: string | null;
  is_featured: boolean;
  is_high_priority: boolean;
  is_company_wide: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean | null;
  view_count: number | null;
};

type ApiListResponse = {
  data: ApiHrmAnnouncement[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmAnnouncement;
  errors: string[];
};

export type HrmAnnouncementWriteInput = {
  company_id?: string;
  title: string;
  category?: string;
  description?: string;
  content?: string;
  start_date?: string;
  end_date?: string;
  is_featured?: boolean;
  is_high_priority?: boolean;
  is_company_wide?: boolean;
};

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function asBool(value: unknown): boolean {
  return value === true || value === "true";
}

export function apiAnnouncementToMasterRow(row: ApiHrmAnnouncement): MasterRow {
  return {
    id: row.id,
    name: row.title,
    category: row.category ?? "",
    description: row.description ?? "",
    content: row.content ?? "",
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    isFeatured: row.is_featured,
    isHighPriority: row.is_high_priority,
    isCompanyWide: row.is_company_wide,
  };
}

export function masterPayloadToAnnouncementWrite(
  payload: Omit<MasterRow, "id">,
): HrmAnnouncementWriteInput {
  return {
    company_id: "default",
    title: String(payload.name ?? "").trim(),
    category: blankToNull(payload.category) ?? undefined,
    description: blankToNull(payload.description) ?? undefined,
    content: blankToNull(payload.content) ?? undefined,
    start_date: blankToNull(payload.startDate) ?? undefined,
    end_date: blankToNull(payload.endDate) ?? undefined,
    is_featured: asBool(payload.isFeatured),
    is_high_priority: asBool(payload.isHighPriority),
    is_company_wide: asBool(payload.isCompanyWide),
  };
}

export async function listHrmAnnouncements(params?: {
  category?: string;
  q?: string;
  featured_only?: boolean;
  high_priority_only?: boolean;
  active_only?: boolean;
}): Promise<MasterRow[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.category) qs.set("category", params.category);
  if (params?.q) qs.set("q", params.q);
  if (params?.featured_only) qs.set("featured_only", "true");
  if (params?.high_priority_only) qs.set("high_priority_only", "true");
  if (params?.active_only) qs.set("active_only", "true");
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/announcements?${qs.toString()}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map(apiAnnouncementToMasterRow);
}

export async function createHrmAnnouncement(
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const body = masterPayloadToAnnouncementWrite(payload);
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/announcements", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return apiAnnouncementToMasterRow(res.data);
}

export async function updateHrmAnnouncement(
  id: string,
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const body = masterPayloadToAnnouncementWrite(payload);
  const { company_id: _c, ...patch } = body;
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/announcements/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return apiAnnouncementToMasterRow(res.data);
}

export async function deleteHrmAnnouncement(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/announcements/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
