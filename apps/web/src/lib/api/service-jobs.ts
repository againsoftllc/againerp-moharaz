import { apiFetch } from "@/lib/api/client";

export type ServiceJobLine = {
  id: string;
  kind: "service" | "part" | "custom" | string;
  item_id: string | null;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price: string;
  discount: string;
  tax_rate: string;
  line_total: string;
  warehouse_id: string | null;
  stock_moved: boolean;
  notes: string | null;
};

export type ServiceJob = {
  id: string;
  company_id: string;
  job_number: string;
  status: string;
  service_type: string;
  rma_id: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  sku: string;
  product_name: string;
  serial_number: string | null;
  brand: string;
  model: string;
  imei: string | null;
  warehouse_id: string | null;
  issue: string;
  condition_notes: string | null;
  warranty_status: string;
  notes: string | null;
  priority: string;
  technician_id: string | null;
  technician_name: string;
  expected_at: string | null;
  delivered_at: string | null;
  delivered_by: string | null;
  received_by_name: string | null;
  diagnosis: string | null;
  diagnosis_status: string;
  found_problems: string | null;
  recommended_action: string | null;
  estimated_cost: string;
  estimated_hours: string;
  approval_status: string;
  approval_note: string | null;
  approved_at: string | null;
  qc_status: string;
  qc_notes: string | null;
  qc_checked_by: string | null;
  qc_checked_at: string | null;
  labour_total: string;
  parts_total: string;
  total: string;
  is_billable: boolean;
  bill_status: string;
  receivable_id: string | null;
  invoice_number: string | null;
  created_at: string;
  completed_at: string | null;
  lines: ServiceJobLine[];
};

export type ServiceJobHistory = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  note: string | null;
  created_at: string;
};

export type ServiceCatalogItem = {
  id: string;
  sku: string;
  name: string;
  item_type: string;
  kind: "service" | "part" | string;
  rate: string;
  unit: string;
};

export type ServiceDashboard = {
  total: number;
  today: number;
  overdue: number;
  open: number;
  completed: number;
  billed_amount: string;
  status_breakdown: Record<string, number>;
};

export type ServiceReports = {
  total: number;
  completed: number;
  pending: number;
  revenue: string;
  avg_repair_days: number;
  by_type: Record<string, number>;
  by_warranty: Record<string, number>;
  by_technician: Record<string, { assigned: number; completed: number }>;
  top_parts: { sku: string; count: number }[];
  top_services: { name: string; count: number }[];
  rma_linked: number;
  external: number;
  warranty_jobs: number;
  paid_jobs: number;
};

export const SERVICE_JOB_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  received: "Received",
  diagnosis: "Diagnosis",
  waiting_approval: "Waiting approval",
  approved: "Approved",
  in_progress: "In progress",
  waiting_parts: "Waiting for parts",
  ready_for_qc: "Ready for QC",
  ready_for_delivery: "Ready for delivery",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  on_hold: "On hold",
};

export const SERVICE_JOB_STATUS_TONE: Record<string, string> = {
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  received: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  diagnosis: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  waiting_approval: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  in_progress: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  waiting_parts: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  ready_for_qc: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  ready_for_delivery: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  completed: "border-muted-foreground/30 bg-muted text-muted-foreground",
  cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
  rejected: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  on_hold: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export const SERVICE_JOB_TYPE_LABEL: Record<string, string> = {
  warranty_repair: "Warranty repair",
  paid_repair: "Paid repair",
  direct: "Direct service",
};

export async function fetchServiceJobs(
  filters: {
    status?: string;
    rmaId?: string;
    technicianId?: string;
    serviceType?: string;
    search?: string;
  } = {},
) {
  const qs = new URLSearchParams();
  if (filters.status) qs.set("status", filters.status);
  if (filters.rmaId) qs.set("rma_id", filters.rmaId);
  if (filters.technicianId) qs.set("technician_id", filters.technicianId);
  if (filters.serviceType) qs.set("service_type", filters.serviceType);
  if (filters.search) qs.set("search", filters.search);
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch<{ data: ServiceJob[]; meta: { count: number; total: number } }>(
    `/api/v1/service-jobs${suffix}`,
  );
}

export async function fetchServiceJob(id: string) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}`);
  return res.data;
}

export async function fetchServiceJobHistory(id: string) {
  const res = await apiFetch<{ data: ServiceJobHistory[] }>(`/api/v1/service-jobs/${id}/history`);
  return res.data;
}

export async function fetchServiceDashboard() {
  const res = await apiFetch<{ data: ServiceDashboard }>("/api/v1/service-jobs/dashboard");
  return res.data;
}

export async function fetchServiceReports() {
  const res = await apiFetch<{ data: ServiceReports }>("/api/v1/service-jobs/reports");
  return res.data;
}

export async function searchServiceCatalog(q: string) {
  const qs = new URLSearchParams();
  if (q.trim()) qs.set("q", q.trim());
  const res = await apiFetch<{ data: ServiceCatalogItem[] }>(`/api/v1/service-jobs/catalog?${qs}`);
  return res.data;
}

export async function createServiceJob(input: Record<string, unknown>) {
  const res = await apiFetch<{ data: ServiceJob }>("/api/v1/service-jobs", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function patchServiceJob(id: string, input: Record<string, unknown>) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function addServiceJobLine(id: string, input: Record<string, unknown>) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}/lines`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function removeServiceJobLine(id: string, lineId: string) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}/lines/${lineId}`, {
    method: "DELETE",
  });
  return res.data;
}

export async function startServiceDiagnosis(id: string) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}/start-diagnosis`, {
    method: "POST",
  });
  return res.data;
}

export async function cancelServiceJob(id: string, note?: string) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
  return res.data;
}

export async function diagnoseServiceJob(id: string, input: Record<string, unknown>) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}/diagnosis`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function approveServiceJob(id: string, note?: string) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
  return res.data;
}

export async function rejectServiceJob(id: string, note?: string) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
  return res.data;
}

export async function startServiceJob(id: string) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}/start`, {
    method: "POST",
  });
  return res.data;
}

export async function completeServiceWork(id: string) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}/complete-work`, {
    method: "POST",
  });
  return res.data;
}

export async function qcServiceJob(id: string, result: "passed" | "failed", notes?: string) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}/qc`, {
    method: "POST",
    body: JSON.stringify({ result, notes }),
  });
  return res.data;
}

export async function deliverServiceJob(id: string, input: Record<string, unknown> = {}) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}/deliver`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function completeServiceJob(id: string) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}/complete`, {
    method: "POST",
  });
  return res.data;
}

export async function billServiceJob(id: string) {
  const res = await apiFetch<{ data: ServiceJob }>(`/api/v1/service-jobs/${id}/bill`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return res.data;
}
