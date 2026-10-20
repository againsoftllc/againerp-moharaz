import { requestRmaReceipt, type RmaReceipt } from "@/lib/api/rma";
import { requestRmaClaimCopy, type RmaClaimCopy } from "@/lib/api/rma-claims";
import { requestRmaReceiptCopy, type RmaReceiptCopy } from "@/lib/api/rma-receipts";
import { requestRmaDeliveryCopy, type RmaDeliveryCopy } from "@/lib/api/rma-deliveries";

export const RMA_PRINT_STORAGE_KEY = "againerp:rma-print";

/** What the print page can show: the customer's complaint receipt or the supplier's claim / dispatch copy. */
export type RmaPrintPayload =
  | { kind: "complaint"; data: RmaReceipt }
  | { kind: "claim"; data: RmaClaimCopy }
  | { kind: "receive"; data: RmaReceiptCopy }
  | { kind: "delivery"; data: RmaDeliveryCopy };

/** Same hand-over as the sales print: the payload goes in localStorage (shared between tabs) and the print route reads it. */
export function storeRmaPrint(payload: RmaPrintPayload): string {
  if (typeof window === "undefined") return "";
  const printKey = `${RMA_PRINT_STORAGE_KEY}:${Date.now()}`;
  localStorage.setItem(printKey, JSON.stringify(payload));
  return printKey;
}

export function readRmaPrint(printKey?: string | null): RmaPrintPayload | null {
  if (typeof window === "undefined" || !printKey) return null;
  try {
    const blob = localStorage.getItem(printKey);
    if (!blob) return null;
    const parsed = JSON.parse(blob) as RmaPrintPayload | RmaReceipt;
    // a receipt stored without the wrapper
    return "kind" in parsed ? parsed : { kind: "complaint", data: parsed };
  } catch {
    return null;
  }
}

/**
 * Fetch the document from the server (it counts the print, and a reprint needs the reprint permission) and open the
 * print page. The window opens first so a popup blocker sees the user's click, then it is pointed at the document.
 */
async function openPrint<T extends RmaPrintPayload>(load: () => Promise<T>, preOpened?: Window | null): Promise<T> {
  const win = preOpened ?? (typeof window !== "undefined" ? window.open("", "_blank") : null);
  try {
    const payload = await load();
    const url = `/rma-print?k=${encodeURIComponent(storeRmaPrint(payload))}`;
    if (win) win.location.href = url;
    else window.location.href = url;
    return payload;
  } catch (err) {
    win?.close();
    throw err;
  }
}

export async function openRmaReceipt(ticketId: string, preOpened?: Window | null): Promise<RmaReceipt> {
  const printed = await openPrint(async () => ({ kind: "complaint" as const, data: await requestRmaReceipt(ticketId) }), preOpened);
  return printed.data;
}

export async function openRmaClaimCopy(claimId: string, preOpened?: Window | null): Promise<RmaClaimCopy> {
  const printed = await openPrint(async () => ({ kind: "claim" as const, data: await requestRmaClaimCopy(claimId) }), preOpened);
  return printed.data;
}

export async function openRmaReceiveCopy(receiptId: string, preOpened?: Window | null): Promise<RmaReceiptCopy> {
  const printed = await openPrint(async () => ({ kind: "receive" as const, data: await requestRmaReceiptCopy(receiptId) }), preOpened);
  return printed.data;
}

export async function openRmaDeliveryCopy(deliveryId: string, preOpened?: Window | null): Promise<RmaDeliveryCopy> {
  const printed = await openPrint(async () => ({ kind: "delivery" as const, data: await requestRmaDeliveryCopy(deliveryId) }), preOpened);
  return printed.data;
}
