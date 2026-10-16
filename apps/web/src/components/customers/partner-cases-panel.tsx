"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, MessageSquare, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  closeCustomerCase,
  createCustomerCase,
  fetchCustomerCases,
  fetchCustomerOrders,
  replyCustomerCase,
  type CustomerCase,
  type CustomerCaseType,
} from "@/lib/api/commerce-customers";
import type { CustomerOrderSummary } from "@/lib/mock-data/customers";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  PartnerStatusPill,
  PartnerTabEmpty,
} from "@/components/customers/partner-customer-sections";

type Props = {
  customerId: string;
  orders?: CustomerOrderSummary[];
  readOnly?: boolean;
  /** Notify parent when open cases have a pending customer reply (for Support tab badge). */
  onPendingCustomerRepliesChange?: (count: number) => void;
};

function formatCaseDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return formatDateTime(value);
}

/** Last thread message is from the customer — admin should reply. */
function caseHasPendingCustomerReply(row: CustomerCase): boolean {
  if (row.status.toLowerCase() !== "open") return false;
  if (!row.replies.length) return false;
  const last = row.replies[row.replies.length - 1];
  return (last.role || "").toLowerCase() === "customer";
}

function customerReplyCount(row: CustomerCase): number {
  return row.replies.filter((r) => (r.role || "").toLowerCase() === "customer").length;
}

export function PartnerCasesPanel({
  customerId,
  orders = [],
  readOnly,
  onPendingCustomerRepliesChange,
}: Props) {
  const [cases, setCases] = useState<CustomerCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<CustomerCaseType>("support");
  const [orderId, setOrderId] = useState("");
  const [orderOptions, setOrderOptions] = useState<CustomerOrderSummary[]>(orders);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeCase, setActiveCase] = useState<CustomerCase | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [closing, setClosing] = useState(false);
  const resolvedCustomerId = customerId.trim();

  useEffect(() => {
    setOrderOptions(orders);
  }, [orders]);

  const load = useCallback(async () => {
    if (!resolvedCustomerId) {
      setCases([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchCustomerCases(resolvedCustomerId);
      setCases(rows);
      setActiveCase((prev) => (prev ? rows.find((row) => row.id === prev.id) ?? null : null));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load cases");
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [resolvedCustomerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const pending = cases.filter(caseHasPendingCustomerReply).length;
    onPendingCustomerRepliesChange?.(pending);
  }, [cases, onPendingCustomerRepliesChange]);

  const openAdd = async () => {
    setAddType("support");
    setOrderId("");
    setSubject("");
    setMessage("");
    setAddOpen(true);
    if (!resolvedCustomerId) return;
    try {
      const fresh = await fetchCustomerOrders(resolvedCustomerId);
      if (fresh.length) setOrderOptions(fresh);
    } catch {
      /* keep existing order options */
    }
  };

  const openCase = (row: CustomerCase) => {
    setActiveCase(row);
    setReplyText("");
  };

  const submitCase = async () => {
    if (!resolvedCustomerId) {
      toast.error("Save the customer first");
      return;
    }
    if (!subject.trim() || !message.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    setSaving(true);
    try {
      await createCustomerCase(resolvedCustomerId, {
        caseType: addType,
        subject: subject.trim(),
        message: message.trim(),
        orderId: orderId || undefined,
      });
      toast.success("Case created");
      setAddOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create case");
    } finally {
      setSaving(false);
    }
  };

  const submitReply = async () => {
    if (!resolvedCustomerId || !activeCase) return;
    if (!replyText.trim()) {
      toast.error("Reply message is required");
      return;
    }
    setReplying(true);
    try {
      const updated = await replyCustomerCase(
        resolvedCustomerId,
        activeCase.id,
        replyText.trim(),
      );
      setActiveCase(updated);
      setReplyText("");
      setCases((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      toast.success("Reply sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setReplying(false);
    }
  };

  const submitClose = async () => {
    if (!resolvedCustomerId || !activeCase) return;
    if (activeCase.status.toLowerCase() === "closed") return;
    setClosing(true);
    try {
      const updated = await closeCustomerCase(resolvedCustomerId, activeCase.id);
      setActiveCase(updated);
      setCases((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      toast.success("Case closed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to close case");
    } finally {
      setClosing(false);
    }
  };

  if (!resolvedCustomerId) {
    return (
      <PartnerTabEmpty
        title="No cases for a new contact"
        description="QC, complaint, and support cases become available after the customer is created."
      />
    );
  }

  const caseIsOpen = (activeCase?.status || "").toLowerCase() === "open";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {!readOnly ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 rounded-none px-2 text-[12px]"
            onClick={() => void openAdd()}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add case
          </Button>
        ) : null}
        <p className="text-[12px] text-muted-foreground">
          QC, complaint, and support cases for this customer.
        </p>
      </div>

      {loading ? (
        <p className="border border-border/70 bg-background/50 px-3 py-6 text-center text-[13px] text-muted-foreground">
          Loading cases…
        </p>
      ) : cases.length === 0 ? (
        <PartnerTabEmpty
          title="No cases yet"
          description={
            readOnly
              ? "Cases for this customer will appear here."
              : "Use Add case to create a QC, complaint, or support case."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-none border border-border/70 bg-background/50">
          <ul className="divide-y divide-border/50">
            {cases.map((row) => {
              const open = row.status.toLowerCase() === "open";
              const pendingCustomer = caseHasPendingCustomerReply(row);
              const customerReplies = customerReplyCount(row);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => openCase(row)}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 px-2.5 py-2 text-left text-[13px] hover:bg-muted/40",
                      pendingCustomer && "bg-amber-50/70 dark:bg-amber-950/20",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <p className="truncate font-medium text-foreground">{row.subject}</p>
                        <PartnerStatusPill className="capitalize">{row.caseType}</PartnerStatusPill>
                        <PartnerStatusPill
                          tone={open ? "success" : "neutral"}
                          className={cn(
                            "capitalize",
                            !open &&
                              "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300",
                          )}
                        >
                          {row.status}
                        </PartnerStatusPill>
                        {pendingCustomer ? (
                          <PartnerStatusPill tone="warning">Customer replied</PartnerStatusPill>
                        ) : customerReplies > 0 ? (
                          <PartnerStatusPill tone="info">
                            {customerReplies} customer{" "}
                            {customerReplies === 1 ? "reply" : "replies"}
                          </PartnerStatusPill>
                        ) : row.replies.length > 0 ? (
                          <PartnerStatusPill>
                            {row.replies.length}{" "}
                            {row.replies.length === 1 ? "reply" : "replies"}
                          </PartnerStatusPill>
                        ) : null}
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {row.caseNumber}
                        {row.orderNumber ? ` · ${row.orderNumber}` : ""}
                        {" · "}
                        {formatDate(row.date)}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                        {pendingCustomer
                          ? row.replies[row.replies.length - 1]?.message || row.message
                          : row.message}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 text-[11px]",
                        pendingCustomer
                          ? "font-semibold text-amber-700 dark:text-amber-300"
                          : "text-muted-foreground",
                      )}
                    >
                      {pendingCustomer ? "Reply ›" : open ? "Open ›" : "View ›"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent
          side="right"
          title="New case"
          resizable
          closeButton="chevron"
          className="w-[380px] min-w-[280px] max-w-[720px] rounded-none p-0"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              New case
            </p>
            <SheetTitle className="text-[15px]">Create case</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 p-4">
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-muted-foreground">Type</label>
              <Select
                value={addType}
                onChange={(e) => setAddType(e.target.value as CustomerCaseType)}
                className="h-9 w-full rounded-none border border-border bg-background px-2 text-[13px]"
              >
                <option value="qc">QC</option>
                <option value="complaint">Complaint</option>
                <option value="support">Support</option>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-muted-foreground">Order</label>
              <Select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="h-9 w-full rounded-none border border-border bg-background px-2 text-[13px]"
              >
                <option value="">No order linked</option>
                {orderOptions.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.orderNumber}
                    {order.productLabel ? ` · ${order.productLabel}` : ""}
                    {order.date ? ` · ${order.date}` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-muted-foreground">Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-9 w-full rounded-none border border-border bg-background px-2 text-[13px] outline-none"
                placeholder="Short summary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-muted-foreground">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="w-full rounded-none border border-border bg-background px-2 py-2 text-[13px] outline-none"
                placeholder="Details…"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-none bg-[#00a09d] text-white hover:bg-[#008f8c]"
              disabled={saving}
              onClick={() => void submitCase()}
            >
              {saving ? "Saving…" : "Create case"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(activeCase)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveCase(null);
            setReplyText("");
          }
        }}
      >
        <SheetContent
          side="right"
          title="Case details"
          resizable
          closeButton="chevron"
          className="flex w-[420px] min-w-[300px] max-w-[720px] flex-col rounded-none p-0"
        >
          {activeCase ? (
            <>
              <SheetHeader className="border-b border-border px-4 py-3 text-left">
                <div className="flex flex-wrap items-center gap-1.5">
                  <PartnerStatusPill className="capitalize">{activeCase.caseType}</PartnerStatusPill>
                  <PartnerStatusPill
                    tone={caseIsOpen ? "success" : "neutral"}
                    className={cn(
                      "capitalize",
                      !caseIsOpen &&
                        "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300",
                    )}
                  >
                    {activeCase.status}
                  </PartnerStatusPill>
                  {caseHasPendingCustomerReply(activeCase) ? (
                    <PartnerStatusPill tone="warning">Customer replied</PartnerStatusPill>
                  ) : null}
                </div>
                <SheetTitle className="text-[15px]">{activeCase.subject}</SheetTitle>
                <p className="text-[11px] text-muted-foreground">
                  {activeCase.caseNumber}
                  {activeCase.orderNumber ? ` · ${activeCase.orderNumber}` : ""}
                  {activeCase.managerName ? ` · ${activeCase.managerName}` : ""}
                </p>
              </SheetHeader>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                <div className="rounded-none border border-border/70 bg-muted/20 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Original message
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-foreground">
                    {activeCase.message}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatCaseDate(activeCase.date)}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Replies
                  </p>
                  {activeCase.replies.length === 0 ? (
                    <p className="border border-dashed border-border/70 px-3 py-4 text-center text-[12px] text-muted-foreground">
                      No replies yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {activeCase.replies.map((reply) => {
                        const fromCustomer = (reply.role || "").toLowerCase() === "customer";
                        return (
                          <li
                            key={reply.id || `${reply.at}-${reply.message.slice(0, 12)}`}
                            className={cn(
                              "rounded-none border px-3 py-2",
                              fromCustomer
                                ? "border-amber-200/80 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/25"
                                : "border-border/70 bg-background",
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[12px] font-medium text-foreground">
                                {reply.author}
                                <span
                                  className={cn(
                                    "ml-1 font-normal capitalize",
                                    fromCustomer
                                      ? "text-amber-700 dark:text-amber-300"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  · {fromCustomer ? "Customer" : reply.role}
                                </span>
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {formatCaseDate(reply.at)}
                              </p>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-[13px] text-foreground">
                              {reply.message}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {!readOnly && caseIsOpen ? (
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <label className="text-[12px] font-medium text-muted-foreground">
                      Write a reply
                    </label>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={4}
                      className="w-full rounded-none border border-border bg-background px-2 py-2 text-[13px] outline-none"
                      placeholder="Reply to the customer…"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 rounded-none bg-[#00a09d] text-white hover:bg-[#008f8c]"
                        disabled={replying || closing}
                        onClick={() => void submitReply()}
                      >
                        <MessageSquare className="mr-1 h-3.5 w-3.5" />
                        {replying ? "Sending…" : "Send reply"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-none"
                        disabled={replying || closing}
                        onClick={() => void submitClose()}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        {closing ? "Closing…" : "Close case"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {!readOnly && !caseIsOpen ? (
                  <p className="border border-border/70 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                    This case is closed. Replies are locked.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
