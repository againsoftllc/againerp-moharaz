import { Badge } from "@/components/ui/badge";
import type { ChequeStatus } from "@/lib/api/finance";
import { cn } from "@/lib/utils";

const TONE: Record<ChequeStatus, string> = {
  received: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  issued: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  deposited: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  presented: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  cleared: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  bounced: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "border-border bg-muted text-muted-foreground",
};

export const CHEQUE_STATUS_LABEL: Record<ChequeStatus, string> = {
  received: "Received",
  issued: "Issued",
  deposited: "Deposited",
  presented: "Presented",
  cleared: "Cleared",
  bounced: "Bounced",
  cancelled: "Cancelled",
};

export function ChequeStatusBadge({ status, className }: { status: ChequeStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", TONE[status], className)}>
      {CHEQUE_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
