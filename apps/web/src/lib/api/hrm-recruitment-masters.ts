/**
 * Recruitment setup masters — MasterCrud API clients (G10).
 * Flat masters + locations, checklists, items, rounds, custom questions, offer templates.
 */
import { apiFetch } from "@/lib/api/client";
import type { MasterCrudApi, MasterRow } from "@/lib/mock-data/hrm-recruitment-setup";

type ApiListResponse<T> = { data: T[]; meta: { count: number }; errors: string[] };
type ApiItemResponse<T> = { data: T; errors: string[] };

function blankToUndef(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

function asBool(value: unknown): boolean {
  return value === true || value === "true";
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/** Shared name/description/status master (categories, types, sources, interview types). */
function createNameStatusMasterApi(basePath: string): MasterCrudApi {
  type Row = {
    id: string;
    name: string;
    description: string | null;
    status: string;
  };

  function toRow(row: Row): MasterRow {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      status: row.status,
    };
  }

  function toWrite(payload: Omit<MasterRow, "id">) {
    return {
      company_id: "default",
      name: String(payload.name ?? "").trim(),
      description: blankToUndef(payload.description),
      status: String(payload.status ?? "active"),
    };
  }

  return {
    list: async () => {
      const qs = new URLSearchParams({ company_id: "default" });
      const res = await apiFetch<ApiListResponse<Row>>(`${basePath}?${qs}`, {
        cache: "no-store",
      });
      return (res.data ?? []).map(toRow);
    },
    create: async (payload) => {
      const res = await apiFetch<ApiItemResponse<Row>>(basePath, {
        method: "POST",
        body: JSON.stringify(toWrite(payload)),
      });
      return toRow(res.data);
    },
    update: async (id, payload) => {
      const { company_id: _c, ...patch } = toWrite(payload);
      const res = await apiFetch<ApiItemResponse<Row>>(
        `${basePath}/${encodeURIComponent(id)}?company_id=default`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      return toRow(res.data);
    },
    remove: async (id) => {
      await apiFetch<void>(`${basePath}/${encodeURIComponent(id)}?company_id=default`, {
        method: "DELETE",
      });
    },
  };
}

export const jobCategoriesApi = createNameStatusMasterApi("/api/v1/hrm/job-categories");
export const jobTypesApi = createNameStatusMasterApi("/api/v1/hrm/job-types");
export const candidateSourcesApi = createNameStatusMasterApi("/api/v1/hrm/candidate-sources");
export const interviewTypesApi = createNameStatusMasterApi("/api/v1/hrm/interview-types");

/* ── Job locations ─────────────────────────────────────────────── */

type ApiJobLocation = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  is_remote: boolean;
  status: string;
};

export const jobLocationsApi: MasterCrudApi = {
  list: async () => {
    const qs = new URLSearchParams({ company_id: "default" });
    const res = await apiFetch<ApiListResponse<ApiJobLocation>>(
      `/api/v1/hrm/job-locations?${qs}`,
      { cache: "no-store" },
    );
    return (res.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      country: r.country ?? "",
      postalCode: r.postal_code ?? "",
      isRemote: r.is_remote,
      status: r.status,
    }));
  },
  create: async (payload) => {
    const body = {
      company_id: "default",
      name: String(payload.name ?? "").trim(),
      address: blankToUndef(payload.address),
      city: blankToUndef(payload.city),
      state: blankToUndef(payload.state),
      country: blankToUndef(payload.country),
      postal_code: blankToUndef(payload.postalCode),
      is_remote: asBool(payload.isRemote),
      status: String(payload.status ?? "active"),
    };
    const res = await apiFetch<ApiItemResponse<ApiJobLocation>>("/api/v1/hrm/job-locations", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const r = res.data;
    return {
      id: r.id,
      name: r.name,
      address: r.address ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      country: r.country ?? "",
      postalCode: r.postal_code ?? "",
      isRemote: r.is_remote,
      status: r.status,
    };
  },
  update: async (id, payload) => {
    const body = {
      name: String(payload.name ?? "").trim(),
      address: blankToUndef(payload.address),
      city: blankToUndef(payload.city),
      state: blankToUndef(payload.state),
      country: blankToUndef(payload.country),
      postal_code: blankToUndef(payload.postalCode),
      is_remote: asBool(payload.isRemote),
      status: String(payload.status ?? "active"),
    };
    const res = await apiFetch<ApiItemResponse<ApiJobLocation>>(
      `/api/v1/hrm/job-locations/${encodeURIComponent(id)}?company_id=default`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
    const r = res.data;
    return {
      id: r.id,
      name: r.name,
      address: r.address ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      country: r.country ?? "",
      postalCode: r.postal_code ?? "",
      isRemote: r.is_remote,
      status: r.status,
    };
  },
  remove: async (id) => {
    await apiFetch<void>(
      `/api/v1/hrm/job-locations/${encodeURIComponent(id)}?company_id=default`,
      { method: "DELETE" },
    );
  },
};

/* ── Custom questions (question + required only) ───────────────── */

type ApiCustomQuestion = {
  id: string;
  question: string | null;
  required: boolean;
};

export const customQuestionsApi: MasterCrudApi = {
  list: async () => {
    const qs = new URLSearchParams({ company_id: "default" });
    const res = await apiFetch<ApiListResponse<ApiCustomQuestion>>(
      `/api/v1/hrm/custom-questions?${qs}`,
      { cache: "no-store" },
    );
    return (res.data ?? []).map((r) => ({
      id: r.id,
      name: r.question ?? "",
      required: r.required,
    }));
  },
  create: async (payload) => {
    const res = await apiFetch<ApiItemResponse<ApiCustomQuestion>>(
      "/api/v1/hrm/custom-questions",
      {
        method: "POST",
        body: JSON.stringify({
          company_id: "default",
          question: String(payload.name ?? "").trim(),
          required: asBool(payload.required),
        }),
      },
    );
    return { id: res.data.id, name: res.data.question ?? "", required: res.data.required };
  },
  update: async (id, payload) => {
    const res = await apiFetch<ApiItemResponse<ApiCustomQuestion>>(
      `/api/v1/hrm/custom-questions/${encodeURIComponent(id)}?company_id=default`,
      {
        method: "PATCH",
        body: JSON.stringify({
          question: String(payload.name ?? "").trim(),
          required: asBool(payload.required),
        }),
      },
    );
    return { id: res.data.id, name: res.data.question ?? "", required: res.data.required };
  },
  remove: async (id) => {
    await apiFetch<void>(
      `/api/v1/hrm/custom-questions/${encodeURIComponent(id)}?company_id=default`,
      { method: "DELETE" },
    );
  },
};

/* ── Offer templates ───────────────────────────────────────────── */

type ApiOfferTemplate = {
  id: string;
  name: string;
  template_content: string | null;
  status: string;
};

export const offerTemplatesApi: MasterCrudApi = {
  list: async () => {
    const qs = new URLSearchParams({ company_id: "default" });
    const res = await apiFetch<ApiListResponse<ApiOfferTemplate>>(
      `/api/v1/hrm/offer-templates?${qs}`,
      { cache: "no-store" },
    );
    return (res.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      content: r.template_content ?? "",
      status: r.status,
    }));
  },
  create: async (payload) => {
    const res = await apiFetch<ApiItemResponse<ApiOfferTemplate>>(
      "/api/v1/hrm/offer-templates",
      {
        method: "POST",
        body: JSON.stringify({
          company_id: "default",
          name: String(payload.name ?? "").trim(),
          template_content: blankToUndef(payload.content),
          status: String(payload.status ?? "active"),
        }),
      },
    );
    return {
      id: res.data.id,
      name: res.data.name,
      content: res.data.template_content ?? "",
      status: res.data.status,
    };
  },
  update: async (id, payload) => {
    const res = await apiFetch<ApiItemResponse<ApiOfferTemplate>>(
      `/api/v1/hrm/offer-templates/${encodeURIComponent(id)}?company_id=default`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: String(payload.name ?? "").trim(),
          template_content: blankToUndef(payload.content),
          status: String(payload.status ?? "active"),
        }),
      },
    );
    return {
      id: res.data.id,
      name: res.data.name,
      content: res.data.template_content ?? "",
      status: res.data.status,
    };
  },
  remove: async (id) => {
    await apiFetch<void>(
      `/api/v1/hrm/offer-templates/${encodeURIComponent(id)}?company_id=default`,
      { method: "DELETE" },
    );
  },
};

/* ── Onboarding checklists ─────────────────────────────────────── */

type ApiOnboardingChecklist = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  status: string;
};

function checklistToRow(r: ApiOnboardingChecklist): MasterRow {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    isDefault: r.is_default,
    status: r.status,
  };
}

export const onboardingChecklistsApi: MasterCrudApi = {
  list: async () => {
    const qs = new URLSearchParams({ company_id: "default" });
    const res = await apiFetch<ApiListResponse<ApiOnboardingChecklist>>(
      `/api/v1/hrm/onboarding-checklists?${qs}`,
      { cache: "no-store" },
    );
    return (res.data ?? []).map(checklistToRow);
  },
  create: async (payload) => {
    const res = await apiFetch<ApiItemResponse<ApiOnboardingChecklist>>(
      "/api/v1/hrm/onboarding-checklists",
      {
        method: "POST",
        body: JSON.stringify({
          company_id: "default",
          name: String(payload.name ?? "").trim(),
          description: blankToUndef(payload.description),
          is_default: asBool(payload.isDefault),
          status: String(payload.status ?? "active"),
        }),
      },
    );
    return checklistToRow(res.data);
  },
  update: async (id, payload) => {
    const res = await apiFetch<ApiItemResponse<ApiOnboardingChecklist>>(
      `/api/v1/hrm/onboarding-checklists/${encodeURIComponent(id)}?company_id=default`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: String(payload.name ?? "").trim(),
          description: blankToUndef(payload.description),
          is_default: asBool(payload.isDefault),
          status: String(payload.status ?? "active"),
        }),
      },
    );
    return checklistToRow(res.data);
  },
  remove: async (id) => {
    await apiFetch<void>(
      `/api/v1/hrm/onboarding-checklists/${encodeURIComponent(id)}?company_id=default`,
      { method: "DELETE" },
    );
  },
};

/* ── Checklist items ───────────────────────────────────────────── */

type ApiChecklistItem = {
  id: string;
  checklist_id: string | null;
  task_name: string | null;
  description: string | null;
  category: string;
  assigned_to_role: string | null;
  due_day: number;
  is_required: boolean;
  status: string;
};

function itemToRow(r: ApiChecklistItem, checklistName?: string): MasterRow {
  return {
    id: r.id,
    checklist_id: r.checklist_id ?? "",
    checklist: checklistName ?? r.checklist_id ?? "",
    name: r.task_name ?? "",
    description: r.description ?? "",
    category: r.category,
    assigned_to_role: r.assigned_to_role ?? "",
    due_day: r.due_day,
    is_required: r.is_required,
    status: r.status,
  };
}

export const checklistItemsApi: MasterCrudApi = {
  list: async () => {
    const [lists, itemsRes] = await Promise.all([
      onboardingChecklistsApi.list(),
      apiFetch<ApiListResponse<ApiChecklistItem>>(
        `/api/v1/hrm/checklist-items?company_id=default`,
        { cache: "no-store" },
      ),
    ]);
    const nameById = new Map(lists.map((c) => [String(c.id), String(c.name ?? "")]));
    return (itemsRes.data ?? []).map((r) =>
      itemToRow(r, r.checklist_id ? nameById.get(r.checklist_id) : undefined),
    );
  },
  create: async (payload) => {
    const res = await apiFetch<ApiItemResponse<ApiChecklistItem>>(
      "/api/v1/hrm/checklist-items",
      {
        method: "POST",
        body: JSON.stringify({
          company_id: "default",
          checklist_id: String(payload.checklist_id ?? "").trim(),
          task_name: String(payload.name ?? "").trim(),
          description: blankToUndef(payload.description),
          category: String(payload.category ?? "other"),
          assigned_to_role: blankToUndef(payload.assigned_to_role),
          due_day: toInt(payload.due_day, 1),
          is_required: asBool(payload.is_required),
          status: String(payload.status ?? "active"),
        }),
      },
    );
    return itemToRow(res.data);
  },
  update: async (id, payload) => {
    const res = await apiFetch<ApiItemResponse<ApiChecklistItem>>(
      `/api/v1/hrm/checklist-items/${encodeURIComponent(id)}?company_id=default`,
      {
        method: "PATCH",
        body: JSON.stringify({
          task_name: String(payload.name ?? "").trim(),
          description: blankToUndef(payload.description),
          category: String(payload.category ?? "other"),
          assigned_to_role: blankToUndef(payload.assigned_to_role),
          due_day: toInt(payload.due_day, 1),
          is_required: asBool(payload.is_required),
          status: String(payload.status ?? "active"),
        }),
      },
    );
    return itemToRow(res.data);
  },
  remove: async (id) => {
    await apiFetch<void>(
      `/api/v1/hrm/checklist-items/${encodeURIComponent(id)}?company_id=default`,
      { method: "DELETE" },
    );
  },
  optionLoaders: {
    checklist_id: async () => {
      const rows = await onboardingChecklistsApi.list();
      return rows.map((r) => ({ value: String(r.id), label: String(r.name ?? r.id) }));
    },
  },
};

/* ── Interview rounds (needs job_id) ───────────────────────────── */

type ApiJobPostingLite = {
  id: string;
  title: string;
  status: string;
};

type ApiInterviewRound = {
  id: string;
  job_id: string | null;
  name: string;
  sequence_number: number;
  description: string | null;
  status: string;
};

async function listJobPostingsLite(): Promise<ApiJobPostingLite[]> {
  const qs = new URLSearchParams({ company_id: "default", page: "1", per_page: "200" });
  const res = await apiFetch<ApiListResponse<ApiJobPostingLite>>(
    `/api/v1/hrm/job-postings?${qs}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

function roundToRow(r: ApiInterviewRound, jobTitle?: string): MasterRow {
  return {
    id: r.id,
    job_id: r.job_id ?? "",
    jobPosting: jobTitle ?? r.job_id ?? "",
    name: r.name,
    sequence: r.sequence_number,
    description: r.description ?? "",
    status: r.status,
  };
}

export const interviewRoundsApi: MasterCrudApi = {
  list: async () => {
    const [jobs, roundsRes] = await Promise.all([
      listJobPostingsLite(),
      apiFetch<ApiListResponse<ApiInterviewRound>>(
        `/api/v1/hrm/interview-rounds?company_id=default`,
        { cache: "no-store" },
      ),
    ]);
    const titleById = new Map(jobs.map((j) => [j.id, j.title]));
    return (roundsRes.data ?? []).map((r) =>
      roundToRow(r, r.job_id ? titleById.get(r.job_id) : undefined),
    );
  },
  create: async (payload) => {
    const res = await apiFetch<ApiItemResponse<ApiInterviewRound>>(
      "/api/v1/hrm/interview-rounds",
      {
        method: "POST",
        body: JSON.stringify({
          company_id: "default",
          job_id: String(payload.job_id ?? "").trim(),
          name: String(payload.name ?? "").trim(),
          sequence_number: toInt(payload.sequence, 1),
          description: blankToUndef(payload.description),
          status: String(payload.status ?? "active"),
        }),
      },
    );
    return roundToRow(res.data);
  },
  update: async (id, payload) => {
    const res = await apiFetch<ApiItemResponse<ApiInterviewRound>>(
      `/api/v1/hrm/interview-rounds/${encodeURIComponent(id)}?company_id=default`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: String(payload.name ?? "").trim(),
          sequence_number: toInt(payload.sequence, 1),
          description: blankToUndef(payload.description),
          status: String(payload.status ?? "active"),
        }),
      },
    );
    return roundToRow(res.data);
  },
  remove: async (id) => {
    await apiFetch<void>(
      `/api/v1/hrm/interview-rounds/${encodeURIComponent(id)}?company_id=default`,
      { method: "DELETE" },
    );
  },
  optionLoaders: {
    job_id: async () => {
      const jobs = await listJobPostingsLite();
      return jobs.map((j) => ({ value: j.id, label: j.title }));
    },
  },
};
