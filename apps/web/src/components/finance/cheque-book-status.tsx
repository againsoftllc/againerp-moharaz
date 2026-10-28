import { Badge } from "@/components/ui/badge";
import type { ChequeBookState, ChequeLeafDisplayStatus } from "@/lib/api/finance";
import { cn } from "@/lib/utils";

const LEAF_TONE: Record<ChequeLeafDisplayStatus, string> = {
  unused: "border-border bg-muted text-muted-foreground",
  void: "border-border bg-muted text-muted-foreground line-through",
  not_treated: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  cleared: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  bounced: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "border-border bg-muted text-muted-foreground",
};

export const LEAF_STATUS_LABEL: Record<ChequeLeafDisplayStatus, string> = {
  unused: "Unused",
  void: "Void",
  not_treated: "Not Treated",
  cleared: "Honoured",
  bounced: "Dishonoured",
  cancelled: "Cancelled",
};

export function ChequeLeafStatusBadge({ status, className }: { status: ChequeLeafDisplayStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(LEAF_TONE[status], className)}>
      {LEAF_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export const BOOK_STATE_LABEL: Record<ChequeBookState, string> = { draft: "Draft", active: "Active", closed: "Closed" };

const BOOK_TONE: Record<ChequeBookState, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  closed: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

export function ChequeBookStateBadge({ state, className }: { state: ChequeBookState; className?: string }) {
  return (
    <Badge variant="outline" className={cn(BOOK_TONE[state], className)}>
      {BOOK_STATE_LABEL[state] ?? state}
    </Badge>
  );
}

/** Draft > Active > Closed, the current step filled in. */
export function ChequeBookStateSteps({ state }: { state: ChequeBookState }) {
  return (
    <div className="flex items-center text-xs" aria-label="Cheque book state">
      {(["draft", "active", "closed"] as const).map((step, i) => (
        <div key={step} className="flex items-center">
          {i > 0 ? <span className="px-1.5 text-muted-foreground">›</span> : null}
          <span
            className={cn(
              "px-2.5 py-1",
              step === state ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {BOOK_STATE_LABEL[step]}
          </span>
        </div>
      ))}
    </div>
  );
}

/** "454540 → 454550" for a book's number range. */
export function chequeRangeLabel(prefix: string, from: number, to: number): string {
  const width = Math.max(String(from).length, String(to).length);
  const fmt = (n: number) => `${prefix}${String(n).padStart(width, "0")}`;
  return `${fmt(from)} → ${fmt(to)}`;
}
