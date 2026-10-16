import { employeeAvatarUrl } from "@/lib/mock-data/employees";

/** Workdo Action Items: Task+meeting, Assigned To, Due Date (+overdue), Priority, Progress. */

export type ActionPriority = "low" | "medium" | "high" | "critical";
export type ActionStatus = "open" | "in_progress" | "completed" | "overdue";

export type MeetingActionItem = {
  id: string;
  title: string;
  meetingTitle: string;
  assigneeId: string;
  assigneeName: string;
  dueDate: string;
  priority: ActionPriority;
  progress: number;
  status: ActionStatus;
  description: string;
  notes: string;
};

export const ACTION_PRIORITY_LABEL: Record<ActionPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  overdue: "Overdue",
};

export const ACTION_PRIORITY_OPTIONS = (
  Object.keys(ACTION_PRIORITY_LABEL) as ActionPriority[]
).map((k) => ({ value: k, label: ACTION_PRIORITY_LABEL[k] }));

export const ACTION_STATUS_OPTIONS = (
  Object.keys(ACTION_STATUS_LABEL) as ActionStatus[]
).map((k) => ({ value: k, label: ACTION_STATUS_LABEL[k] }));

export const ACTION_ASSIGNEES = [
  { id: "emp_04", name: "Nusrat Jahan" },
  { id: "emp_01", name: "Karim Ahmed" },
  { id: "emp_03", name: "Tanvir Hasan" },
  { id: "emp_05", name: "Farzana Islam" },
  { id: "emp_06", name: "Rafiqul Islam" },
  { id: "mgr_01", name: "Manager" },
] as const;

export const ACTION_MEETINGS = [
  "Weekly Team Standup",
  "Daily Scrum Meeting",
  "Project Alpha Review",
  "All Hands Company Meeting",
] as const;

export const ACTION_ITEMS_SEED: MeetingActionItem[] = [
  {
    // Workdo demo-style completed item
    id: "ai_1",
    title: "Prepare Weekly Status Report",
    meetingTitle: "Weekly Team Standup",
    assigneeId: "emp_04",
    assigneeName: "Nusrat Jahan",
    dueDate: "2025-09-23",
    priority: "medium",
    progress: 100,
    status: "completed",
    description:
      "Create comprehensive weekly status report including progress metrics and risk assessments",
    notes: "Report completed and shared with stakeholders",
  },
  {
    id: "ai_2",
    title: "Customer Feedback Analysis",
    meetingTitle: "Weekly Team Standup",
    assigneeId: "emp_04",
    assigneeName: "Nusrat Jahan",
    dueDate: "2025-10-13",
    priority: "medium",
    progress: 100,
    status: "completed",
    description: "Analyze recent customer feedback themes and share with product.",
    notes: "Summary shared with product.",
  },
  {
    id: "ai_3",
    title: "Security Audit Implementation",
    meetingTitle: "Weekly Team Standup",
    assigneeId: "mgr_01",
    assigneeName: "Manager",
    dueDate: "2025-11-17",
    priority: "critical",
    progress: 0,
    status: "overdue",
    description: "Implement recommended controls from the Q3 security audit.",
    notes: "Blocked on vendor access.",
  },
  {
    id: "ai_4",
    title: "Budget Review and Planning",
    meetingTitle: "Project Alpha Review",
    assigneeId: "emp_03",
    assigneeName: "Tanvir Hasan",
    dueDate: "2025-10-26",
    priority: "high",
    progress: 45,
    status: "overdue",
    description: "Finalize department budget proposals for next quarter.",
    notes: "Need finance sign-off.",
  },
  {
    id: "ai_5",
    title: "Team Performance Evaluation",
    meetingTitle: "Weekly Team Standup",
    assigneeId: "emp_05",
    assigneeName: "Farzana Islam",
    dueDate: "2025-11-01",
    priority: "medium",
    progress: 0,
    status: "overdue",
    description: "Complete mid-cycle performance notes for direct reports.",
    notes: "",
  },
  {
    id: "ai_6",
    title: "Update onboarding checklist",
    meetingTitle: "All Hands Company Meeting",
    assigneeId: "emp_01",
    assigneeName: "Karim Ahmed",
    dueDate: "2026-08-15",
    priority: "low",
    progress: 30,
    status: "in_progress",
    description: "Refresh new-hire onboarding checklist with IT and facilities steps.",
    notes: "Draft ready for HR review.",
  },
  {
    id: "ai_7",
    title: "Document sprint retrospective actions",
    meetingTitle: "Daily Scrum Meeting",
    assigneeId: "emp_06",
    assigneeName: "Rafiqul Islam",
    dueDate: "2026-07-30",
    priority: "high",
    progress: 10,
    status: "open",
    description: "Capture and assign follow-ups from the last sprint retrospective.",
    notes: "",
  },
];

export function createActionItemId(existing: MeetingActionItem[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^ai_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `ai_${n + 1}`;
}

export function actionAssigneeAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

/** Days overdue relative to today (2026-07-23 in this workspace context). */
export function daysOverdue(dueDate: string, today = "2026-07-23"): number | null {
  const due = new Date(`${dueDate}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  const diff = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
  return diff > 0 ? diff : null;
}

export function resolveActionStatus(
  progress: number,
  dueDate: string,
  today = "2026-07-23",
): ActionStatus {
  if (progress >= 100) return "completed";
  const overdue = daysOverdue(dueDate, today);
  if (overdue != null) return "overdue";
  if (progress > 0) return "in_progress";
  return "open";
}
