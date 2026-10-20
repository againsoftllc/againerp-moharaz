"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Factory, Paperclip, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
} from "@/components/again/again-drawer";
import {
  AGAIN_FORM_RECORD_TITLE_CLASS,
  AgainFormRow,
  AgainUnderlineInput,
  AgainUnderlineTextarea,
} from "@/components/again/again-form-sheet";
import {
  BillDrawer,
  ChargeDrawer,
  InspectionDrawer,
  RefundDrawer,
  ReplacementDrawer,
  ResolveDrawer,
  RestockDrawer,
  ServiceFromRmaDrawer,
  StatusDrawer,
  SupplierJobDrawer,
  WarrantyDrawer,
} from "@/components/rma/rma-drawers";
import { RmaApprovalDrawer } from "@/components/rma/rma-approval-drawer";
import { RmaSupplierOverrideDrawer } from "@/components/rma/rma-supplier-override-drawer";
import { RmaSupplierClaimDrawer } from "@/components/rma/rma-supplier-claim-drawer";
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import {
  CLAIM_OPEN,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_TONE,
  createRmaClaim,
  fetchRmaClaims,
  type RmaClaim,
} from "@/lib/api/rma-claims";
import { RmaReceiptDrawer } from "@/components/rma/rma-receipt-drawer";
import { RmaDeliveryDrawer } from "@/components/rma/rma-delivery-drawer";
import { RmaSettlementDrawer } from "@/components/rma/rma-settlement-drawer";
import {
  DELIVERY_STATUS_LABEL,
  DELIVERY_STATUS_TONE,
  createRmaDelivery,
  fetchRmaDeliveries,
  fetchRmaDeliverySummary,
  type RmaDelivery,
  type RmaDeliverySummary,
} from "@/lib/api/rma-deliveries";
import {
  DIRECTION_LABEL,
  PARTY_TYPE_LABEL,
  PURPOSE_LABEL,
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_TONE,
  fetchRmaSettlementSummary,
  fetchRmaSettlements,
  type RmaSettlement,
  type RmaSettlementSummary,
} from "@/lib/api/rma-settlements";
import {
  RECEIPT_OUTCOME_LABEL,
  RECEIPT_STATUS_LABEL,
  RECEIPT_STATUS_TONE,
  createRmaReceipt,
  fetchRmaReceipts,
  type RmaReceipt as RmaSupplierReceiptRow,
} from "@/lib/api/rma-receipts";
import {
  changeRmaStatus,
  fetchPriorRmas,
  fetchRmaHistory,
  fetchRmaStockEvents,
  fetchRmaStores,
  fetchRmaTicket,
  recheckWarranty,
  removeRmaCharge,
  scrapRmaTicket,
  submitRmaForApproval,
  updateRmaTicket,
  CUSTODY_LABEL,
  RESOLUTION_LABEL,
  RMA_STATUS_LABEL,
  RMA_STATUS_TONE,
  WARRANTY_LABEL,
  WARRANTY_TONE,
  type RmaHistoryEntry,
  type RmaPrior,
  type RmaStockEvent,
  type RmaStore,
  type RmaTicket,
  fetchRmaServiceJob,
  type RmaServiceJob,
} from "@/lib/api/rma";
import {
  deleteCollabFile,
  fetchCollabActivity,
  fetchCollabFiles,
  uploadCollabFile,
  type CollabActivity,
  type CollabFile,
} from "@/lib/api/collaboration";
import { fetchAuthUsers } from "@/lib/api/auth-users";
import { usePermission } from "@/lib/auth/permissions";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { openRmaReceipt } from "@/lib/rma/rma-print";
import { RMA_STAGES, stageOfStatus } from "@/lib/rma/stages";
import { cn, formatCurrency } from "@/lib/utils";

type Tab = "overview" | "complaint" | "claim" | "delivery" | "stock" | "files" | "activity";

const STOCK_STEP_LABEL: Record<string, string> = {
  intake: "Received into the RMA store",
  restock: "Returned to sellable stock",
  scrap: "Scrapped",
  replacement: "Replacement issued",
  dispatch: "Sent to the supplier",
  receipt: "Received back from the supplier",
  delivery: "Delivered to the customer",
};

const ACTIVITY_LABEL: Record<string, string> = {
  created: "Complaint opened",
  sent_for_approval: "Sent for approval",
  complaint_approved: "Complaint approved",
  complaint_rejected: "Complaint rejected",
  complaint_correction_requested: "Returned for correction",
  status_changed: "Status changed",
  stock_in_rma_store: "Stocked into the RMA store",
  stock_reversed: "Stock taken back out",
  receipt_printed: "Complaint receipt printed",
  receipt_reprinted: "Complaint receipt reprinted",
  protected_field_changed: "Protected field changed",
  supplier_override: "Supplier set by hand",
  claim_created: "Supplier claim created",
  claim_submitted: "Supplier claim sent for approval",
  claim_approved: "Supplier claim approved",
  claim_rejected: "Supplier claim rejected",
  claim_correction_requested: "Supplier claim sent back",
  claim_cancelled: "Supplier claim cancelled",
  claim_dispatched: "Dispatched to the supplier",
  claim_copy_printed: "Supplier copy printed",
  claim_copy_reprinted: "Supplier copy reprinted",
  receipt_created: "Supplier receipt created",
  receipt_submitted: "Supplier receipt sent for approval",
  receipt_approved: "Supplier receipt approved",
  receipt_rejected: "Supplier receipt rejected",
  receipt_correction_requested: "Supplier receipt sent back",
  receipt_cancelled: "Supplier receipt cancelled",
  receipt_copy_printed: "Receive copy printed",
  receipt_copy_reprinted: "Receive copy reprinted",
  stock_in_from_supplier: "Unit stocked back from the supplier",
  delivery_created: "Customer delivery created",
  delivery_submitted: "Customer delivery sent for approval",
  delivery_approved: "Customer delivery approved",
  delivery_rejected: "Customer delivery rejected",
  delivery_correction_requested: "Customer delivery sent back",
  delivery_cancelled: "Customer delivery cancelled",
  delivery_copy_printed: "Delivery copy printed",
  delivery_copy_reprinted: "Delivery copy reprinted",
  payment_received: "Customer payment recorded",
  settlement_created: "Settlement created",
  settlement_submitted: "Settlement sent for approval",
  settlement_approved: "Settlement approved",
  settlement_rejected: "Settlement rejected",
  settlement_correction_requested: "Settlement sent back",
  settlement_cancelled: "Settlement cancelled",
  settlement_posted: "Settlement posted to Finance",
  stock_out_to_customer: "Unit handed over to the customer",
};

type EditForm = {
  assigned_to_user_id: string;
  promised_delivery_date: string;
  charge_estimate: string;
  diagnosis_required: boolean;
  diagnosis_report: string;
  warehouse_id: string;
  priority: string;
  fault_reported: string;
  accessories: string;
  condition_notes: string;
};

function toForm(t: RmaTicket): EditForm {
  return {
    assigned_to_user_id: t.assigned_to_user_id ?? "",
    promised_delivery_date: t.promised_delivery_date ?? "",
    charge_estimate: String(Number(t.charge_estimate ?? 0) || ""),
    diagnosis_required: Boolean(t.diagnosis_required),
    diagnosis_report: t.diagnosis_report ?? "",
    warehouse_id: t.warehouse_id ?? "",
    priority: t.priority,
    fault_reported: t.fault_reported,
    accessories: t.accessories ?? "",
    condition_notes: t.condition_notes ?? "",
  };
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 flex items-center gap-2 border-b border-border/80 pb-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, note }: { label: string; value?: string | number | null; note?: string }) {
  return (
    <div className="flex gap-3 py-[3px] text-[13px]">
      <span className="w-[8.5rem] shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">
        {value || "—"}
        {note ? <span className="ml-2 text-[11px] text-muted-foreground">{note}</span> : null}
      </span>
    </div>
  );
}

function StageTimeline({ status }: { status: string }) {
  const current = stageOfStatus(status);
  const index = RMA_STAGES.findIndex((s) => s.id === current);
  const stopped = status === "rejected" || status === "cancelled";
  return (
    <ol className="flex flex-wrap items-stretch gap-1 text-[11px]" aria-label="Claim stages">
      {RMA_STAGES.map((stage, i) => {
        // a completed RMA has been through every stage
        const complete = status === "closed";
        const done = !stopped && (complete || index > i);
        const active = !stopped && !complete && index === i;
        return (
          <li
            key={stage.id}
            title={stage.hint}
            className={cn(
              "flex min-w-0 flex-1 basis-[7rem] items-center gap-1.5 border px-2 py-1",
              active && "border-[#00a09d] bg-[#00a09d] font-medium text-white",
              done && "border-[#00a09d]/40 bg-[#00a09d]/10 text-[#00a09d]",
              !active && !done && "border-border/80 bg-background text-muted-foreground",
            )}
          >
            <span className="font-mono text-[10px]">{i + 1}</span>
            <span className="truncate">{stage.label}</span>
          </li>
        );
      })}
      {stopped ? (
        <li className="flex items-center border border-red-500/40 bg-red-500/10 px-2 py-1 font-medium text-red-600 dark:text-red-400">
          {RMA_STATUS_LABEL[status as keyof typeof RMA_STATUS_LABEL]}
        </li>
      ) : null}
    </ol>
  );
}

export function RmaDetailDrawer({
  ticketId,
  onClose,
  onChanged,
}: {
  ticketId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const canWrite = useAdminCanWrite();
  const canApprove = usePermission("rma_approve", "write");
  const canOverride = usePermission("rma_override", "write");
  const canReprint = usePermission("rma_reprint", "write");
  const canRecordSettlement = usePermission("rma_payment", "write");
  const canStockAdjust = usePermission("rma_stock_adjust", "write");

  const [ticket, setTicket] = useState<RmaTicket | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [history, setHistory] = useState<RmaHistoryEntry[]>([]);
  const [prior, setPrior] = useState<RmaPrior[]>([]);
  const [events, setEvents] = useState<RmaStockEvent[]>([]);
  const [claims, setClaims] = useState<RmaClaim[]>([]);
  const [receipts, setReceipts] = useState<RmaSupplierReceiptRow[]>([]);
  const [deliveries, setDeliveries] = useState<RmaDelivery[]>([]);
  const [deliverySummary, setDeliverySummary] = useState<RmaDeliverySummary | null>(null);
  const [deliveryOpenId, setDeliveryOpenId] = useState<string | null>(null);
  const [deliveryDrawerOpen, setDeliveryDrawerOpen] = useState(false);
  const [creatingDelivery, setCreatingDelivery] = useState(false);
  const [settlements, setSettlements] = useState<RmaSettlement[]>([]);
  const [settlementSummary, setSettlementSummary] = useState<RmaSettlementSummary | null>(null);
  const [settlementOpenId, setSettlementOpenId] = useState<string | null>(null);
  const [settlementDrawerOpen, setSettlementDrawerOpen] = useState(false);
  const [receiptOpenId, setReceiptOpenId] = useState<string | null>(null);
  const [receiptDrawerOpen, setReceiptDrawerOpen] = useState(false);
  const [creatingReceipt, setCreatingReceipt] = useState<string | null>(null);
  const [claimOpenId, setClaimOpenId] = useState<string | null>(null);
  const [claimDrawerOpen, setClaimDrawerOpen] = useState(false);
  const [claimSupplierId, setClaimSupplierId] = useState("");
  const [claimReason, setClaimReason] = useState("");
  const [creatingClaim, setCreatingClaim] = useState(false);
  const { suppliers } = useCommerceSuppliers();
  const [stores, setStores] = useState<RmaStore[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [activity, setActivity] = useState<CollabActivity[]>([]);
  const [files, setFiles] = useState<CollabFile[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<number | null>(null);

  const [approvalOpen, setApprovalOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierOverrideOpen, setSupplierOverrideOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [serviceJob, setServiceJob] = useState<RmaServiceJob | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);

  const load = useCallback(async () => {
    if (!ticketId) return;
    try {
      const t = await fetchRmaTicket(ticketId);
      setTicket(t);
      setForm(toForm(t));
      const [h, ev, cl, pr] = await Promise.all([
        fetchRmaHistory(ticketId).catch(() => []),
        fetchRmaStockEvents(ticketId).catch(() => []),
        fetchRmaClaims(ticketId).catch(() => []),
        fetchPriorRmas({
          serial: t.serial_number ?? undefined,
          itemId: t.item_id ?? undefined,
          customerId: t.customer_id ?? undefined,
          excludeId: t.id,
        }).catch(() => []),
      ]);
      setHistory(h);
      setEvents(ev);
      setClaims(cl);
      void fetchRmaDeliveries(ticketId).then(setDeliveries).catch(() => setDeliveries([]));
      void fetchRmaDeliverySummary(ticketId).then(setDeliverySummary).catch(() => setDeliverySummary(null));
      void fetchRmaSettlements(ticketId).then(setSettlements).catch(() => setSettlements([]));
      void fetchRmaServiceJob(ticketId).then(setServiceJob).catch(() => setServiceJob(null));
      void fetchRmaSettlementSummary(ticketId).then(setSettlementSummary).catch(() => setSettlementSummary(null));
      const dispatched = cl.filter((c) => c.status === "dispatched");
      setReceipts((await Promise.all(dispatched.map((c) => fetchRmaReceipts(c.id).catch(() => [])))).flat());
      setPrior(pr);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the claim");
      setTicket(null);
    }
  }, [ticketId]);

  // a fresh load whenever another claim opens — declared before the draft hook so a saved draft is put back after it
  useEffect(() => {
    setTicket(null);
    setForm(null);
    setTab("overview");
    setActivity([]);
    setFiles([]);
    if (!ticketId) return;
    void load();
    void fetchRmaStores().then(setStores).catch(() => setStores([]));
    void fetchAuthUsers()
      .then((rows) => setUsers(rows.map((u) => ({ id: u.id, name: u.name || u.username }))))
      .catch(() => setUsers([]));
  }, [ticketId, load]);

  const loadActivity = useCallback(async () => {
    if (!ticketId) return;
    try {
      setActivity((await fetchCollabActivity("rma", ticketId, { limit: 100 })).data);
    } catch {
      setActivity([]);
    }
  }, [ticketId]);

  const loadFiles = useCallback(async () => {
    if (!ticketId) return;
    try {
      setFiles(await fetchCollabFiles("rma", ticketId));
    } catch {
      setFiles([]);
    }
  }, [ticketId]);

  useEffect(() => {
    if (tab === "activity") void loadActivity();
    if (tab === "files") void loadFiles();
  }, [tab, loadActivity, loadFiles]);

  const refresh = useCallback(() => {
    void load();
    if (tab === "activity") void loadActivity();
    onChanged?.();
  }, [load, loadActivity, onChanged, tab]);

  const saved = useMemo(() => (ticket ? toForm(ticket) : null), [ticket]);
  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved));
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<{ form: EditForm; scrollTop: number }>({
    key: ticketId ? `rma:${ticketId}` : null,
    ready: Boolean(ticket && form),
    dirty,
    getValues: () => ({ form: form as EditForm, scrollTop: scrollRef.current?.scrollTop ?? 0 }),
    restore: (values) => {
      setForm(values.form);
      setTab("complaint");
      pendingScroll.current = values.scrollTop;
    },
    onDiscard: () => ticket && setForm(toForm(ticket)),
    label: "claim",
  });

  useEffect(() => {
    if (pendingScroll.current == null) return;
    const top = pendingScroll.current;
    pendingScroll.current = null;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top }));
  }, [form, tab]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      saveDraftIfDirty();
      onClose();
    }
  };

  const patch = (changes: Partial<EditForm>) => setForm((current) => (current ? { ...current, ...changes } : current));

  const save = async () => {
    if (!ticket || !form || !saved) return;
    const changes: Record<string, unknown> = {};
    (Object.keys(form) as (keyof EditForm)[]).forEach((key) => {
      if (form[key] === saved[key]) return;
      if (key === "charge_estimate") changes[key] = Number(form[key] || 0);
      else if (key === "promised_delivery_date" || key === "assigned_to_user_id" || key === "warehouse_id") {
        if (form[key]) changes[key] = form[key];
      } else changes[key] = form[key];
    });
    if (!Object.keys(changes).length) return;
    setSaving(true);
    try {
      const next = await updateRmaTicket(ticket.id, changes);
      setTicket(next);
      setForm(toForm(next));
      clearDraft();
      toast.success("Saved");
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    clearDraft();
    if (ticket) setForm(toForm(ticket));
  };

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.success(done);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the claim");
    }
  };

  const printReceipt = async () => {
    if (!ticket) return;
    try {
      const receipt = await openRmaReceipt(ticket.id);
      toast.success(receipt.reprint ? `Receipt ${receipt.receipt_no} reprinted` : `Receipt ${receipt.receipt_no} opened`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the receipt");
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file || !ticket) return;
    setUploading(true);
    try {
      await uploadCollabFile("rma", ticket.id, file, "document");
      toast.success(`${file.name} attached`);
      await loadFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const status = ticket?.status;
  const closed = status === "closed" || status === "cancelled" || status === "rejected";
  // the unit is physically here (not waiting for approval, and not out with a supplier)
  const inHouse = Boolean(
    ticket &&
      ticket.unit_received !== false &&
      ticket.custody_state !== "with_supplier" &&
      !["draft", "pending_approval", "correction_requested", "approved", "awaiting_return", "sent_to_supplier", "at_supplier"].includes(ticket.status),
  );
  const storeName = stores.find((s) => s.id === ticket?.warehouse_id)?.name;
  const stockLocked = Boolean(ticket?.custody_state) || events.some((e) => e.event_key === "intake" && !e.reversed);
  const billed = ticket?.bill_status === "billed";
  const showStock = events.length > 0 || Boolean(ticket?.custody_state);
  const openClaim = claims.find((c) => CLAIM_OPEN.includes(c.status));
  const canRaiseClaim = Boolean(
    ticket && ticket.custody_state === "in_rma_store" && !openClaim && ["received", "diagnosing", "awaiting_approval", "in_repair"].includes(ticket.status),
  );
  const showClaimTab = claims.length > 0 || canRaiseClaim;
  const openDeliveryDoc = deliveries.find((d) => ["draft", "pending_approval", "correction_requested"].includes(d.status));
  const canStartDelivery = Boolean(
    ticket &&
      canWrite &&
      !closed &&
      !openDeliveryDoc &&
      !["draft", "pending_approval", "correction_requested"].includes(ticket.status) &&
      deliverySummary &&
      deliverySummary.can_deliver_product,
  );
  const canStartSettlement = Boolean(ticket && canWrite && canRecordSettlement && settlementSummary?.can_settle);
  const showDeliveryTab = deliveries.length > 0 || settlements.length > 0 || canStartDelivery || Boolean(settlementSummary?.can_settle);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "complaint", label: "Complaint & Diagnosis" },
    ...(showClaimTab ? [{ id: "claim" as const, label: "Supplier Claim" }] : []),
    ...(showDeliveryTab ? [{ id: "delivery" as const, label: "Delivery & Settlement" }] : []),
    ...(showStock ? [{ id: "stock" as const, label: "Stock Movements" }] : []),
    { id: "files", label: "Attachments" },
    { id: "activity", label: "Activity" },
  ];

  return (
    <AgainDrawerPanel
      open={Boolean(ticketId)}
      onOpenChange={handleOpenChange}
      title="RMA claim"
      resizable
      defaultWidthRatio={0.6}
      minWidth={420}
      widthStorageKey="again-rma-detail-drawer-width"
      onInteractOutside={(event) => {
        // A drawer opened from this one sits on top of it: clicks inside it must not close this one.
        const target = event.target;
        if (!(target instanceof Element)) return;
        const otherContent = target.closest("[data-radix-dialog-content]");
        if (otherContent && otherContent !== event.currentTarget) {
          event.preventDefault();
          return;
        }
        if (target.closest("[data-radix-dialog-overlay]") && document.querySelectorAll("[data-radix-dialog-overlay]").length > 1) {
          event.preventDefault();
        }
      }}
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />}>
          {ticket && canWrite && !closed ? (
            dirty ? (
              <>
                <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </AgainDrawerButton>
                <AgainDrawerButton onClick={discard} disabled={saving}>
                  Discard
                </AgainDrawerButton>
              </>
            ) : (
              <>
                {(status === "draft" || status === "correction_requested") && (
                  <AgainDrawerButton variant="primary" onClick={() => void run(() => submitRmaForApproval(ticket.id), "Sent for approval")}>
                    Send for approval
                  </AgainDrawerButton>
                )}
                {status === "pending_approval" && (
                  <AgainDrawerButton variant="primary" onClick={() => setApprovalOpen(true)} disabled={!canApprove} title={canApprove ? undefined : "Needs the RMA approval permission"}>
                    Review &amp; decide
                  </AgainDrawerButton>
                )}
                {(status === "approved" || status === "awaiting_return") && (
                  <AgainDrawerButton variant="primary" onClick={() => void run(() => changeRmaStatus(ticket.id, "received", "Unit received into the RMA store"), "Unit received")}>
                    Mark received
                  </AgainDrawerButton>
                )}
                {inHouse && (
                  <AgainDrawerButton variant="primary" onClick={() => setInspectOpen(true)}>
                    Inspect
                  </AgainDrawerButton>
                )}
                <AgainDrawerButton onClick={() => void printReceipt()} disabled={(ticket.receipt_print_count ?? 0) > 0 && !canReprint} title={(ticket.receipt_print_count ?? 0) > 0 && !canReprint ? "Reprinting needs the RMA reprint permission" : undefined}>
                  {(ticket.receipt_print_count ?? 0) > 0 ? "Reprint receipt" : "Print receipt"}
                </AgainDrawerButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <AgainDrawerButton>
                      More <ChevronDown className="ml-1 h-3 w-3" />
                    </AgainDrawerButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[12rem]">
                    {showClaimTab && <DropdownMenuItem onClick={() => setTab("claim")}>Supplier claim…</DropdownMenuItem>}
                    {showDeliveryTab && <DropdownMenuItem onClick={() => setTab("delivery")}>Delivery &amp; settlement…</DropdownMenuItem>}
                    <DropdownMenuItem onClick={() => setResolveOpen(true)}>Resolution</DropdownMenuItem>
                    {inHouse && !ticket.service_job_id && <DropdownMenuItem onClick={() => setServiceOpen(true)}>Create service job</DropdownMenuItem>}
                    {ticket.service_job_id && <DropdownMenuItem onClick={() => router.push(`/service/jobs?job=${ticket.service_job_id}`)}>Open job card</DropdownMenuItem>}
                    {ticket.order_id && !ticket.refund_id && canRecordSettlement && <DropdownMenuItem onClick={() => setRefundOpen(true)}>Refund</DropdownMenuItem>}
                    {canStockAdjust && <DropdownMenuItem onClick={() => setReplaceOpen(true)}>Replacement</DropdownMenuItem>}
                    {canStockAdjust && ticket.item_id && <DropdownMenuItem onClick={() => setRestockOpen(true)}>Restock</DropdownMenuItem>}
                    {canStockAdjust && <DropdownMenuItem onClick={() => void run(() => scrapRmaTicket(ticket.id), "Unit marked scrap")}>Scrap</DropdownMenuItem>}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setStatusOpen(true)}>Move on…</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )
          ) : ticket ? (
            <AgainDrawerButton onClick={() => void printReceipt()} disabled={(ticket.receipt_print_count ?? 0) > 0 && !canReprint}>
              {(ticket.receipt_print_count ?? 0) > 0 ? "Reprint receipt" : "Print receipt"}
            </AgainDrawerButton>
          ) : null}
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS} scrollRef={scrollRef}>
          {!ticket || !form ? (
            <div className="space-y-3" aria-hidden>
              <div className="fb-shimmer h-8 w-56 rounded" />
              <div className="fb-shimmer h-8 w-full rounded" />
              <div className="fb-shimmer h-40 w-full rounded" />
            </div>
          ) : (
            <div className="@container space-y-4">
              {/* header: number, customer, product / serial, stage, stock state */}
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={cn(AGAIN_FORM_RECORD_TITLE_CLASS, "font-mono")}>{ticket.rma_number}</h2>
                  <Badge variant="outline" className={cn("rounded-none text-[10px]", RMA_STATUS_TONE[ticket.status])}>
                    {RMA_STATUS_LABEL[ticket.status]}
                  </Badge>
                  <Badge variant="outline" className={cn("rounded-none text-[10px]", WARRANTY_TONE[ticket.warranty_status])}>
                    {WARRANTY_LABEL[ticket.warranty_status]}
                  </Badge>
                  {ticket.custody_state ? (
                    <Badge variant="outline" className="rounded-none border-[#00a09d]/40 bg-[#00a09d]/10 text-[10px] text-[#00a09d]">
                      {CUSTODY_LABEL[ticket.custody_state]}
                    </Badge>
                  ) : null}
                  {(ticket.overdue_days ?? 0) > 0 ? (
                    <Badge variant="outline" className="rounded-none border-red-500/40 bg-red-500/10 text-[10px] text-red-600 dark:text-red-400">
                      {ticket.overdue_days}d overdue
                    </Badge>
                  ) : null}
                  {ticket.is_repeat ? (
                    <Badge variant="outline" className="rounded-none border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
                      Repeat · {ticket.prior_rma_count} earlier
                    </Badge>
                  ) : null}
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {ticket.customer_name}
                  {ticket.customer_phone ? ` · ${ticket.customer_phone}` : ""} · {ticket.product_name || ticket.sku}
                  {ticket.serial_number ? ` · S/N ${ticket.serial_number}` : ""}
                  {ticket.received_serial_number && ticket.received_serial_number !== ticket.serial_number ? ` → ${ticket.received_serial_number}` : ""}
                </p>
                <StageTimeline status={ticket.status} />
                {dirty ? <p className="text-[11px] text-muted-foreground">Unsaved changes</p> : null}
              </div>

              {ticket.status === "correction_requested" && ticket.complaint_decision_reason ? (
                <div className="flex items-start gap-2 border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-[12px]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600" />
                  <p>
                    <span className="font-semibold">Sent back for correction:</span> {ticket.complaint_decision_reason}. Fix it, then Send for approval.
                  </p>
                </div>
              ) : null}
              {ticket.status === "pending_approval" && !canApprove ? (
                <p className="border border-border bg-background px-3 py-2 text-[12px] text-muted-foreground">
                  Waiting for approval. Someone with the RMA approval permission reviews it next.
                </p>
              ) : null}

              <div role="tablist" aria-label="Claim sections" className="flex flex-wrap gap-1 border-b border-border/80">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "-mb-px border-b-2 px-3 py-1.5 text-[12px]",
                      tab === t.id ? "border-[#00a09d] font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "overview" && (
                <div className="space-y-4">
                  {prior.length > 0 && (
                    <div className="flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="min-w-0 flex-1 text-[11px]">
                        <p className="font-semibold text-amber-700 dark:text-amber-300">
                          Repeat RMA: {prior.length} earlier claim{prior.length === 1 ? "" : "s"} on this {ticket.serial_number ? "unit" : "product"}
                        </p>
                        <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                          {prior.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                className="flex w-full min-w-0 items-baseline gap-2 text-left hover:underline"
                                title={`Open ${p.rma_number}`}
                                onClick={() => router.push(`/inventory/rma/${p.id}`)}
                              >
                                <span className="shrink-0 font-mono">{p.rma_number}</span>
                                <span className="shrink-0 text-muted-foreground">{p.received_at?.slice(0, 10)}</span>
                                <span className="shrink-0">{RMA_STATUS_LABEL[p.status] ?? p.status}</span>
                                <span className="min-w-0 truncate text-muted-foreground">{p.fault_reported}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                  {/* the four stages at a glance: what happened, who did it, where it stands (each tab has the detail) */}
                  <Section title="Stage summary">
                    <div className="grid gap-3 @xl:grid-cols-2">
                      {(() => {
                        const claim = claims[0];
                        const receipt = receipts[0];
                        const delivery = deliveries.find((d) => d.status === "approved") ?? deliveries[0];
                        const approvedMoney = settlements.filter((st) => st.status === "approved");
                        const stageDone = (id: string) => {
                          const idx = RMA_STAGES.findIndex((s) => s.id === id);
                          const cur = RMA_STAGES.findIndex((s) => s.id === stageOfStatus(ticket.status));
                          return ticket.status === "closed" || (cur >= 0 && idx < cur);
                        };
                        const Card = ({ n, title, id, tab: goTab, children }: { n: number; title: string; id: string; tab?: Tab; children: React.ReactNode }) => (
                          <div className="min-w-0 border border-border/80 bg-background">
                            <div className="flex items-center gap-2 border-b border-border/80 bg-muted/40 px-3 py-1.5">
                              <span
                                className={cn(
                                  "flex h-4 w-4 shrink-0 items-center justify-center text-[10px] font-semibold",
                                  stageDone(id) ? "bg-[#00a09d] text-white" : stageOfStatus(ticket.status) === id ? "bg-[#00a09d]/20 text-[#00a09d]" : "bg-muted text-muted-foreground",
                                )}
                              >
                                {n}
                              </span>
                              <span className="text-[12px] font-semibold">{title}</span>
                              {goTab ? (
                                <button type="button" className="ml-auto text-[11px] text-[#00a09d] hover:underline" onClick={() => setTab(goTab)}>
                                  Open
                                </button>
                              ) : null}
                            </div>
                            <div className="px-3 py-1.5">{children}</div>
                          </div>
                        );
                        return (
                          <>
                            <Card n={1} title="Complain Receive" id="complain" tab="complaint">
                              <Fact label="Complaint" value={`${ticket.rma_number} · ${ticket.received_at.slice(0, 10)}`} />
                              <Fact label="Decision" value={ticket.complaint_decision ? `${ticket.complaint_decision === "approved" ? "Approved" : ticket.complaint_decision === "rejected" ? "Rejected" : "Sent back"}${ticket.complaint_decided_by_name ? ` by ${ticket.complaint_decided_by_name}` : ""}` : ticket.status === "draft" ? "Draft" : "Waiting for a decision"} />
                              <Fact label="Receipt" value={ticket.receipt_no} />
                              <Fact label="Fault" value={ticket.fault_reported} />
                              <Fact label="Unit" value={ticket.unit_received ? `Received${ticket.received_by ? ` by ${ticket.received_by}` : ""}` : "Not received yet"} />
                              <Fact label="Stock" value={ticket.custody_state ? CUSTODY_LABEL[ticket.custody_state] : null} />
                            </Card>

                            <Card n={2} title="Replacement Claim" id="claim" tab={claims.length > 0 || canRaiseClaim ? "claim" : undefined}>
                              {claim ? (
                                <>
                                  <Fact label="Claim" value={`${claim.claim_number} · ${CLAIM_STATUS_LABEL[claim.status]}`} />
                                  <Fact label="Supplier" value={claim.supplier_name} />
                                  <Fact label="Approved by" value={claim.decision === "approved" ? claim.decided_by_name : null} />
                                  <Fact label="Dispatched" value={claim.dispatched_at ? `${claim.dispatched_at.slice(0, 10)}${claim.dispatched_by_name ? ` by ${claim.dispatched_by_name}` : ""}` : null} />
                                  <Fact label="Courier" value={[claim.courier, claim.tracking_number].filter(Boolean).join(" · ")} />
                                  <Fact label="Expected back" value={claim.expected_return_date} />
                                </>
                              ) : (
                                <p className="py-1 text-[12px] text-muted-foreground">No supplier claim. It is only needed when the supplier has to repair or replace the unit.</p>
                              )}
                            </Card>

                            <Card n={3} title="Replacement Receive" id="replacement" tab={receipts.length > 0 ? "claim" : undefined}>
                              {receipt ? (
                                <>
                                  <Fact label="Receipt" value={`${receipt.receipt_number} · ${RECEIPT_STATUS_LABEL[receipt.status]}`} />
                                  <Fact label="Received" value={receipt.received_date ? `${receipt.received_date}${receipt.received_by ? ` by ${receipt.received_by}` : ""}` : null} />
                                  <Fact label="Serial" value={receipt.received_serial && receipt.received_serial !== receipt.sent_serial ? `${receipt.sent_serial ?? "—"} → ${receipt.received_serial}` : receipt.received_serial ?? receipt.sent_serial} />
                                  <Fact label="Outcome" value={receipt.outcome ? receipt.outcome.replace(/_/g, " ") : null} />
                                  <Fact label="Approved by" value={receipt.decision === "approved" ? receipt.decided_by_name : null} />
                                </>
                              ) : (
                                <p className="py-1 text-[12px] text-muted-foreground">Nothing received back from a supplier yet.</p>
                              )}
                            </Card>

                            <Card n={4} title="Customer Delivery" id="delivery" tab={showDeliveryTab ? "delivery" : undefined}>
                              {delivery ? (
                                <>
                                  <Fact label="Delivery" value={`${delivery.delivery_number} · ${DELIVERY_STATUS_LABEL[delivery.status]}`} />
                                  <Fact label="Handed to" value={delivery.stock_posted ? `${delivery.delivered_to ?? ticket.customer_name}${delivery.delivery_date ? ` · ${delivery.delivery_date}` : ""}` : delivery.delivered_to} />
                                  <Fact label="Serial" value={delivery.serial_delivered} />
                                  <Fact label="Approved by" value={delivery.decision === "approved" ? delivery.decided_by_name : null} />
                                </>
                              ) : (
                                <p className="py-1 text-[12px] text-muted-foreground">Not delivered yet.</p>
                              )}
                              {deliverySummary && Number(deliverySummary.total) > 0 ? (
                                <Fact label="Charges" value={`${formatCurrency(Number(deliverySummary.total))} · paid ${formatCurrency(Number(deliverySummary.paid))} · owed ${formatCurrency(Number(deliverySummary.outstanding))}`} />
                              ) : null}
                              {approvedMoney.length > 0 ? (
                                <Fact
                                  label="Settlements"
                                  value={`${approvedMoney.length} approved · in ${formatCurrency(Number(settlementSummary?.money_in ?? 0))} · out ${formatCurrency(Number(settlementSummary?.money_out ?? 0))}`}
                                />
                              ) : null}
                            </Card>
                          </>
                        );
                      })()}
                    </div>
                  </Section>
                  <div className="grid gap-x-8 gap-y-4 @xl:grid-cols-2">
                    <Section title="Unit">
                      <Fact label="SKU" value={ticket.sku} />
                      <Fact label="Product" value={ticket.product_name} />
                      <Fact label="Serial" value={ticket.serial_number} />
                      {ticket.received_serial_number && ticket.received_serial_number !== ticket.serial_number ? (
                        <Fact label="Received serial" value={ticket.received_serial_number} note="the supplier's replacement — the original serial is kept" />
                      ) : null}
                      <Fact label="Quantity" value={ticket.quantity} />
                      <Fact label="Received" value={ticket.received_at.slice(0, 10)} />
                      <Fact label="Received by" value={ticket.received_by} />
                    </Section>
                    <Section title="Customer and sale">
                      <Fact label="Customer" value={ticket.customer_name} />
                      <Fact label="Phone" value={ticket.customer_phone} />
                      <Fact label="Email" value={ticket.customer_email} />
                      <Fact label="Invoice / order" value={ticket.order_number} />
                      <Fact label="Sold on" value={ticket.purchased_at} />
                    </Section>
                    <Section title="Handling">
                      <Fact label="Assigned to" value={ticket.assigned_to} />
                      <Fact label="RMA store" value={storeName} />
                      <Fact label="Stock state" value={ticket.custody_state ? CUSTODY_LABEL[ticket.custody_state] : ticket.status === "pending_approval" || ticket.status === "draft" ? "Not stocked yet" : null} />
                      <Fact label="Promised delivery" value={ticket.promised_delivery_date} />
                      <Fact label="Priority" value={ticket.priority} />
                      {serviceJob ? (
                        <Fact
                          label="Job card"
                          value={`${serviceJob.job_number} · ${serviceJob.status.replace(/_/g, " ")}${serviceJob.technician_name ? ` · ${serviceJob.technician_name}` : ""}`}
                          note="the repair / diagnosis work for this RMA"
                        />
                      ) : null}
                      <Fact label="Charge estimate" value={Number(ticket.charge_estimate ?? 0) ? formatCurrency(Number(ticket.charge_estimate)) : "No charge"} />
                      {deliverySummary && Number(deliverySummary.total) > 0 ? (
                        <Fact
                          label="Charges"
                          value={`${formatCurrency(Number(deliverySummary.total))} · paid ${formatCurrency(Number(deliverySummary.paid))} · owed ${formatCurrency(Number(deliverySummary.outstanding))}`}
                        />
                      ) : null}
                    </Section>
                    <Section
                      title="Supplier and purchase"
                      action={
                        canOverride && !closed ? (
                          <Button variant="outline" size="sm" className="h-6 rounded-none text-[11px]" onClick={() => setSupplierOverrideOpen(true)}>
                            Override
                          </Button>
                        ) : null
                      }
                    >
                      <Fact label="Supplier" value={ticket.supplier_name} />
                      <Fact label="Purchase receipt" value={ticket.purchase_receipt_no} />
                      <Fact label="Vendor invoice" value={ticket.vendor_invoice_no} />
                      <Fact
                        label="Source"
                        value={
                          ticket.supplier_source === "traced"
                            ? "Traced from the serial"
                            : ticket.supplier_source === "manual"
                              ? "Chosen by hand"
                              : "No purchase trace found"
                        }
                        note={ticket.supplier_source === "manual" ? ticket.supplier_override_reason ?? undefined : undefined}
                      />
                    </Section>
                  </div>
                  <Section
                    title="Warranty"
                    action={
                      canWrite ? (
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="h-6 rounded-none text-[11px]" onClick={() => void run(() => recheckWarranty(ticket.id), "Warranty rechecked from the order")}>
                            Recheck
                          </Button>
                          <Button size="sm" className="h-6 rounded-none text-[11px]" disabled={!canOverride} title={canOverride ? undefined : "Overriding the warranty needs the RMA override permission"} onClick={() => setWarrantyOpen(true)}>
                            <ShieldCheck className="mr-1 h-3 w-3" /> Set by hand
                          </Button>
                        </div>
                      ) : null
                    }
                  >
                    <Fact label="Verdict" value={WARRANTY_LABEL[ticket.warranty_status]} />
                    <Fact label="Decided by" value={ticket.warranty_source === "manual" ? "An agent, by hand" : ticket.warranty_source === "serial" ? "Serial registry + product terms" : "Order + product terms"} />
                    <Fact label="Expires" value={ticket.warranty_expires_on} />
                    <Fact label="Note" value={ticket.warranty_note} />
                  </Section>
                  {ticket.complaint_decision ? (
                    <Section title="Complaint decision">
                      <Fact label="Decision" value={ticket.complaint_decision.replace("_", " ")} />
                      <Fact label="Decided by" value={ticket.complaint_decided_by_name} />
                      <Fact label="When" value={ticket.complaint_decided_at?.slice(0, 16).replace("T", " ")} />
                      <Fact label="Reason" value={ticket.complaint_decision_reason} />
                    </Section>
                  ) : null}
                </div>
              )}

              {tab === "complaint" && (
                <div className="space-y-4">
                  <Section title="Complaint">
                    <AgainFormRow label="Problem">
                      <AgainUnderlineTextarea value={form.fault_reported} onChange={(v) => patch({ fault_reported: v })} rows={2} readOnly={!canWrite || closed} />
                    </AgainFormRow>
                    <div className="grid gap-x-8 @md:grid-cols-2">
                      <AgainFormRow label="Accessories">
                        <AgainUnderlineInput value={form.accessories} onChange={(v) => patch({ accessories: v })} readOnly={!canWrite || closed} placeholder="Box, cable…" />
                      </AgainFormRow>
                      <AgainFormRow label="Condition">
                        <AgainUnderlineInput value={form.condition_notes} onChange={(v) => patch({ condition_notes: v })} readOnly={!canWrite || closed} placeholder="Scratches, dents…" />
                      </AgainFormRow>
                    </div>
                  </Section>
                  <Section title="Diagnosis and handling">
                    <label className="flex items-center gap-2 py-1 text-[13px]">
                      <input
                        type="checkbox"
                        checked={form.diagnosis_required}
                        disabled={!canWrite || closed}
                        onChange={(e) => patch({ diagnosis_required: e.target.checked })}
                        className="h-3.5 w-3.5 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                      />
                      Diagnosis report required before approval
                    </label>
                    <AgainFormRow label="Diagnosis report">
                      <AgainUnderlineTextarea value={form.diagnosis_report} onChange={(v) => patch({ diagnosis_report: v })} rows={2} readOnly={!canWrite || closed} placeholder="What the check found" />
                    </AgainFormRow>
                    <div className="grid gap-x-8 @md:grid-cols-2">
                      <AgainFormRow label="Assigned to">
                        <FilterSelect
                          value={form.assigned_to_user_id}
                          onChange={(v) => patch({ assigned_to_user_id: v })}
                          width="w-full"
                          avoidCollisions
                          ariaLabel="Assigned to"
                          disabled={!canWrite || closed}
                          placeholder="Unassigned"
                          options={users.map((u) => ({ value: u.id, label: u.name }))}
                        />
                      </AgainFormRow>
                      <AgainFormRow label="RMA store">
                        <FilterSelect
                          value={form.warehouse_id}
                          onChange={(v) => patch({ warehouse_id: v })}
                          width="w-full"
                          avoidCollisions
                          ariaLabel="RMA store"
                          disabled={!canWrite || closed || stockLocked}
                          placeholder="Choose the RMA store…"
                          options={stores.map((s) => ({ value: s.id, label: s.name }))}
                        />
                      </AgainFormRow>
                      <AgainFormRow label="Promised delivery">
                        <input
                          type="date"
                          value={form.promised_delivery_date}
                          onChange={(e) => patch({ promised_delivery_date: e.target.value })}
                          disabled={!canWrite || closed}
                          className="h-8 w-full border-0 border-b border-input bg-transparent text-[13px] outline-none disabled:opacity-70"
                        />
                      </AgainFormRow>
                      <AgainFormRow label="Charge estimate">
                        <AgainUnderlineInput value={form.charge_estimate} onChange={(v) => patch({ charge_estimate: v.replace(/[^0-9.]/g, "") })} readOnly={!canWrite || closed} placeholder="0" />
                      </AgainFormRow>
                    </div>
                    {stockLocked ? (
                      <p className="text-[11px] text-muted-foreground">The unit is already stocked in this RMA store, so the store is locked.</p>
                    ) : null}
                  </Section>

                  <div className="grid gap-x-8 gap-y-4 @xl:grid-cols-2">
                    <Section title="Inspection">
                      <Fact label="Physical" value={ticket.physical_condition} />
                      <Fact label="Functional" value={ticket.functional_result} />
                      <Fact label="QC" value={ticket.qc_result} />
                      <Fact label="Inspector" value={ticket.inspected_by} />
                      <Fact label="Notes" value={ticket.inspection_notes} />
                    </Section>
                    <Section title="Resolution">
                      <Fact label="Type" value={ticket.resolution_type ? RESOLUTION_LABEL[ticket.resolution_type] ?? ticket.resolution_type : null} />
                      <Fact label="Status" value={ticket.resolution_status} />
                      <Fact label="Refund" value={ticket.refund_id ? formatCurrency(Number(ticket.refund_amount ?? 0)) : null} />
                      <Fact label="Replacement SKU" value={ticket.replacement_sku} />
                      <Fact label="Courier" value={ticket.courier} />
                      <Fact label="Tracking" value={ticket.tracking_number} />
                    </Section>
                  </div>

                  <Section
                    title="Supplier job"
                    action={
                      canWrite && !closed ? (
                        <Button size="sm" className="h-6 rounded-none text-[11px]" onClick={() => setSupplierOpen(true)}>
                          <Factory className="mr-1 h-3 w-3" />
                          {ticket.supplier_job ? "Update" : "Send out"}
                        </Button>
                      ) : null
                    }
                  >
                    {ticket.supplier_job ? (
                      <>
                        <Fact label="Supplier" value={ticket.supplier_job.supplier_name} />
                        <Fact label="Job status" value={ticket.supplier_job.status} />
                        <Fact label="Their ref" value={ticket.supplier_job.supplier_reference} />
                        <Fact label="Dispatched" value={ticket.supplier_job.dispatched_at} />
                        <Fact label="Expected back" value={ticket.supplier_job.expected_return_date} />
                        <Fact label="Returned" value={ticket.supplier_job.returned_at} />
                      </>
                    ) : (
                      <p className="py-2 text-[12px] text-muted-foreground">Not sent to a supplier yet.</p>
                    )}
                  </Section>

                  <Section
                    title={`Charges · ${formatCurrency(Number(ticket.total))}${billed ? " · billed" : ""}`}
                    action={
                      canWrite && !billed && !closed ? (
                        <div className="flex gap-1">
                          <Button size="sm" className="h-6 rounded-none text-[11px]" onClick={() => setChargeOpen(true)}>
                            <Plus className="mr-1 h-3 w-3" /> Add charge
                          </Button>
                          {Number(ticket.total) > 0 && (
                            <Button size="sm" variant="outline" className="h-6 rounded-none text-[11px]" onClick={() => setBillOpen(true)}>
                              Bill customer
                            </Button>
                          )}
                        </div>
                      ) : null
                    }
                  >
                    {ticket.charges.length === 0 ? (
                      <p className="py-2 text-[12px] text-muted-foreground">No parts or labour recorded yet.</p>
                    ) : (
                      <div className="overflow-x-auto bg-background">
                        <table className="w-full min-w-[520px] border-collapse text-[12px]">
                          <thead className="text-left text-muted-foreground">
                            <tr className="border-b border-border">
                              <th className="px-2 py-1.5 font-medium">Type</th>
                              <th className="px-2 py-1.5 font-medium">Description</th>
                              <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                              <th className="px-2 py-1.5 text-right font-medium">Unit</th>
                              <th className="px-2 py-1.5 text-right font-medium">Total</th>
                              <th className="w-8 px-2 py-1.5" />
                            </tr>
                          </thead>
                          <tbody>
                            {ticket.charges.map((c) => (
                              <tr key={c.id} className="border-b border-border/60">
                                <td className="px-2 py-1.5 capitalize">{c.kind}</td>
                                <td className="px-2 py-1.5">{c.description}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{Number(c.quantity)}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(Number(c.unit_price))}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(Number(c.line_total))}</td>
                                <td className="px-2 py-1.5 text-right">
                                  {canWrite && !billed && (
                                    <button
                                      type="button"
                                      aria-label="Remove charge"
                                      className="text-muted-foreground hover:text-destructive"
                                      onClick={() => void run(() => removeRmaCharge(ticket.id, c.id), "Charge removed")}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Section>
                </div>
              )}

              {tab === "claim" && (
                <Section title="Supplier claims">
                  {claims.length === 0 ? (
                    <p className="py-2 text-[12px] text-muted-foreground">
                      No claim yet. A supplier claim sends this unit from the RMA store to the supplier: create it, get it approved, then dispatch.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/60 bg-background">
                      {claims.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-[12px] hover:bg-muted/40"
                            onClick={() => {
                              setClaimOpenId(c.id);
                              setClaimDrawerOpen(true);
                            }}
                          >
                            <span className="font-mono font-medium">{c.claim_number}</span>
                            <Badge variant="outline" className={cn("rounded-none text-[10px]", CLAIM_STATUS_TONE[c.status])}>
                              {CLAIM_STATUS_LABEL[c.status]}
                            </Badge>
                            <span className="text-muted-foreground">{c.supplier_name}</span>
                            {c.supplier_reference ? <span className="text-muted-foreground">· ref {c.supplier_reference}</span> : null}
                            {c.dispatch_date ? <span className="ml-auto text-muted-foreground">dispatched {c.dispatch_date}</span> : null}
                          </button>
                          {c.status === "dispatched" ? (
                            <div className="border-t border-dashed border-border/60 bg-muted/20 px-3 py-2">
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Replacement receipt</p>
                              {receipts.filter((r) => r.claim_id === c.id).length === 0 ? (
                                <p className="text-[12px] text-muted-foreground">Nothing received back from {c.supplier_name} yet.</p>
                              ) : (
                                <ul className="space-y-1">
                                  {receipts
                                    .filter((r) => r.claim_id === c.id)
                                    .map((r) => (
                                      <li key={r.id}>
                                        <button
                                          type="button"
                                          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left text-[12px] hover:underline"
                                          onClick={() => {
                                            setReceiptOpenId(r.id);
                                            setReceiptDrawerOpen(true);
                                          }}
                                        >
                                          <span className="font-mono font-medium">{r.receipt_number}</span>
                                          <Badge variant="outline" className={cn("rounded-none text-[10px]", RECEIPT_STATUS_TONE[r.status])}>
                                            {RECEIPT_STATUS_LABEL[r.status]}
                                          </Badge>
                                          <span className="text-muted-foreground">{RECEIPT_OUTCOME_LABEL[r.outcome]}</span>
                                          {r.received_serial && r.received_serial !== r.sent_serial ? (
                                            <span className="text-muted-foreground">
                                              · {r.sent_serial} → {r.received_serial}
                                            </span>
                                          ) : null}
                                        </button>
                                      </li>
                                    ))}
                                </ul>
                              )}
                              {canWrite &&
                              ticket.custody_state === "with_supplier" &&
                              !receipts.some((r) => r.claim_id === c.id && ["draft", "pending_approval", "correction_requested", "approved"].includes(r.status)) ? (
                                <AgainDrawerButton
                                  className="mt-2"
                                  variant="primary"
                                  disabled={creatingReceipt === c.id}
                                  onClick={() => {
                                    setCreatingReceipt(c.id);
                                    void createRmaReceipt(c.id)
                                      .then((created) => {
                                        toast.success(`${created.receipt_number} created`);
                                        setReceiptOpenId(created.id);
                                        setReceiptDrawerOpen(true);
                                        refresh();
                                      })
                                      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not create the receipt"))
                                      .finally(() => setCreatingReceipt(null));
                                  }}
                                >
                                  {creatingReceipt === c.id ? "Creating…" : "Receive from supplier"}
                                </AgainDrawerButton>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canRaiseClaim && canWrite ? (
                    <div className="mt-3 space-y-2">
                      {!ticket.supplier_id ? (
                        canOverride ? (
                          <div className="border border-border bg-background px-3 py-2">
                            <p className="mb-1 text-[12px] text-muted-foreground">
                              The purchase trace found no supplier for this unit, so you choose it by hand (the reason is kept in the activity log).
                            </p>
                            <AgainFormRow label="Supplier">
                              <FilterSelect
                                value={claimSupplierId}
                                onChange={setClaimSupplierId}
                                width="w-full"
                                avoidCollisions
                                ariaLabel="Supplier"
                                placeholder="Choose a supplier…"
                                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                              />
                            </AgainFormRow>
                            <AgainFormRow label="Reason">
                              <AgainUnderlineInput value={claimReason} onChange={setClaimReason} placeholder="Why it is chosen by hand" />
                            </AgainFormRow>
                          </div>
                        ) : (
                          <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px]">
                            The purchase trace found no supplier for this unit. Someone with the RMA override permission has to choose it before a claim can be raised.
                          </p>
                        )
                      ) : null}
                      <AgainDrawerButton
                        variant="primary"
                        disabled={creatingClaim || (!ticket.supplier_id && (!canOverride || !claimSupplierId || !claimReason.trim()))}
                        onClick={() => {
                          setCreatingClaim(true);
                          void createRmaClaim(ticket.id, ticket.supplier_id ? {} : { supplier_id: claimSupplierId, override_reason: claimReason.trim() })
                            .then((created) => {
                              toast.success(`${created.claim_number} created`);
                              setClaimOpenId(created.id);
                              setClaimDrawerOpen(true);
                              refresh();
                            })
                            .catch((err) => toast.error(err instanceof Error ? err.message : "Could not create the claim"))
                            .finally(() => setCreatingClaim(false));
                        }}
                      >
                        {creatingClaim ? "Creating…" : "Create supplier claim"}
                      </AgainDrawerButton>
                    </div>
                  ) : null}
                </Section>
              )}

              {tab === "delivery" && (
                <>
                  <Section title="Customer delivery">
                    {deliverySummary ? (
                      <div className="mb-3 grid gap-x-6 gap-y-1 text-[13px] @md:grid-cols-4">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Charges</p>
                          <p className="font-medium tabular-nums">{formatCurrency(Number(deliverySummary.total))}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Paid</p>
                          <p className="font-medium tabular-nums">{formatCurrency(Number(deliverySummary.paid))}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Owed</p>
                          <p className="font-medium tabular-nums">{formatCurrency(Number(deliverySummary.outstanding))}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Unit</p>
                          <p className="font-medium">{ticket.custody_state ? CUSTODY_LABEL[ticket.custody_state] : "Not stocked"}</p>
                        </div>
                      </div>
                    ) : null}
                    {deliveries.length === 0 ? (
                      <p className="py-2 text-[12px] text-muted-foreground">
                        No delivery yet. A delivery hands the unit back to the customer; it does not take money (use the settlement below). Nothing is posted until it is approved.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/60 bg-background">
                        {deliveries.map((d) => (
                          <li key={d.id}>
                            <button
                              type="button"
                              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-[12px] hover:bg-muted/40"
                              onClick={() => {
                                setDeliveryOpenId(d.id);
                                setDeliveryDrawerOpen(true);
                              }}
                            >
                              <span className="font-mono font-medium">{d.delivery_number}</span>
                              <Badge variant="outline" className={cn("rounded-none text-[10px]", DELIVERY_STATUS_TONE[d.status])}>
                                {DELIVERY_STATUS_LABEL[d.status]}
                              </Badge>
                              {d.delivered_to ? <span className="text-muted-foreground">to {d.delivered_to}</span> : null}
                              {d.payment_number ? <span className="text-muted-foreground">· payment {d.payment_number}</span> : null}
                              {d.stock_posted ? <span className="ml-auto text-muted-foreground">handed over</span> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {canStartDelivery ? (
                      <AgainDrawerButton
                        className="mt-3"
                        variant="primary"
                        disabled={creatingDelivery}
                        onClick={() => {
                          setCreatingDelivery(true);
                          void createRmaDelivery(ticket.id)
                            .then((created) => {
                              toast.success(`${created.delivery_number} created`);
                              setDeliveryOpenId(created.id);
                              setDeliveryDrawerOpen(true);
                              refresh();
                            })
                            .catch((err) => toast.error(err instanceof Error ? err.message : "Could not create the delivery"))
                            .finally(() => setCreatingDelivery(false));
                        }}
                      >
                        {creatingDelivery ? "Creating…" : "New delivery"}
                      </AgainDrawerButton>
                    ) : openDeliveryDoc ? (
                      <p className="mt-2 text-[12px] text-muted-foreground">{openDeliveryDoc.delivery_number} is still open — finish or cancel it before starting another.</p>
                    ) : deliverySummary && !deliverySummary.can_deliver_product && deliverySummary.deliver_blocker && !closed ? (
                      <p className="mt-2 text-[12px] text-muted-foreground">Nothing to deliver yet: {deliverySummary.deliver_blocker}</p>
                    ) : null}
                  </Section>

                  <Section title="Settlement (money in / money out)">
                    {settlementSummary ? (
                      <div className="mb-3 grid gap-x-6 gap-y-1 text-[13px] @md:grid-cols-4">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Money in (+)</p>
                          <p className="font-medium tabular-nums">{formatCurrency(Number(settlementSummary.money_in))}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Money out (-)</p>
                          <p className="font-medium tabular-nums">{formatCurrency(Number(settlementSummary.money_out))}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Net</p>
                          <p className="font-medium tabular-nums">{formatCurrency(Number(settlementSummary.net))}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">RMA charges owed</p>
                          <p className="font-medium tabular-nums">{formatCurrency(Number(settlementSummary.outstanding))}</p>
                        </div>
                      </div>
                    ) : null}
                    {settlements.length === 0 ? (
                      <p className="py-2 text-[12px] text-muted-foreground">
                        No settlement yet. Record money received from, or paid to, a customer, dealer, supplier or other party for this RMA. Nothing reaches the accounts until it is approved.
                      </p>
                    ) : (
                      <div className="overflow-x-auto bg-background">
                        <table className="w-full min-w-[640px] text-left text-[12px]">
                          <thead className="border-b border-border/80 text-[11px] uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-3 py-1.5 font-medium">Date</th>
                              <th className="px-3 py-1.5 font-medium">Party</th>
                              <th className="px-3 py-1.5 font-medium">Direction</th>
                              <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                              <th className="px-3 py-1.5 font-medium">Purpose</th>
                              <th className="px-3 py-1.5 font-medium">Status</th>
                              <th className="px-3 py-1.5 font-medium">Finance record</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {settlements.map((st) => (
                              <tr
                                key={st.id}
                                tabIndex={0}
                                role="button"
                                className="cursor-pointer align-top hover:bg-muted/40"
                                onClick={() => {
                                  setSettlementOpenId(st.id);
                                  setSettlementDrawerOpen(true);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    setSettlementOpenId(st.id);
                                    setSettlementDrawerOpen(true);
                                  }
                                }}
                              >
                                <td className="whitespace-nowrap px-3 py-1.5">{st.transaction_date ?? st.created_at.slice(0, 10)}</td>
                                <td className="px-3 py-1.5">
                                  <span className="block max-w-[160px] truncate">{st.party_name}</span>
                                  <span className="text-[11px] text-muted-foreground">{PARTY_TYPE_LABEL[st.party_type]}</span>
                                </td>
                                <td className={cn("whitespace-nowrap px-3 py-1.5", st.direction === "out" ? "text-red-600 dark:text-red-400" : "text-[#00a09d]")}>
                                  {DIRECTION_LABEL[st.direction]}
                                </td>
                                <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums">{formatCurrency(Number(st.amount))}</td>
                                <td className="px-3 py-1.5">
                                  <span className="block">
                                    {PURPOSE_LABEL[st.purpose]}
                                    {st.reverses_id ? <span className="ml-1.5 border border-sky-500/40 bg-sky-500/10 px-1 text-[10px] text-sky-700 dark:text-sky-300">Reversal</span> : null}
                                    {st.reversed_by_id ? <span className="ml-1.5 border border-muted-foreground/40 bg-muted px-1 text-[10px] text-muted-foreground">Reversed</span> : null}
                                  </span>
                                  {st.purpose_note ? (
                                    <span className="block max-w-[200px] truncate text-[11px] text-muted-foreground" title={st.purpose_note}>
                                      {st.purpose_note}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-3 py-1.5">
                                  <Badge variant="outline" className={cn("rounded-none text-[10px]", SETTLEMENT_STATUS_TONE[st.status])}>
                                    {SETTLEMENT_STATUS_LABEL[st.status]}
                                  </Badge>
                                </td>
                                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                                  {st.payment_number ?? "—"}
                                  {st.receivable_number ? <span className="block">{st.receivable_number}</span> : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {canStartSettlement ? (
                      <AgainDrawerButton
                        className="mt-3"
                        variant="primary"
                        onClick={() => {
                          setSettlementOpenId(null);
                          setSettlementDrawerOpen(true);
                        }}
                      >
                        New settlement
                      </AgainDrawerButton>
                    ) : settlementSummary && !settlementSummary.can_settle && settlementSummary.blocker ? (
                      <p className="mt-2 text-[12px] text-muted-foreground">{settlementSummary.blocker}</p>
                    ) : null}
                  </Section>
                </>
              )}

              {tab === "stock" && (
                <Section title="Stock movements">
                  <p className="mb-2 text-[12px] text-muted-foreground">
                    Current state: <span className="font-medium text-foreground">{ticket.custody_state ? CUSTODY_LABEL[ticket.custody_state] : "Not stocked"}</span>. Pending steps are
                    not counted as stock until they are approved.
                  </p>
                  {events.length === 0 ? (
                    <p className="py-2 text-[12px] text-muted-foreground">No stock has been posted for this claim yet. Approving the complaint stocks the unit into the RMA store.</p>
                  ) : (
                    <div className="overflow-x-auto bg-background">
                      <table className="w-full min-w-[520px] border-collapse text-[12px]">
                        <thead className="text-left text-muted-foreground">
                          <tr className="border-b border-border">
                            <th className="px-2 py-1.5 font-medium">Step</th>
                            <th className="px-2 py-1.5 font-medium">Where</th>
                            <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                            <th className="px-2 py-1.5 font-medium">When</th>
                            <th className="px-2 py-1.5 font-medium">State</th>
                          </tr>
                        </thead>
                        <tbody>
                          {events.map((e) => (
                            <tr key={e.id} className="border-b border-border/60">
                              <td className="px-2 py-1.5">{STOCK_STEP_LABEL[e.event_key] ?? e.event_key}</td>
                              <td className="px-2 py-1.5">{e.to_warehouse ? `${e.warehouse ?? "—"} → ${e.to_warehouse}` : (e.warehouse ?? "—")}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{e.quantity}</td>
                              <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{e.created_at.slice(0, 16).replace("T", " ")}</td>
                              <td className="px-2 py-1.5">{e.reversed ? <Badge variant="outline" className="rounded-none text-[10px]">Reversed</Badge> : (e.state ?? "Posted")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
              )}

              {tab === "files" && (
                <Section
                  title="Attachments"
                  action={
                    canWrite ? (
                      <label className={cn("inline-flex h-6 cursor-pointer items-center border border-border/80 bg-muted/50 px-2 text-[11px] hover:bg-muted", uploading && "opacity-60")}>
                        <Paperclip className="mr-1 h-3 w-3" />
                        {uploading ? "Uploading…" : "Attach file"}
                        <input type="file" className="hidden" disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                    ) : null
                  }
                >
                  {files.length === 0 ? (
                    <p className="py-2 text-[12px] text-muted-foreground">No files yet. Attach photos of the unit, the diagnosis report or the customer’s paperwork.</p>
                  ) : (
                    <ul className="divide-y divide-border/60 bg-background">
                      {files.map((f) => (
                        <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                          <a href={f.storage_ref} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[#00a09d] hover:underline">
                            {f.filename}
                          </a>
                          <span className="shrink-0 text-muted-foreground">{Math.max(1, Math.round(f.size_bytes / 1024))} KB</span>
                          {canWrite && (
                            <button
                              type="button"
                              aria-label="Remove file"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => void deleteCollabFile("rma", ticket.id, f.id).then(loadFiles).catch((err) => toast.error(err instanceof Error ? err.message : "Could not remove the file"))}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}

              {tab === "activity" && (
                <div className="space-y-4">
                  <Section title="Activity">
                    {activity.length === 0 ? (
                      <p className="py-2 text-[12px] text-muted-foreground">No activity recorded yet.</p>
                    ) : (
                      <ol className="space-y-1.5 py-1">
                        {activity.map((a) => (
                          <li key={a.id} className="flex gap-3 text-[12px]">
                            <span className="w-[8.5rem] shrink-0 tabular-nums text-muted-foreground">{a.created_at.slice(0, 16).replace("T", " ")}</span>
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">{ACTIVITY_LABEL[a.action] ?? a.action.replace(/_/g, " ")}</span>
                              {a.action === "status_changed" && a.old_value && a.new_value ? (
                                <span className="ml-2 text-muted-foreground">
                                  {RMA_STATUS_LABEL[a.old_value as keyof typeof RMA_STATUS_LABEL] ?? a.old_value} → {RMA_STATUS_LABEL[a.new_value as keyof typeof RMA_STATUS_LABEL] ?? a.new_value}
                                </span>
                              ) : a.new_value ? (
                                <span className="ml-2 text-muted-foreground">{a.new_value}</span>
                              ) : null}
                              {typeof a.details?.reason === "string" && a.details.reason ? <span className="ml-2 text-muted-foreground">— {a.details.reason}</span> : null}
                              {a.performed_by_name ? <span className="ml-2 text-[11px] text-muted-foreground">by {a.performed_by_name}</span> : null}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </Section>
                  <Section title="Status history">
                    {history.length === 0 ? (
                      <p className="py-2 text-[12px] text-muted-foreground">No stage changes recorded.</p>
                    ) : (
                      <ol className="space-y-1.5 py-1">
                        {history.map((h) => (
                          <li key={h.id} className="flex gap-3 text-[12px]">
                            <span className="w-[8.5rem] shrink-0 tabular-nums text-muted-foreground">{h.created_at.slice(0, 16).replace("T", " ")}</span>
                            <span className="min-w-0 flex-1">
                              <span className="text-muted-foreground">{h.from_status ? RMA_STATUS_LABEL[h.from_status as keyof typeof RMA_STATUS_LABEL] : "Opened"} → </span>
                              <span className="font-medium">{RMA_STATUS_LABEL[h.to_status as keyof typeof RMA_STATUS_LABEL] ?? h.to_status}</span>
                              {h.note ? <span className="ml-2 text-muted-foreground">{h.note}</span> : null}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </Section>
                </div>
              )}
            </div>
          )}
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>

      {ticket ? (
        <>
          <RmaSettlementDrawer key={`settlement:${settlementOpenId}:${settlementDrawerOpen}`} open={settlementDrawerOpen} onOpenChange={setSettlementDrawerOpen} settlementId={settlementOpenId} ticket={ticket} onDone={refresh} />
          <RmaDeliveryDrawer key={`delivery:${deliveryOpenId}:${deliveryDrawerOpen}`} open={deliveryDrawerOpen} onOpenChange={setDeliveryDrawerOpen} deliveryId={deliveryOpenId} ticket={ticket} onDone={refresh} />
          <RmaReceiptDrawer key={`receipt:${receiptOpenId}:${receiptDrawerOpen}`} open={receiptDrawerOpen} onOpenChange={setReceiptDrawerOpen} receiptId={receiptOpenId} ticket={ticket} onDone={refresh} />
          <RmaSupplierClaimDrawer key={`claim:${claimOpenId}:${claimDrawerOpen}`} open={claimDrawerOpen} onOpenChange={setClaimDrawerOpen} claimId={claimOpenId} ticket={ticket} onDone={refresh} />
          <RmaApprovalDrawer key={`approval:${approvalOpen}:${ticket.status}`} open={approvalOpen} onOpenChange={setApprovalOpen} ticket={ticket} onDone={refresh} />
          <RmaSupplierOverrideDrawer key={`supplier-override:${supplierOverrideOpen}`} open={supplierOverrideOpen} onOpenChange={setSupplierOverrideOpen} ticket={ticket} onDone={refresh} />
          <StatusDrawer key={`status:${statusOpen}:${ticket.status}`} open={statusOpen} onOpenChange={setStatusOpen} ticket={ticket} onDone={refresh} />
          <WarrantyDrawer key={`warranty:${warrantyOpen}`} open={warrantyOpen} onOpenChange={setWarrantyOpen} ticket={ticket} onDone={refresh} />
          <ChargeDrawer key={`charge:${chargeOpen}`} open={chargeOpen} onOpenChange={setChargeOpen} ticket={ticket} onDone={refresh} />
          <SupplierJobDrawer key={`supplier:${supplierOpen}`} open={supplierOpen} onOpenChange={setSupplierOpen} ticket={ticket} onDone={refresh} />
          <BillDrawer key={`bill:${billOpen}`} open={billOpen} onOpenChange={setBillOpen} ticket={ticket} onDone={refresh} />
          <InspectionDrawer key={`inspect:${inspectOpen}`} open={inspectOpen} onOpenChange={setInspectOpen} ticket={ticket} onDone={refresh} />
          <ResolveDrawer key={`resolve:${resolveOpen}`} open={resolveOpen} onOpenChange={setResolveOpen} ticket={ticket} onDone={refresh} />
          <ServiceFromRmaDrawer key={`service:${serviceOpen}`} open={serviceOpen} onOpenChange={setServiceOpen} ticket={ticket} onDone={refresh} />
          <RefundDrawer key={`refund:${refundOpen}`} open={refundOpen} onOpenChange={setRefundOpen} ticket={ticket} onDone={refresh} />
          <ReplacementDrawer key={`replace:${replaceOpen}`} open={replaceOpen} onOpenChange={setReplaceOpen} ticket={ticket} onDone={refresh} />
          <RestockDrawer key={`restock:${restockOpen}`} open={restockOpen} onOpenChange={setRestockOpen} ticket={ticket} onDone={refresh} />
        </>
      ) : null}
    </AgainDrawerPanel>
  );
}
