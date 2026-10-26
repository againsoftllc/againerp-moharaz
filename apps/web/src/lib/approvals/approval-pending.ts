import { toast } from "sonner";

/** What the API answers (HTTP 202) when a finalizing action is held for an approver instead of running (docs/approval.md). */
export type ApprovalPendingBody = {
  approval_pending: true;
  request_id: string;
  label: string;
  message: string;
};

export const APPROVAL_PENDING_PREFIX = "Sent for approval";

/** Fired whenever the approval queue may have changed (a call was held, or someone approved / rejected one). */
export const APPROVALS_CHANGED_EVENT = "again:approvals-changed";

export function notifyApprovalsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(APPROVALS_CHANGED_EVENT));
}

/**
 * Thrown by `apiFetch` when the call was held for approval. Nothing was changed yet, so callers treat it as "not done" like
 * any failure; the shared toast filter below keeps them from showing it as a red error.
 */
export class ApprovalPendingError extends Error {
  requestId: string;
  label: string;

  constructor(body: ApprovalPendingBody) {
    super(body.message);
    this.name = "ApprovalPendingError";
    this.requestId = body.request_id;
    this.label = body.label;
  }
}

export function isApprovalPendingBody(value: unknown): value is ApprovalPendingBody {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { approval_pending?: unknown }).approval_pending === true &&
    typeof (value as { request_id?: unknown }).request_id === "string"
  );
}

let filterInstalled = false;

/**
 * `apiFetch` already shows the "sent for approval" notice as an info toast. Callers' catch blocks would add a second, red one
 * with the same text; this drops that one error toast so the user sees a single, calm message.
 */
function installApprovalToastFilter() {
  if (filterInstalled || typeof window === "undefined") return;
  filterInstalled = true;
  const original = toast.error.bind(toast);
  (toast as unknown as { error: typeof toast.error }).error = ((message, data) => {
    if (typeof message === "string" && message.startsWith(APPROVAL_PENDING_PREFIX)) return undefined as never;
    return original(message, data);
  }) as typeof toast.error;
}

/** Tell the user their action is waiting for an approver. */
export function notifyApprovalPending(body: ApprovalPendingBody) {
  installApprovalToastFilter();
  if (typeof window === "undefined") return;
  notifyApprovalsChanged();
  toast.info(body.message, { description: "Track it under Inventory › Approve." });
}
