import { apiFetch } from "@/lib/api/client";
import type { MasterRow } from "@/lib/mock-data/hrm-recruitment-setup";

export type ApiHrmBranch = {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip_code: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmBranch[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmBranch;
  errors: string[];
};

export type HrmBranchWriteInput = {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  zip_code?: string;
  phone?: string;
  email?: string;
  status?: string;
};

export function apiBranchToMasterRow(row: ApiHrmBranch): MasterRow {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    country: row.country ?? "",
    zip_code: row.zip_code ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    status: row.status,
  };
}

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function masterPayloadToBranchWrite(
  payload: Omit<MasterRow, "id">,
): HrmBranchWriteInput {
  return {
    name: String(payload.name ?? "").trim(),
    address: blankToNull(payload.address) ?? undefined,
    city: blankToNull(payload.city) ?? undefined,
    state: blankToNull(payload.state) ?? undefined,
    country: blankToNull(payload.country) ?? undefined,
    zip_code: blankToNull(payload.zip_code) ?? undefined,
    phone: blankToNull(payload.phone) ?? undefined,
    email: blankToNull(payload.email) ?? undefined,
    status: String(payload.status ?? "active"),
  };
}

export async function listHrmBranchRecords(params?: {
  status?: string;
  q?: string;
}): Promise<ApiHrmBranch[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString();
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/branches${suffix ? `?${suffix}` : ""}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function listHrmBranches(params?: {
  status?: string;
  q?: string;
}): Promise<MasterRow[]> {
  const rows = await listHrmBranchRecords(params);
  return rows.map(apiBranchToMasterRow);
}

export async function createHrmBranch(
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const body = masterPayloadToBranchWrite(payload);
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/branches", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return apiBranchToMasterRow(res.data);
}

export async function updateHrmBranch(
  id: string,
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const body = masterPayloadToBranchWrite(payload);
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/branches/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
  return apiBranchToMasterRow(res.data);
}

export async function deleteHrmBranch(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/branches/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
