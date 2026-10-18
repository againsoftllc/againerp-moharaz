import type { RmaStatus } from "@/lib/api/rma";

/**
 * The four steps of a return, as the shop floor sees them. Each one groups the detailed claim
 * statuses behind it, so the module only needs these four lists.
 */
export type RmaStageId = "complain" | "claim" | "replacement" | "delivery";

export const RMA_STAGES: {
  id: RmaStageId;
  label: string;
  hint: string;
  statuses: RmaStatus[];
}[] = [
  {
    id: "complain",
    label: "Complain Receive",
    hint: "Customer brought a faulty unit — received, checked, waiting for a decision.",
    statuses: ["draft", "pending_approval", "approved", "awaiting_return", "received", "diagnosing", "awaiting_approval", "in_repair", "on_hold"],
  },
  {
    id: "claim",
    label: "Replacement Claim",
    hint: "Claim lodged with the supplier — waiting for the replacement.",
    statuses: ["sent_to_supplier", "at_supplier"],
  },
  {
    id: "replacement",
    label: "Replacement Receive",
    hint: "Replacement or repaired unit is back from the supplier.",
    statuses: ["returned_from_supplier"],
  },
  {
    id: "delivery",
    label: "Customer Delivery",
    hint: "Ready to hand back to the customer, or already delivered.",
    statuses: ["ready_for_delivery", "delivered"],
  },
];

export const RMA_STAGE_BY_ID = Object.fromEntries(RMA_STAGES.map((s) => [s.id, s])) as Record<
  RmaStageId,
  (typeof RMA_STAGES)[number]
>;

export function stageOfStatus(status: string): RmaStageId | null {
  return RMA_STAGES.find((s) => s.statuses.includes(status as RmaStatus))?.id ?? null;
}

export function isRmaStageId(value: string | null | undefined): value is RmaStageId {
  return Boolean(value && value in RMA_STAGE_BY_ID);
}
