/**
 * Global Activity Timeline mock data
 * @see docs/modules/hr-payroll/uiux/HR_ACTIVITY_TIMELINE_UI_ARCHITECTURE.md
 */

import type { TimelineActivity, TimelineAiSummary } from "@/lib/timeline/types";

export const GLOBAL_TIMELINE_AS_OF = "17 Jun 2026, 09:15 AM";

export const GLOBAL_TIMELINE_AI_SUMMARY: TimelineAiSummary = {
  dailySummary:
    "Today recorded 31 activities across HR and Payroll. Key events: June payroll run submitted for approval, 3 leave requests approved, and attendance finalization completed for Dhaka HQ. One escalated salary revision requires Finance review.",
  weeklySummary:
    "This week shows 214 activities with a 12% increase in approval-related events. Operations department leads volume (38%). AI flagged 2 compliance patterns: repeated Monday sick leave in Logistics and overtime spike before month-end.",
  riskIndicators: [
    {
      id: "risk-1",
      title: "Payroll run pending approval — pay date in 8 days",
      severity: "critical",
    },
    {
      id: "risk-2",
      title: "3 employees with missing bank details in active payroll run",
      severity: "warning",
    },
    {
      id: "risk-3",
      title: "Unusual after-hours login cluster — Chittagong branch",
      severity: "warning",
    },
    {
      id: "risk-4",
      title: "Leave approval volume within seasonal norm",
      severity: "info",
    },
  ],
  recommendations: [
    {
      id: "rec-1",
      title: "Review escalated salary revision SR-2026-0042",
      action: "Open approval APR-2026-00478",
    },
    {
      id: "rec-2",
      title: "Resolve payroll validation exceptions before lock",
      action: "Open PR-2026-06 validation tab",
    },
    {
      id: "rec-3",
      title: "Export audit bundle for June payroll period",
      action: "Run audit export",
    },
  ],
};

export const GLOBAL_TIMELINE_ACTIVITIES: TimelineActivity[] = [
  {
    id: "act-001",
    title: "Payroll run submitted for approval",
    description: "June 2026 payroll run PR-2026-06 calculated for 1,248 employees. Net pay ৳48.62M.",
    activityType: "approval",
    module: "Payroll",
    timestamp: "17 Jun 2026, 09:02 AM",
    timestampIso: "2026-06-17T09:02:00",
    relativeTime: "13 min ago",
    user: "Payroll Team",
    userId: "sys-payroll",
    userInitials: "PT",
    department: "Finance",
    priority: "critical",
    source: "system",
    pinned: true,
    unread: true,
    highlighted: true,
    relatedRecords: [
      { id: "r1", label: "PR-2026-06", href: "/payroll/runs?view=PR-2026-06", type: "Payroll run" },
      { id: "r2", label: "APR-2026-00482", href: "/inbox/approvals?view=apr-001", type: "Approval" },
    ],
    approvalRef: {
      id: "apr-001",
      requestId: "APR-2026-00482",
      status: "pending",
      href: "/inbox/approvals?view=apr-001",
    },
    fieldChanges: [
      { field: "status", label: "Run status", before: "Calculated", after: "Pending approval" },
      { field: "net_pay", label: "Net pay", before: "—", after: "৳48,620,000" },
    ],
    auditMeta: { correlationId: "corr-pay-2026-06", tier: "permanent" },
  },
  {
    id: "act-002",
    title: "Leave request approved",
    description: "Annual leave · 5 days · Fatima Rahman · 24–28 Jun 2026",
    activityType: "approval",
    module: "HR",
    timestamp: "17 Jun 2026, 08:45 AM",
    timestampIso: "2026-06-17T08:45:00",
    relativeTime: "30 min ago",
    user: "Rafiq Ahmed",
    userId: "emp-001",
    userInitials: "RA",
    department: "Operations",
    priority: "medium",
    source: "ui",
    unread: true,
    relatedRecords: [
      { id: "r1", label: "LR-2026-0142", href: "/hr/leave/requests?view=lv-apr-1", type: "Leave" },
      { id: "r2", label: "EMP-0002", href: "/hr/employees?view=emp-002&tab=leave", type: "Employee" },
    ],
    approvalRef: {
      id: "apr-002",
      requestId: "APR-2026-00481",
      status: "approved",
      href: "/inbox/approvals?view=apr-002",
    },
  },
  {
    id: "act-003",
    title: "Attendance correction submitted",
    description: "Karim Hassan · Missing check-out · 16 Jun 2026 · BIO-DHK-HQ-02",
    activityType: "update",
    module: "HR",
    timestamp: "17 Jun 2026, 08:47 AM",
    timestampIso: "2026-06-17T08:47:00",
    relativeTime: "28 min ago",
    user: "Karim Hassan",
    userId: "emp-003",
    userInitials: "KH",
    department: "Technology",
    priority: "medium",
    source: "ess",
    unread: true,
    relatedRecords: [
      { id: "r1", label: "EMP-0003", href: "/hr/employees?view=emp-003&tab=attendance", type: "Employee" },
    ],
    fieldChanges: [
      { field: "check_out", label: "Check-out", before: "—", after: "18:05" },
      { field: "status", label: "Day status", before: "Incomplete", after: "Pending correction" },
    ],
  },
  {
    id: "act-004",
    title: "Salary revision escalated",
    description: "SR-2026-0042 · Grade uplift · +৳12,000/month · Effective 01 Jul 2026",
    activityType: "status_change",
    module: "Payroll",
    timestamp: "16 Jun 2026, 4:15 PM",
    timestampIso: "2026-06-16T16:15:00",
    relativeTime: "Yesterday",
    user: "System",
    userId: "system",
    userInitials: "SY",
    department: "Human Resources",
    priority: "high",
    source: "system",
    pinned: true,
    relatedRecords: [
      { id: "r1", label: "SR-2026-0042", href: "/payroll/salary-revisions?view=sr-42", type: "Salary revision" },
      { id: "r2", label: "APR-2026-00478", href: "/inbox/approvals?view=apr-005", type: "Approval" },
    ],
    approvalRef: {
      id: "apr-005",
      requestId: "APR-2026-00478",
      status: "pending",
      href: "/inbox/approvals?view=apr-005",
    },
  },
  {
    id: "act-005",
    title: "Employee profile updated",
    description: "Tasnim Chowdhury · Bank account and emergency contact changed",
    activityType: "update",
    module: "HR",
    timestamp: "17 Jun 2026, 08:10 AM",
    timestampIso: "2026-06-17T08:10:00",
    relativeTime: "1h ago",
    user: "Tasnim Chowdhury",
    userId: "emp-007",
    userInitials: "TC",
    department: "Finance",
    priority: "low",
    source: "ess",
    relatedRecords: [{ id: "r1", label: "EMP-0007", href: "/hr/employees?view=emp-007", type: "Employee" }],
    fieldChanges: [
      { field: "bank_account", label: "Bank account", before: "••••4521", after: "••••8834", masked: true },
      { field: "emergency_contact", label: "Emergency contact", before: "Ahmed Chowdhury", after: "Sara Chowdhury" },
    ],
    attachments: [{ id: "att1", name: "bank-statement.pdf", size: "312 KB", type: "PDF" }],
  },
  {
    id: "act-006",
    title: "Purchase order approved",
    description: "PO-2026-0892 · Office supplies · ৳186,000 · Operations",
    activityType: "approval",
    module: "Purchase",
    timestamp: "16 Jun 2026, 2:30 PM",
    timestampIso: "2026-06-16T14:30:00",
    relativeTime: "Yesterday",
    user: "Procurement Head",
    userId: "usr-proc",
    userInitials: "PH",
    department: "Operations",
    priority: "medium",
    source: "ui",
    relatedRecords: [{ id: "r1", label: "PO-2026-0892", href: "/purchase/orders?view=po-892", type: "PO" }],
  },
  {
    id: "act-007",
    title: "Stock adjustment recorded",
    description: "Inventory variance · SKU-WH-4421 · −24 units · Chittagong warehouse",
    activityType: "update",
    module: "Inventory",
    timestamp: "16 Jun 2026, 11:00 AM",
    timestampIso: "2026-06-16T11:00:00",
    relativeTime: "Yesterday",
    user: "Rubel Mia",
    userId: "emp-020",
    userInitials: "RM",
    department: "Logistics",
    priority: "high",
    source: "ui",
    relatedRecords: [{ id: "r1", label: "ADJ-2026-0312", href: "/inventory/adjustments?view=adj-312", type: "Adjustment" }],
    fieldChanges: [
      { field: "qty_on_hand", label: "Qty on hand", before: "1,248", after: "1,224" },
    ],
  },
  {
    id: "act-008",
    title: "AI flagged attendance anomaly",
    description: "Operations floor: 18% more late arrivals vs 30-day average between 08:45–09:15",
    activityType: "ai_insight",
    module: "HR",
    timestamp: "17 Jun 2026, 07:30 AM",
    timestampIso: "2026-06-17T07:30:00",
    relativeTime: "1h ago",
    user: "AI Assistant",
    userId: "ai",
    userInitials: "AI",
    department: "Operations",
    priority: "medium",
    source: "ai",
    relatedRecords: [{ id: "r1", label: "Attendance dashboard", href: "/hr/attendance", type: "Dashboard" }],
  },
  {
    id: "act-009",
    title: "Journal entry posted",
    description: "JE-2026-06-1847 · Payroll accrual · Debit 6100 · Credit 2100",
    activityType: "create",
    module: "Accounting",
    timestamp: "15 Jun 2026, 5:45 PM",
    timestampIso: "2026-06-15T17:45:00",
    relativeTime: "2 days ago",
    user: "Finance Bot",
    userId: "sys-finance",
    userInitials: "FB",
    department: "Finance",
    priority: "medium",
    source: "system",
    immutable: true,
    relatedRecords: [{ id: "r1", label: "JE-2026-06-1847", href: "/accounting/journal?view=je-1847", type: "Journal" }],
    auditMeta: { correlationId: "corr-je-payroll-jun", tier: "permanent" },
  },
  {
    id: "act-010",
    title: "Work order completed",
    description: "WO-2026-0442 · Assembly batch #128 · 500 units · Dhaka plant",
    activityType: "status_change",
    module: "Manufacturing",
    timestamp: "15 Jun 2026, 3:20 PM",
    timestampIso: "2026-06-15T15:20:00",
    relativeTime: "2 days ago",
    user: "Production Supervisor",
    userId: "usr-mfg",
    userInitials: "PS",
    department: "Operations",
    priority: "medium",
    source: "ui",
    relatedRecords: [{ id: "r1", label: "WO-2026-0442", href: "/manufacturing/work-orders?view=wo-442", type: "Work order" }],
    fieldChanges: [{ field: "status", label: "Status", before: "In progress", after: "Completed" }],
  },
  {
    id: "act-011",
    title: "Lead converted to customer",
    description: "Urban Retail Ltd · CRM pipeline · Assigned to Sales team Dhaka",
    activityType: "status_change",
    module: "CRM",
    timestamp: "14 Jun 2026, 10:30 AM",
    timestampIso: "2026-06-14T10:30:00",
    relativeTime: "3 days ago",
    user: "Nusrat Jahan",
    userId: "emp-004",
    userInitials: "NJ",
    department: "Sales & Marketing",
    priority: "low",
    source: "ui",
    relatedRecords: [
      { id: "r1", label: "LEAD-8821", href: "/crm/leads?view=lead-8821", type: "Lead" },
      { id: "r2", label: "CUST-4421", href: "/customers?view=cust-4421", type: "Customer" },
    ],
  },
  {
    id: "act-012",
    title: "Leave request rejected",
    description: "Sadia Islam · Casual leave · 20 Jun · Team coverage below threshold",
    activityType: "rejection",
    module: "HR",
    timestamp: "14 Jun 2026, 4:00 PM",
    timestampIso: "2026-06-14T16:00:00",
    relativeTime: "3 days ago",
    user: "Jamal Uddin",
    userId: "emp-016",
    userInitials: "JU",
    department: "Operations",
    priority: "medium",
    source: "ui",
    relatedRecords: [{ id: "r1", label: "LR-2026-0135", href: "/hr/leave/requests?view=lv-135", type: "Leave" }],
    approvalRef: {
      id: "apr-007",
      requestId: "APR-2026-00476",
      status: "rejected",
      href: "/inbox/approvals?view=apr-007",
    },
    comments: [
      { id: "c1", author: "Jamal Uddin", body: "Rejected — 4 team members already on leave that day.", at: "14 Jun, 4:00 PM" },
    ],
  },
  {
    id: "act-013",
    title: "Attendance finalized — Dhaka HQ",
    description: "June 2026 monthly attendance locked for Dhaka HQ · 842 employees",
    activityType: "system",
    module: "HR",
    timestamp: "16 Jun 2026, 6:00 PM",
    timestampIso: "2026-06-16T18:00:00",
    relativeTime: "Yesterday",
    user: "HR Operations",
    userId: "sys-hr",
    userInitials: "HO",
    department: "Human Resources",
    priority: "high",
    source: "system",
    highlighted: true,
    relatedRecords: [{ id: "r1", label: "Jun 2026 attendance", href: "/hr/attendance/monthly?period=2026-06", type: "Attendance" }],
  },
  {
    id: "act-014",
    title: "Audit export generated",
    description: "Payroll audit bundle · May 2026 · CSV + PDF · 2.4 MB",
    activityType: "export",
    module: "Payroll",
    timestamp: "13 Jun 2026, 11:00 AM",
    timestampIso: "2026-06-13T11:00:00",
    relativeTime: "4 days ago",
    user: "Fatima Rahman",
    userId: "emp-002",
    userInitials: "FR",
    department: "Human Resources",
    priority: "low",
    source: "ui",
    attachments: [{ id: "att2", name: "payroll-audit-may-2026.zip", size: "2.4 MB", type: "ZIP" }],
    relatedRecords: [{ id: "r1", label: "May 2026 payroll", href: "/payroll/runs?view=may-2026", type: "Payroll run" }],
    auditMeta: { correlationId: "corr-export-8821", ipAddress: "192.168.1.42" },
  },
  {
    id: "act-015",
    title: "Overtime request submitted",
    description: "Shahid Alam · 4 hours · 16 Jun · Sprint release deployment",
    activityType: "create",
    module: "HR",
    timestamp: "17 Jun 2026, 07:55 AM",
    timestampIso: "2026-06-17T07:55:00",
    relativeTime: "1h ago",
    user: "Shahid Alam",
    userId: "emp-014",
    userInitials: "SA",
    department: "Technology",
    priority: "medium",
    source: "ess",
    unread: true,
    relatedRecords: [{ id: "r1", label: "OT-2026-0088", href: "/hr/overtime?view=ot-88", type: "Overtime" }],
  },
];

export const TIMELINE_FILTER_USERS = [
  { id: "all", label: "All users" },
  { id: "emp-001", label: "Rafiq Ahmed" },
  { id: "emp-002", label: "Fatima Rahman" },
  { id: "emp-003", label: "Karim Hassan" },
  { id: "sys-payroll", label: "Payroll Team" },
  { id: "ai", label: "AI Assistant" },
];

export const TIMELINE_FILTER_DEPARTMENTS = [
  { id: "all", label: "All departments" },
  { id: "ops", label: "Operations" },
  { id: "hr", label: "Human Resources" },
  { id: "finance", label: "Finance" },
  { id: "tech", label: "Technology" },
  { id: "sales", label: "Sales & Marketing" },
  { id: "logistics", label: "Logistics" },
];

export const TIMELINE_FILTER_MODULES = [
  { id: "all", label: "All modules" },
  { id: "HR", label: "HR" },
  { id: "Payroll", label: "Payroll" },
  { id: "CRM", label: "CRM" },
  { id: "Purchase", label: "Purchase" },
  { id: "Inventory", label: "Inventory" },
  { id: "Accounting", label: "Accounting" },
  { id: "Manufacturing", label: "Manufacturing" },
];

export const TIMELINE_FILTER_TYPES = [
  { id: "all", label: "All activity types" },
  { id: "approval", label: "Approval" },
  { id: "update", label: "Update" },
  { id: "create", label: "Create" },
  { id: "status_change", label: "Status change" },
  { id: "rejection", label: "Rejection" },
  { id: "system", label: "System" },
  { id: "ai_insight", label: "AI insight" },
  { id: "export", label: "Export" },
];

export const TIMELINE_FILTER_PRIORITIES = [
  { id: "all", label: "All priorities" },
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

export const TIMELINE_DATE_RANGES = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
];

export function getTimelineActivityById(id: string): TimelineActivity | undefined {
  return GLOBAL_TIMELINE_ACTIVITIES.find((a) => a.id === id);
}

export function filterTimelineActivities(
  activities: TimelineActivity[],
  filters: {
    search?: string;
    module?: string;
    user?: string;
    department?: string;
    activityType?: string;
    priority?: string;
    unreadOnly?: boolean;
    pinnedOnly?: boolean;
  },
): TimelineActivity[] {
  let result = [...activities];

  if (filters.pinnedOnly) {
    result = result.filter((a) => a.pinned);
  }

  if (filters.unreadOnly) {
    result = result.filter((a) => a.unread);
  }

  if (filters.module && filters.module !== "all") {
    result = result.filter((a) => a.module === filters.module);
  }

  if (filters.user && filters.user !== "all") {
    result = result.filter((a) => a.userId === filters.user);
  }

  if (filters.department && filters.department !== "all") {
    const deptMap: Record<string, string> = {
      ops: "Operations",
      hr: "Human Resources",
      finance: "Finance",
      tech: "Technology",
      sales: "Sales & Marketing",
      logistics: "Logistics",
    };
    const dept = deptMap[filters.department];
    if (dept) result = result.filter((a) => a.department === dept);
  }

  if (filters.activityType && filters.activityType !== "all") {
    result = result.filter((a) => a.activityType === filters.activityType);
  }

  if (filters.priority && filters.priority !== "all") {
    result = result.filter((a) => a.priority === filters.priority);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.user.toLowerCase().includes(q),
    );
  }

  const pinned = result.filter((a) => a.pinned);
  const rest = result.filter((a) => !a.pinned);
  return [...pinned, ...rest.sort((a, b) => b.timestampIso.localeCompare(a.timestampIso))];
}

export function groupTimelineActivities(
  activities: TimelineActivity[],
  groupBy: "date" | "module" | "user" | "department" | "type",
): { key: string; label: string; items: TimelineActivity[] }[] {
  const groups = new Map<string, { label: string; items: TimelineActivity[] }>();

  for (const activity of activities) {
    let key: string;
    let label: string;
    switch (groupBy) {
      case "module":
        key = activity.module;
        label = activity.module;
        break;
      case "user":
        key = activity.userId;
        label = activity.user;
        break;
      case "department":
        key = activity.department;
        label = activity.department;
        break;
      case "type":
        key = activity.activityType;
        label = activity.activityType.replace(/_/g, " ");
        break;
      default: {
        key = activity.timestampIso.slice(0, 10);
        if (key === "2026-06-17") label = "Today";
        else if (key === "2026-06-16") label = "Yesterday";
        else
          label = new Date(key).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
      }
    }
    const existing = groups.get(key);
    if (existing) existing.items.push(activity);
    else groups.set(key, { label, items: [activity] });
  }

  return Array.from(groups.entries()).map(([key, { label, items }]) => ({
    key,
    label,
    items,
  }));
}
