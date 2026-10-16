/**
 * Global Activity Timeline types — CMP-TML-* framework
 * Reusable across HR, CRM, Inventory, Purchase, Accounting, Manufacturing
 * @see docs/modules/hr-payroll/uiux/HR_ACTIVITY_TIMELINE_UI_ARCHITECTURE.md
 */

export type TimelineModule =
  | "HR"
  | "Payroll"
  | "CRM"
  | "Sales"
  | "Purchase"
  | "Inventory"
  | "Accounting"
  | "Manufacturing";

export type TimelineActivityType =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "approval"
  | "rejection"
  | "comment"
  | "attachment"
  | "assignment"
  | "system"
  | "ai_insight"
  | "ai_action"
  | "export"
  | "import";

export type TimelinePriority = "critical" | "high" | "medium" | "low";

export type TimelineSource = "ui" | "ess" | "api" | "device" | "system" | "ai";

export type TimelineViewMode = "feed" | "audit" | "grouped" | "ai";

export type TimelineGroupBy = "date" | "module" | "user" | "department" | "type";

export type TimelineRelatedRecord = {
  id: string;
  label: string;
  href: string;
  type: string;
};

export type TimelineFieldChange = {
  field: string;
  label: string;
  before: string;
  after: string;
  masked?: boolean;
};

export type TimelineComment = {
  id: string;
  author: string;
  body: string;
  at: string;
};

export type TimelineAttachment = {
  id: string;
  name: string;
  size: string;
  type: string;
};

export type TimelineApprovalRef = {
  id: string;
  requestId: string;
  status: "pending" | "approved" | "rejected";
  href: string;
};

export type TimelineActivity = {
  id: string;
  title: string;
  description: string;
  activityType: TimelineActivityType;
  module: TimelineModule;
  timestamp: string;
  timestampIso: string;
  relativeTime: string;
  user: string;
  userId: string;
  userInitials: string;
  department: string;
  priority: TimelinePriority;
  source: TimelineSource;
  relatedRecords: TimelineRelatedRecord[];
  pinned?: boolean;
  unread?: boolean;
  highlighted?: boolean;
  immutable?: boolean;
  fieldChanges?: TimelineFieldChange[];
  comments?: TimelineComment[];
  attachments?: TimelineAttachment[];
  approvalRef?: TimelineApprovalRef;
  auditMeta?: {
    correlationId?: string;
    ipAddress?: string;
    userAgent?: string;
    tier?: "standard" | "permanent";
  };
};

export type TimelineAiSummary = {
  dailySummary: string;
  weeklySummary: string;
  riskIndicators: { id: string; title: string; severity: "critical" | "warning" | "info" }[];
  recommendations: { id: string; title: string; action: string }[];
};

export const TIMELINE_ACTIVITY_LABELS: Record<TimelineActivityType, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  status_change: "Status changed",
  approval: "Approved",
  rejection: "Rejected",
  comment: "Comment",
  attachment: "Attachment",
  assignment: "Assigned",
  system: "System",
  ai_insight: "AI insight",
  ai_action: "AI action",
  export: "Exported",
  import: "Imported",
};

export const TIMELINE_VIEW_MODES: { id: TimelineViewMode; label: string }[] = [
  { id: "feed", label: "Timeline Feed" },
  { id: "audit", label: "Audit View" },
  { id: "grouped", label: "Grouped View" },
  { id: "ai", label: "AI Summary" },
];
