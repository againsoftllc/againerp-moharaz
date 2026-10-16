import { apiFetch } from "@/lib/api/client";

export type ApiListMeta = { total: number; limit: number; offset: number };

export type CrmLeadStatus = "new" | "contacted" | "interested" | "qualified" | "unqualified" | "converted" | "lost";
export type CrmFollowUpStatus = "overdue" | "today" | "upcoming";

export type ApiCrmLead = {
  id: string;
  company_id: string;
  name: string;
  company_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  source: string;
  status: CrmLeadStatus;
  estimated_value: string | null;
  owner_id: string | null;
  owner_name: string | null;
  department: string | null;
  notes: string | null;
  lead_score: number;
  qual_business_need: string | null;
  qual_budget: string | null;
  qual_timeline: string | null;
  qual_decision_maker: string | null;
  qual_requirements: string | null;
  next_follow_up_at: string | null;
  next_follow_up_type: string | null;
  next_follow_up_note: string | null;
  follow_up_status: CrmFollowUpStatus | null;
  converted_deal_id: string | null;
  lost_reason: string | null;
  lost_note: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmLeadSummary = {
  total_leads: number;
  new_leads: number;
  active_leads: number;
  follow_ups_due: number;
  qualified_leads: number;
  converted_leads: number;
  my_leads: number;
  unassigned_leads: number;
};

export type ApiCrmDeal = {
  id: string;
  company_id: string;
  title: string;
  lead_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  contact_name: string | null;
  contact_company: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  source: string | null;
  stage: "new" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
  value: string;
  probability: number;
  expected_close_date: string | null;
  owner_id: string | null;
  owner_name: string | null;
  lost_reason: string | null;
  notes: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiCrmProject = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  customer_id: string | null;
  customer_name: string | null;
  deal_id: string | null;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  start_date: string | null;
  due_date: string | null;
  budget: string | null;
  owner_id: string | null;
  owner_name: string | null;
  task_count: number;
  open_task_count: number;
  created_at: string;
  updated_at: string;
};

export type ApiCrmTask = {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  project_name: string | null;
  milestone_id: string | null;
  milestone_title: string | null;
  related_type: string | null;
  related_id: string | null;
  related_name: string | null;
  status: "todo" | "in_progress" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  points: number;
  collaborator_names: string[];
  start_date: string | null;
  due_date: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  timer_started_at: string | null;
  total_time_seconds: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiCrmTaskCollaborator = {
  id: string;
  company_id: string;
  task_id: string;
  user_id: string;
  user_name: string | null;
  created_at: string;
};

export type ApiCrmMilestone = {
  id: string;
  company_id: string;
  project_id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  due_date: string | null;
  status: "open" | "completed";
  task_count: number;
  open_task_count: number;
  created_at: string;
  updated_at: string;
};

export type ApiCrmProjectMember = {
  id: string;
  company_id: string;
  project_id: string;
  user_id: string;
  user_name: string | null;
  role: string;
  created_at: string;
};

export type ApiCrmProjectFeedback = {
  id: string;
  company_id: string;
  project_id: string;
  rating: number;
  comment: string | null;
  submitted_by_name: string | null;
  created_at: string;
};

export type ApiCrmTimeEntry = {
  id: string;
  company_id: string;
  project_id: string;
  task_id: string | null;
  task_title: string | null;
  user_id: string | null;
  user_name: string | null;
  hours: string;
  entry_date: string;
  note: string | null;
  created_at: string;
};

export type ApiCrmTicket = {
  id: string;
  company_id: string;
  ticket_number: string;
  subject: string;
  description: string | null;
  customer_id: string | null;
  customer_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  category: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "waiting_on_customer" | "resolved" | "closed";
  assignee_id: string | null;
  assignee_name: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiCrmDashboard = {
  open_leads_count: number;
  open_deals_count: number;
  pipeline_value: string;
  won_this_month: string;
  active_projects_count: number;
  open_tasks_count: number;
  overdue_tasks_count: number;
  open_tickets_count: number;
  recent_leads: ApiCrmLead[];
  recent_deals: ApiCrmDeal[];
  recent_tasks: ApiCrmTask[];
  recent_tickets: ApiCrmTicket[];
};

const BASE = "/api/v1/crm";

function qs(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && v !== "all") q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function fetchCrmDashboard() {
  return apiFetch<{ data: ApiCrmDashboard }>(`${BASE}/dashboard`);
}

// ── Leads ────────────────────────────────────────────────────────────────

export type CrmLeadListParams = {
  status?: string;
  search?: string;
  assigned_to?: string;
  mine?: boolean;
  unassigned?: boolean;
  source?: string;
  follow_up?: string;
  date_from?: string;
  date_to?: string;
};

export async function fetchCrmLeads(params?: CrmLeadListParams) {
  const q = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === "" || v === "all") continue;
      if (v === false) continue;
      q.set(k, String(v));
    }
  }
  const s = q.toString();
  return apiFetch<{ data: ApiCrmLead[]; meta: ApiListMeta }>(`${BASE}/leads${s ? `?${s}` : ""}`);
}

export async function fetchCrmLeadSummary() {
  return apiFetch<{ data: CrmLeadSummary }>(`${BASE}/leads/summary`);
}

export async function createCrmLead(input: {
  name: string;
  company_name?: string;
  job_title?: string;
  email?: string;
  phone?: string;
  alternate_phone?: string;
  source?: string;
  estimated_value?: string;
  owner_id?: string;
  department?: string;
  notes?: string;
  next_follow_up_at?: string;
  next_follow_up_type?: string;
  next_follow_up_note?: string;
}) {
  return apiFetch<{ data: ApiCrmLead }>(`${BASE}/leads`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateCrmLead(
  id: string,
  input: Partial<{
    name: string;
    company_name: string;
    job_title: string;
    email: string;
    phone: string;
    alternate_phone: string;
    source: string;
    estimated_value: string;
    notes: string;
  }>,
) {
  return apiFetch<{ data: ApiCrmLead }>(`${BASE}/leads/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function assignCrmLead(id: string, assigned_to: string | null, department?: string) {
  return apiFetch<{ data: ApiCrmLead }>(`${BASE}/leads/${id}/assign`, {
    method: "POST",
    body: JSON.stringify({ assigned_to, department }),
  });
}

export async function qualifyCrmLead(
  id: string,
  input: { business_need?: string; budget?: string; timeline?: string; decision_maker?: string; requirements?: string },
) {
  return apiFetch<{ data: ApiCrmLead }>(`${BASE}/leads/${id}/qualify`, { method: "POST", body: JSON.stringify(input) });
}

export async function transitionCrmLeadStatus(id: string, status: string, lost_reason?: string, lost_note?: string) {
  return apiFetch<{ data: ApiCrmLead }>(`${BASE}/leads/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status, lost_reason, lost_note }),
  });
}

export async function scheduleCrmFollowUp(id: string, input: { at: string; type?: string; note?: string }) {
  return apiFetch<{ data: ApiCrmLead }>(`${BASE}/leads/${id}/follow-up`, { method: "POST", body: JSON.stringify(input) });
}

export async function completeCrmFollowUp(id: string, result_note?: string) {
  return apiFetch<{ data: ApiCrmLead }>(`${BASE}/leads/${id}/follow-up/complete`, {
    method: "POST",
    body: JSON.stringify({ result_note }),
  });
}

export async function rescheduleCrmFollowUp(id: string, at: string) {
  return apiFetch<{ data: ApiCrmLead }>(`${BASE}/leads/${id}/follow-up/reschedule`, {
    method: "POST",
    body: JSON.stringify({ at }),
  });
}

export async function cancelCrmFollowUp(id: string) {
  return apiFetch<{ data: ApiCrmLead }>(`${BASE}/leads/${id}/follow-up/cancel`, { method: "POST" });
}

export async function convertCrmLead(id: string, input?: { title?: string; value?: string; owner_id?: string }) {
  return apiFetch<{ data: ApiCrmDeal }>(`${BASE}/leads/${id}/convert`, { method: "POST", body: JSON.stringify(input ?? {}) });
}

// ── Deals ────────────────────────────────────────────────────────────────

export async function fetchCrmDeals(params?: { stage?: string }) {
  return apiFetch<{ data: ApiCrmDeal[]; meta: ApiListMeta }>(`${BASE}/deals${qs(params ?? {})}`);
}

export async function createCrmDeal(input: {
  title: string;
  customer_id?: string;
  contact_name?: string;
  contact_company?: string;
  value?: string;
  expected_close_date?: string;
  notes?: string;
}) {
  return apiFetch<{ data: ApiCrmDeal }>(`${BASE}/deals`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateCrmDeal(id: string, input: Partial<{ title: string; value: string; expected_close_date: string; notes: string }>) {
  return apiFetch<{ data: ApiCrmDeal }>(`${BASE}/deals/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function transitionCrmDealStage(id: string, stage: string, lost_reason?: string) {
  return apiFetch<{ data: ApiCrmDeal }>(`${BASE}/deals/${id}/stage`, { method: "POST", body: JSON.stringify({ stage, lost_reason }) });
}

// ── Projects ─────────────────────────────────────────────────────────────

export async function fetchCrmProjects(params?: {
  status?: string;
  search?: string;
  overdue?: boolean;
  customer_id?: string;
}) {
  const q = qs({
    status: params?.status,
    search: params?.search,
    overdue: params?.overdue ? "true" : undefined,
    customer_id: params?.customer_id,
  });
  return apiFetch<{ data: ApiCrmProject[]; meta: ApiListMeta }>(`${BASE}/projects${q}`);
}

export async function createCrmProject(input: {
  name: string;
  description?: string;
  customer_id?: string;
  deal_id?: string;
  start_date?: string;
  due_date?: string;
  budget?: string;
}) {
  return apiFetch<{ data: ApiCrmProject }>(`${BASE}/projects`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateCrmProject(
  id: string,
  input: Partial<{ name: string; description: string; status: string; start_date: string; due_date: string; budget: string }>,
) {
  return apiFetch<{ data: ApiCrmProject }>(`${BASE}/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

// ── Tasks ────────────────────────────────────────────────────────────────

export async function fetchCrmTasks(params?: {
  status?: string;
  project_id?: string;
  assignee_id?: string;
  related_type?: string;
  related_id?: string;
}) {
  return apiFetch<{ data: ApiCrmTask[]; meta: ApiListMeta }>(`${BASE}/tasks${qs(params ?? {})}`);
}

export async function createCrmTask(input: {
  title: string;
  description?: string;
  project_id?: string;
  milestone_id?: string;
  related_type?: string;
  related_id?: string;
  priority?: string;
  points?: number;
  start_date?: string;
  due_date?: string;
  assignee_id?: string;
}) {
  return apiFetch<{ data: ApiCrmTask }>(`${BASE}/tasks`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateCrmTask(
  id: string,
  input: Partial<{
    title: string;
    description: string;
    project_id: string;
    milestone_id: string;
    related_type: string;
    related_id: string;
    status: string;
    priority: string;
    points: number;
    start_date: string;
    due_date: string;
    assignee_id: string;
  }>,
) {
  return apiFetch<{ data: ApiCrmTask }>(`${BASE}/tasks/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function fetchCrmTaskCollaborators(taskId: string) {
  return apiFetch<{ data: ApiCrmTaskCollaborator[] }>(`${BASE}/tasks/${taskId}/collaborators`);
}

export async function addCrmTaskCollaborator(taskId: string, userId: string) {
  return apiFetch<{ data: ApiCrmTaskCollaborator }>(`${BASE}/tasks/${taskId}/collaborators`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function removeCrmTaskCollaborator(taskId: string, userId: string) {
  await apiFetch<void>(`${BASE}/tasks/${taskId}/collaborators/${userId}`, { method: "DELETE" });
}

export type ApiCrmTaskChecklistItem = {
  id: string;
  company_id: string;
  task_id: string;
  text: string;
  is_checked: boolean;
  sort_order: number;
  created_at: string;
};

export async function fetchCrmTaskChecklist(taskId: string) {
  return apiFetch<{ data: ApiCrmTaskChecklistItem[] }>(`${BASE}/tasks/${taskId}/checklist`);
}

export async function addCrmTaskChecklistItem(taskId: string, text: string) {
  return apiFetch<{ data: ApiCrmTaskChecklistItem }>(`${BASE}/tasks/${taskId}/checklist`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function updateCrmTaskChecklistItem(
  taskId: string,
  itemId: string,
  input: Partial<{ text: string; is_checked: boolean }>,
) {
  return apiFetch<{ data: ApiCrmTaskChecklistItem }>(`${BASE}/tasks/${taskId}/checklist/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteCrmTaskChecklistItem(taskId: string, itemId: string) {
  await apiFetch<void>(`${BASE}/tasks/${taskId}/checklist/${itemId}`, { method: "DELETE" });
}

// ── Milestones ────────────────────────────────────────────────────────────

export async function fetchCrmMilestones(projectId: string) {
  return apiFetch<{ data: ApiCrmMilestone[] }>(`${BASE}/projects/${projectId}/milestones`);
}

export async function createCrmMilestone(
  projectId: string,
  input: { title: string; description?: string; start_date?: string; due_date?: string },
) {
  return apiFetch<{ data: ApiCrmMilestone }>(`${BASE}/projects/${projectId}/milestones`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateCrmMilestone(
  id: string,
  input: Partial<{ title: string; description: string; start_date: string; due_date: string; status: string }>,
) {
  return apiFetch<{ data: ApiCrmMilestone }>(`${BASE}/milestones/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function fetchCrmProjectMembers(projectId: string) {
  return apiFetch<{ data: ApiCrmProjectMember[] }>(`${BASE}/projects/${projectId}/members`);
}

export async function addCrmProjectMember(projectId: string, input: { user_id: string; role?: string }) {
  return apiFetch<{ data: ApiCrmProjectMember }>(`${BASE}/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeCrmProjectMember(projectId: string, userId: string) {
  await apiFetch<void>(`${BASE}/projects/${projectId}/members/${userId}`, { method: "DELETE" });
}

export async function fetchCrmProjectFeedback(projectId: string) {
  return apiFetch<{ data: ApiCrmProjectFeedback[]; average_rating: number | null }>(
    `${BASE}/projects/${projectId}/feedback`,
  );
}

export async function addCrmProjectFeedback(
  projectId: string,
  input: { rating: number; comment?: string; submitted_by_name?: string },
) {
  return apiFetch<{ data: ApiCrmProjectFeedback }>(`${BASE}/projects/${projectId}/feedback`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchCrmTimeEntries(projectId: string) {
  return apiFetch<{ data: ApiCrmTimeEntry[]; total_hours: string }>(`${BASE}/projects/${projectId}/time-entries`);
}

export async function createCrmTimeEntry(
  projectId: string,
  input: { hours: number; entry_date: string; task_id?: string; note?: string },
) {
  return apiFetch<{ data: ApiCrmTimeEntry }>(`${BASE}/projects/${projectId}/time-entries`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteCrmTimeEntry(id: string) {
  await apiFetch<void>(`${BASE}/time-entries/${id}`, { method: "DELETE" });
}

export async function completeCrmTask(id: string) {
  return apiFetch<{ data: ApiCrmTask }>(`${BASE}/tasks/${id}/complete`, { method: "POST" });
}

export async function startCrmTaskTimer(id: string) {
  return apiFetch<{ data: ApiCrmTask }>(`${BASE}/tasks/${id}/timer/start`, { method: "POST" });
}

export async function stopCrmTaskTimer(id: string) {
  return apiFetch<{ data: ApiCrmTask }>(`${BASE}/tasks/${id}/timer/stop`, { method: "POST" });
}

export async function deleteCrmTask(id: string) {
  await apiFetch<void>(`${BASE}/tasks/${id}`, { method: "DELETE" });
}

// ── Support tickets ──────────────────────────────────────────────────────

export async function fetchCrmTickets(params?: {
  status?: string;
  priority?: string;
  search?: string;
  customer_id?: string;
}) {
  return apiFetch<{ data: ApiCrmTicket[]; meta: ApiListMeta }>(`${BASE}/tickets${qs(params ?? {})}`);
}

export async function createCrmTicket(input: {
  subject: string;
  description?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  category?: string;
  priority?: string;
  assignee_id?: string;
}) {
  return apiFetch<{ data: ApiCrmTicket }>(`${BASE}/tickets`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateCrmTicket(
  id: string,
  input: Partial<{ subject: string; description: string; category: string; priority: string; assignee_id: string }>,
) {
  return apiFetch<{ data: ApiCrmTicket }>(`${BASE}/tickets/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function transitionCrmTicketStatus(id: string, status: string) {
  return apiFetch<{ data: ApiCrmTicket }>(`${BASE}/tickets/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
}
