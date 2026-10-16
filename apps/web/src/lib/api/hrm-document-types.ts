import { apiFetch } from "@/lib/api/client";
import type { MasterRow } from "@/lib/mock-data/hrm-recruitment-setup";

export type ApiHrmDocumentType = {
  id: string;
  company_id: string;
  name: string;
  is_required: boolean;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmDocumentType[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmDocumentType;
  errors: string[];
};

export function apiDocumentTypeToMasterRow(row: ApiHrmDocumentType): MasterRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    is_required: row.is_required,
  };
}

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function masterPayloadToDocumentTypeWrite(payload: Omit<MasterRow, "id">) {
  return {
    company_id: "default",
    name: String(payload.name ?? "").trim(),
    is_required: payload.is_required === true || payload.is_required === "true",
    description: blankToNull(payload.description) ?? undefined,
  };
}

export async function listHrmDocumentTypes(params?: {
  q?: string;
}): Promise<MasterRow[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/document-types?${qs.toString()}`,
    { cache: "no-store" },
  );
  return (res.data ?? []).map(apiDocumentTypeToMasterRow);
}

export async function createHrmDocumentType(
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/document-types", {
    method: "POST",
    body: JSON.stringify(masterPayloadToDocumentTypeWrite(payload)),
  });
  return apiDocumentTypeToMasterRow(res.data);
}

export async function updateHrmDocumentType(
  id: string,
  payload: Omit<MasterRow, "id">,
): Promise<MasterRow> {
  const { company_id: _c, ...patch } = masterPayloadToDocumentTypeWrite(payload);
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/document-types/${encodeURIComponent(id)}?company_id=default`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return apiDocumentTypeToMasterRow(res.data);
}

export async function deleteHrmDocumentType(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/document-types/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
