import { apiFetch } from "@/lib/api/client";

type ApiListResponse<T> = {
  data: T[];
  meta?: { count?: number };
  errors?: string[];
};

type ApiItemResponse<T> = {
  data: T;
  errors?: string[];
};

export type ApiIpRestriction = {
  id: string;
  company_id: string;
  ip_address: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function listHrmIpRestrictions(params?: {
  q?: string;
}): Promise<ApiIpRestriction[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse<ApiIpRestriction>>(
    `/api/v1/hrm/ip-restrictions?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function createHrmIpRestriction(payload: {
  ipAddress: string;
}): Promise<ApiIpRestriction> {
  const res = await apiFetch<ApiItemResponse<ApiIpRestriction>>(
    "/api/v1/hrm/ip-restrictions",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        ip_address: payload.ipAddress.trim(),
      }),
    },
  );
  return res.data;
}

export async function updateHrmIpRestriction(
  id: string,
  payload: { ipAddress: string },
): Promise<ApiIpRestriction> {
  const res = await apiFetch<ApiItemResponse<ApiIpRestriction>>(
    `/api/v1/hrm/ip-restrictions/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({ ip_address: payload.ipAddress.trim() }),
    },
  );
  return res.data;
}

export async function deleteHrmIpRestriction(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/ip-restrictions/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

export function ipRestrictionLabel(row: ApiIpRestriction): string {
  return row.ip_address?.trim() || "—";
}
