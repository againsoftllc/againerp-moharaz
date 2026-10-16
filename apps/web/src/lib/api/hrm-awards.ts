import { apiFetch } from "@/lib/api/client";
import type { Award } from "@/lib/mock-data/hrm-awards";

export type ApiHrmAward = {
  id: string;
  company_id: string;
  employee_id: string | null;
  award_type_id: string | null;
  award_date: string | null;
  gift: string | null;
  monetary_value: string | number | null;
  description: string | null;
  certificate: string | null;
  photo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmAward[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmAward;
  errors: string[];
};

export type AwardLookups = {
  employeeName: (id: string | null | undefined) => string;
  employeeDepartment: (id: string | null | undefined) => string;
  employeeDesignation: (id: string | null | undefined) => string;
  awardTypeName: (id: string | null | undefined) => string;
};

function blankToUndef(value: string | null | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
}

export function apiAwardToAward(row: ApiHrmAward, lookups: AwardLookups): Award {
  return {
    id: row.id,
    employeeId: row.employee_id ?? "",
    employeeName: lookups.employeeName(row.employee_id),
    department: lookups.employeeDepartment(row.employee_id),
    designation: lookups.employeeDesignation(row.employee_id),
    awardTypeId: row.award_type_id ?? "",
    awardType: lookups.awardTypeName(row.award_type_id),
    date: row.award_date ?? "",
    gift: row.gift ?? "",
    description: row.description ?? "",
    certificate: row.certificate ?? "",
  };
}

export function awardToCreatePayload(input: {
  employeeId: string;
  awardTypeId: string;
  date: string;
  gift?: string;
  description?: string;
  certificate?: string;
}) {
  return {
    company_id: "default",
    employee_id: input.employeeId,
    award_type_id: input.awardTypeId,
    award_date: input.date,
    gift: blankToUndef(input.gift),
    description: blankToUndef(input.description),
    certificate: blankToUndef(input.certificate),
  };
}

export function awardToUpdatePayload(input: {
  employeeId: string;
  awardTypeId: string;
  date: string;
  gift?: string;
  description?: string;
  certificate?: string;
}) {
  const { company_id: _c, ...rest } = awardToCreatePayload(input);
  return rest;
}

export async function listHrmAwards(params?: {
  employee_id?: string;
  award_type_id?: string;
}): Promise<ApiHrmAward[]> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.award_type_id) qs.set("award_type_id", params.award_type_id);
  const res = await apiFetch<ApiListResponse>(`/api/v1/hrm/awards?${qs.toString()}`, {
    cache: "no-store",
  });
  return res.data ?? [];
}

export async function createHrmAward(input: {
  employeeId: string;
  awardTypeId: string;
  date: string;
  gift?: string;
  description?: string;
  certificate?: string;
}): Promise<ApiHrmAward> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/awards", {
    method: "POST",
    body: JSON.stringify(awardToCreatePayload(input)),
  });
  return res.data;
}

export async function updateHrmAward(
  id: string,
  input: {
    employeeId: string;
    awardTypeId: string;
    date: string;
    gift?: string;
    description?: string;
    certificate?: string;
  },
): Promise<ApiHrmAward> {
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/awards/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify(awardToUpdatePayload(input)),
    },
  );
  return res.data;
}

export async function deleteHrmAward(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/awards/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
