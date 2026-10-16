"use client";

import type { ReactNode } from "react";
import {
  Bot,
  CheckCircle2,
  Download,
  Edit3,
  FileText,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  XCircle,
} from "lucide-react";
import type { TimelineActivity, TimelineActivityType, TimelinePriority } from "@/lib/timeline/types";
import { TIMELINE_ACTIVITY_LABELS } from "@/lib/timeline/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function TimelineActivityIcon({ type }: { type: TimelineActivityType }) {
  const className = "h-4 w-4";
  const wrap = (icon: ReactNode, color: string) => (
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", color)}>{icon}</span>
  );

  switch (type) {
    case "create":
      return wrap(<Plus className={className} aria-hidden />, "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300");
    case "update":
      return wrap(<Edit3 className={className} aria-hidden />, "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300");
    case "delete":
      return wrap(<Trash2 className={className} aria-hidden />, "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300");
    case "approval":
      return wrap(<CheckCircle2 className={className} aria-hidden />, "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300");
    case "rejection":
      return wrap(<XCircle className={className} aria-hidden />, "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300");
    case "comment":
      return wrap(<MessageSquare className={className} aria-hidden />, "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300");
    case "attachment":
      return wrap(<Paperclip className={className} aria-hidden />, "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300");
    case "assignment":
      return wrap(<UserPlus className={className} aria-hidden />, "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300");
    case "ai_insight":
    case "ai_action":
      return wrap(<Sparkles className={className} aria-hidden />, "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300");
    case "export":
      return wrap(<Download className={className} aria-hidden />, "bg-slate-100 text-slate-600 dark:bg-slate-800");
    case "import":
      return wrap(<Upload className={className} aria-hidden />, "bg-slate-100 text-slate-600 dark:bg-slate-800");
    case "system":
      return wrap(<Bot className={className} aria-hidden />, "bg-muted text-muted-foreground");
    default:
      return wrap(<RefreshCw className={className} aria-hidden />, "bg-muted text-muted-foreground");
  }
}

export function TimelinePriorityBadge({ priority }: { priority: TimelinePriority }) {
  if (priority === "low") return null;
  const variant = priority === "critical" || priority === "high" ? "warning" : "secondary";
  return (
    <Badge variant={variant} className="text-[9px] capitalize">
      {priority}
    </Badge>
  );
}

export function TimelineModuleChip({ module }: { module: TimelineActivity["module"] }) {
  const colors: Record<TimelineActivity["module"], string> = {
    HR: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
    Payroll: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
    CRM: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
    Sales: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    Purchase: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
    Inventory: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    Accounting: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    Manufacturing: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  };
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", colors[module])}>{module}</span>;
}

export function TimelineSourceChip({ source }: { source: TimelineActivity["source"] }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
      {source}
    </span>
  );
}

export function timelinePriorityBorder(priority: TimelinePriority, highlighted?: boolean) {
  if (highlighted) return "border-l-2 border-l-violet-500";
  switch (priority) {
    case "critical":
      return "border-l-2 border-l-red-500";
    case "high":
      return "border-l-2 border-l-amber-500";
    default:
      return "";
  }
}

export function activityTypeLabel(type: TimelineActivityType) {
  return TIMELINE_ACTIVITY_LABELS[type] ?? type;
}
