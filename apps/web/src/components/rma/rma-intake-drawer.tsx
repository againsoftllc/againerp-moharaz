"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/shared/filter-select";
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
  createRmaTicket,
  fetchPriorRmas,
  fetchRmaReasons,
  fetchRmaStores,
  searchRmaOrders,
  submitRmaForApproval,
  traceRmaSerial,
  RMA_STATUS_LABEL,
  WARRANTY_LABEL,
  WARRANTY_TONE,
  type OrderSearchHit,
  type OrderSearchLine,
  type RmaPrior,
  type RmaReason,
  type RmaStore,
  type RmaTrace,
} from "@/lib/api/rma";
import { fetchAuthUsers } from "@/lib/api/auth-users";
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import { usePermission } from "@/lib/auth/permissions";
import { openRmaReceipt } from "@/lib/rma/rma-print";
import { lookupSerial, type SerialLookupResponse } from "@/lib/api/inventory-serials";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { cn } from "@/lib/utils";

const MATCH_BY_LABEL: Record<string, string> = {
  invoice: "Invoice",
  order_number: "Order",
  phone: "Phone",
  serial: "Serial",
};

type Form = {
  query: string;
  orderNumber: string;
  sku: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  productName: string;
  serial: string;
  fault: string;
  accessories: string;
  condition: string;
  receivedBy: string;
  priority: string;
  reasonId: string;
  rmaType: string;
  assignedUserId: string;
  storeId: string;
  promisedDate: string;
  chargeEstimate: string;
  diagnosisRequired: boolean;
  diagnosisReport: string;
  supplierId: string;
  supplierReason: string;
  remote: boolean;
};

const EMPTY: Form = {
  query: "",
  orderNumber: "",
  sku: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  productName: "",
  serial: "",
  fault: "",
  accessories: "",
  condition: "",
  receivedBy: "",
  priority: "normal",
  reasonId: "",
  rmaType: "customer",
  assignedUserId: "",
  storeId: "",
  promisedDate: "",
  chargeEstimate: "",
  diagnosisRequired: false,
  diagnosisReport: "",
  supplierId: "",
  supplierReason: "",
  remote: false,
};

type DraftValues = {
  form: Form;
  selectedOrder: OrderSearchHit | null;
  selectedLineIds: string[];
  showAdvanced: boolean;
  scrollTop: number;
};

function pickDefaultLines(hit: OrderSearchHit): OrderSearchLine[] {
  if (hit.matched_serial) {
    const matched = hit.lines.filter((line) => line.serial_numbers.includes(hit.matched_serial!));
    if (matched.length) return matched;
  }
  if (hit.lines.length === 1) return hit.lines;
  return [];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function WarrantyBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("rounded-none text-[10px]", WARRANTY_TONE[status as keyof typeof WARRANTY_TONE])}>
      {WARRANTY_LABEL[status as keyof typeof WARRANTY_LABEL] ?? status}
    </Badge>
  );
}

/**
 * Intake for a warranty claim, in the common drawer (docs/common/drawercommon.md): Open claim / Cancel on top, drag the left
 * edge to resize, and a half-typed claim is kept as a draft when the drawer is closed by accident. Looking the order up first
 * fills the customer in and tells you whether the unit is still covered before you accept it.
 */
export function RmaIntakeDrawer({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [hits, setHits] = useState<OrderSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderSearchHit | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [serialLookup, setSerialLookup] = useState<SerialLookupResponse | null>(null);
  const [checkingSerial, setCheckingSerial] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reasons, setReasons] = useState<RmaReason[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stores, setStores] = useState<RmaStore[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [trace, setTrace] = useState<RmaTrace | null>(null);
  const [prior, setPrior] = useState<RmaPrior[]>([]);
  const [overrideSupplier, setOverrideSupplier] = useState(false);
  const canOverride = usePermission("rma_override", "write");
  const { suppliers } = useCommerceSuppliers();
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<number | null>(null);
  const patch = (changes: Partial<Form>) => setForm((current) => ({ ...current, ...changes }));

  // a fresh form every time it opens — declared before the draft hook so a saved draft is put back after this reset
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setHits([]);
    setSearchOpen(false);
    setSelectedOrder(null);
    setSelectedLineIds([]);
    setSerialLookup(null);
    setShowAdvanced(false);
    setTrace(null);
    setPrior([]);
    setOverrideSupplier(false);
    let cancelled = false;
    void fetchRmaReasons()
      .then((rows) => !cancelled && setReasons(rows))
      .catch(() => !cancelled && setReasons([]));
    void fetchRmaStores()
      .then((rows) => {
        if (cancelled) return;
        setStores(rows);
        // the receiving store defaults to the only (or first) RMA store
        setForm((current) => (current.storeId || !rows.length ? current : { ...current, storeId: rows[0].id }));
      })
      .catch(() => !cancelled && setStores([]));
    void fetchAuthUsers()
      .then((rows) => !cancelled && setUsers(rows.map((u) => ({ id: u.id, name: u.name || u.username }))))
      .catch(() => !cancelled && setUsers([]));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // the receiving store is pre-selected on open, so it alone does not count as something typed
  const dirty = selectedOrder !== null || JSON.stringify({ ...form, storeId: "" }) !== JSON.stringify({ ...EMPTY, storeId: "" });
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<DraftValues>({
    key: "rma:new",
    ready: open,
    dirty,
    getValues: () => ({ form, selectedOrder, selectedLineIds, showAdvanced, scrollTop: scrollRef.current?.scrollTop ?? 0 }),
    restore: (values) => {
      setForm({ ...EMPTY, ...values.form });
      setSelectedOrder(values.selectedOrder ?? null);
      setSelectedLineIds(values.selectedLineIds ?? []);
      setShowAdvanced(Boolean(values.showAdvanced));
      pendingScroll.current = values.scrollTop;
    },
    onDiscard: () => {
      setForm(EMPTY);
      setSelectedOrder(null);
      setSelectedLineIds([]);
    },
    label: "RMA",
  });

  // put the scroll position back after a draft is restored
  useEffect(() => {
    if (pendingScroll.current == null) return;
    const top = pendingScroll.current;
    pendingScroll.current = null;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top }));
  }, [form]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!searchBoxRef.current?.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // supplier / purchase invoice and earlier claims, resolved from the serial as it is typed
  useEffect(() => {
    const serialNo = form.serial.trim();
    if (serialNo.length < 3) {
      setTrace(null);
      setPrior([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void traceRmaSerial(serialNo)
        .then((row) => !cancelled && setTrace(row))
        .catch(() => !cancelled && setTrace(null));
      void fetchPriorRmas({ serial: serialNo })
        .then((rows) => !cancelled && setPrior(rows))
        .catch(() => !cancelled && setPrior([]));
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.serial]);

  useEffect(() => {
    const q = form.query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    if (selectedOrder && q === selectedOrder.order_number) {
      setHits([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchRmaOrders(q)
        .then((rows) => {
          if (seq !== searchSeq.current) return;
          setHits(rows);
          setSearchOpen(true);
        })
        .catch((err) => {
          if (seq !== searchSeq.current) return;
          setHits([]);
          toast.error(err instanceof Error ? err.message : "Order search failed");
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false);
        });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [form.query, selectedOrder]);

  const selectedLines = useMemo(
    () => (selectedOrder?.lines ?? []).filter((line) => selectedLineIds.includes(line.id)),
    [selectedOrder, selectedLineIds],
  );

  // every dismissal (outside click, Esc, the X) goes through here and keeps what was typed
  const handleOpenChange = (next: boolean) => {
    if (!next) saveDraftIfDirty();
    onOpenChange(next);
  };

  const cancel = () => {
    clearDraft();
    onOpenChange(false);
  };

  const applyOrder = (hit: OrderSearchHit) => {
    setSelectedOrder(hit);
    setHits([]);
    setSearchOpen(false);
    const preselected = pickDefaultLines(hit);
    setSelectedLineIds(preselected.map((line) => line.id));
    const changes: Partial<Form> = {
      orderNumber: hit.order_number,
      query: hit.order_number,
      customerName: hit.customer_name ?? "",
      customerPhone: hit.customer_phone ?? "",
      customerEmail: hit.customer_email ?? "",
    };
    const first = preselected[0];
    if (first) {
      changes.sku = first.sku;
      changes.productName = first.name;
      const serialToUse =
        hit.matched_serial && first.serial_numbers.includes(hit.matched_serial)
          ? hit.matched_serial
          : first.serial_numbers.length === 1
            ? first.serial_numbers[0]
            : "";
      if (serialToUse) changes.serial = serialToUse;
    } else {
      changes.sku = "";
      changes.productName = "";
    }
    patch(changes);
  };

  const toggleLine = (line: OrderSearchLine) => {
    const next = selectedLineIds.includes(line.id)
      ? selectedLineIds.filter((id) => id !== line.id)
      : [...selectedLineIds, line.id];
    setSelectedLineIds(next);
    const remaining = (selectedOrder?.lines ?? []).filter((row) => next.includes(row.id));
    if (remaining.length === 1) {
      patch({
        sku: remaining[0].sku,
        productName: remaining[0].name,
        ...(remaining[0].serial_numbers.length === 1 ? { serial: remaining[0].serial_numbers[0] } : {}),
      });
    } else if (remaining.length === 0) {
      patch({ sku: "", productName: "" });
    }
  };

  /**
   * Serial-first lookup: an order number is not required when the serial
   * itself is registered — the registry knows the sale.
   */
  const runSerialLookup = async () => {
    if (!form.serial.trim()) return;
    setCheckingSerial(true);
    try {
      const res = await lookupSerial(form.serial.trim());
      setSerialLookup(res);
      if (!res.data) {
        toast.message(`${form.serial.trim()} is not in the registry — proceeding as unregistered.`);
        return;
      }
      if (res.open_rma_number) return; // shown as a blocking banner below

      if (res.data.order_number) {
        patch({ query: res.data.order_number });
        try {
          const rows = await searchRmaOrders(res.data.order_number);
          const match = rows.find((row) => row.order_number === res.data?.order_number) ?? rows[0];
          if (match) applyOrder(match);
        } catch {
          patch({ orderNumber: res.data.order_number });
        }
      }
      setForm((current) => ({
        ...current,
        sku: !current.sku.trim() && res.data?.sku ? res.data.sku : current.sku,
        productName: !current.productName.trim() && res.data?.product_name ? res.data.product_name : current.productName,
        customerName: !current.customerName.trim() && res.data?.customer_name ? res.data.customer_name : current.customerName,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Serial lookup failed");
    } finally {
      setCheckingSerial(false);
    }
  };

  const serialConflict = Boolean(serialLookup?.open_rma_number);
  const needsProductPick = Boolean(selectedOrder && selectedOrder.lines.length > 0);
  const blocked =
    !form.fault.trim() ||
    serialConflict ||
    (needsProductPick ? selectedLineIds.length === 0 : !form.orderNumber.trim() && !form.customerName.trim());

  const submit = async (mode: "save" | "send" | "print" = "save") => {
    if (blocked) return;
    // Printing opens its window now, while the click still counts as a user gesture (a popup blocker would stop it later).
    const printWindow = mode === "print" ? window.open("", "_blank") : null;
    setSaving(true);
    try {
      const lines = selectedLines;
      const groupId = lines.length > 1 ? crypto.randomUUID() : undefined;
      const created: { id: string; rma_number: string }[] = [];
      const common = {
        fault_reported: form.fault.trim(),
        order_number: form.orderNumber.trim() || undefined,
        customer_name: form.customerName.trim() || undefined,
        customer_phone: form.customerPhone.trim() || undefined,
        customer_email: form.customerEmail.trim() || undefined,
        accessories: form.accessories.trim() || undefined,
        condition_notes: form.condition.trim() || undefined,
        received_by: form.receivedBy.trim() || undefined,
        priority: form.priority,
        rma_type: form.rmaType,
        reason_id: form.reasonId || undefined,
        start_status: "draft" as const,
        warehouse_id: form.storeId || undefined,
        assigned_to_user_id: form.assignedUserId || undefined,
        promised_delivery_date: form.promisedDate || undefined,
        charge_estimate: Number(form.chargeEstimate || 0),
        diagnosis_required: form.diagnosisRequired,
        diagnosis_report: form.diagnosisReport.trim() || undefined,
        supplier_id: overrideSupplier && form.supplierId ? form.supplierId : undefined,
        supplier_override_reason: overrideSupplier ? form.supplierReason.trim() || undefined : undefined,
        unit_received: !form.remote,
      };
      const payloads = lines.length
        ? lines.map((line) => {
            const matchedHere = selectedOrder?.matched_serial && line.serial_numbers.includes(selectedOrder.matched_serial);
            const serialForLine =
              lines.length === 1
                ? form.serial.trim() ||
                  (matchedHere ? selectedOrder!.matched_serial! : "") ||
                  (line.serial_numbers.length === 1 ? line.serial_numbers[0] : "")
                : matchedHere
                  ? selectedOrder!.matched_serial!
                  : line.serial_numbers.length === 1
                    ? line.serial_numbers[0] // several units coming back: each line brings its own single serial
                    : "";
            return {
              ...common,
              order_item_id: line.id,
              sku: line.sku,
              product_name: line.name,
              serial_number: serialForLine || undefined,
              claim_group_id: groupId,
            };
          })
        : [
            {
              ...common,
              sku: form.sku.trim() || undefined,
              product_name: form.productName.trim() || undefined,
              serial_number: form.serial.trim() || undefined,
            },
          ];

      for (const payload of payloads) {
        const ticket = await createRmaTicket(payload);
        created.push({ id: ticket.id, rma_number: ticket.rma_number });
      }
      const first = created[0];
      clearDraft();
      const numbers = created.map((row) => row.rma_number).join(", ");
      if (mode === "send") {
        for (const row of created) await submitRmaForApproval(row.id);
        toast.success(`${numbers} sent for approval`);
      } else {
        toast.success(`${numbers} saved as draft`);
      }
      if (mode === "print" && first) {
        await openRmaReceipt(first.id, printWindow).catch((err) => {
          toast.error(err instanceof Error ? err.message : "Saved, but the receipt could not be opened");
        });
      }
      onOpenChange(false);
      if (first) onCreated?.(first.id);
    } catch (err) {
      printWindow?.close();
      toast.error(err instanceof Error ? err.message : "Could not save the claim");
    } finally {
      setSaving(false);
    }
  };

  const showSearchMenu = searchOpen && form.query.trim().length >= 2 && !(selectedOrder && form.query === selectedOrder.order_number);

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={handleOpenChange}
      title="New RMA"
      resizable
      defaultWidth={560}
      minWidth={380}
      widthStorageKey="again-rma-intake-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />}>
          <AgainDrawerButton variant="primary" onClick={() => void submit("save")} disabled={blocked || saving}>
            {saving ? "Saving…" : "Save"}
          </AgainDrawerButton>
          <AgainDrawerButton onClick={() => void submit("send")} disabled={blocked || saving}>
            Save &amp; send for approval
          </AgainDrawerButton>
          <AgainDrawerButton onClick={() => void submit("print")} disabled={blocked || saving}>
            Save &amp; print receipt
          </AgainDrawerButton>
          <AgainDrawerButton onClick={cancel} disabled={saving}>
            Cancel
          </AgainDrawerButton>
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS} scrollRef={scrollRef}>
          <div className="@container space-y-5">
            <div className="min-w-0">
              <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>New RMA</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {dirty ? "Unsaved changes" : "Find the sale, pick the products coming back, describe the problem, then save and send it for approval."}
              </p>
            </div>

            <Section title="Sale">
              <p className="mb-2 mt-1 border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
                Product not purchased from us? Do not create an RMA.{" "}
                <Link href="/inventory/rma/service-jobs" className="text-foreground underline-offset-2 hover:underline">
                  Open a service job
                </Link>{" "}
                instead.
              </p>

              <div ref={searchBoxRef} className="relative">
                <AgainFormRow label="Find the sale">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <AgainUnderlineInput
                      value={form.query}
                      onChange={(value) => {
                        patch({
                          query: value,
                          ...(selectedOrder && value !== selectedOrder.order_number ? { orderNumber: "" } : {}),
                        });
                        if (selectedOrder && value !== selectedOrder.order_number) {
                          setSelectedOrder(null);
                          setSelectedLineIds([]);
                        }
                        setSearchOpen(true);
                      }}
                      onFocus={() => {
                        if (hits.length) setSearchOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (hits.length === 1) applyOrder(hits[0]);
                        }
                        if (e.key === "Escape" && showSearchMenu) {
                          e.stopPropagation();
                          setSearchOpen(false);
                        }
                      }}
                      placeholder="Order no., phone, or serial"
                      inputClassName="pl-5"
                      autoComplete="off"
                    />
                  </div>
                </AgainFormRow>
                {showSearchMenu && (
                  <div className="absolute left-32 right-0 z-30 mt-0.5 max-h-64 overflow-y-auto border border-border bg-popover shadow-md">
                    {searching ? (
                      <p className="px-3 py-2 text-[11px] text-muted-foreground">Searching…</p>
                    ) : hits.length === 0 ? (
                      <p className="px-3 py-2 text-[11px] text-muted-foreground">No matching orders.</p>
                    ) : (
                      hits.map((hit) => (
                        <button
                          key={`${hit.source}:${hit.order_id}`}
                          type="button"
                          className="flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-accent"
                          onClick={() => applyOrder(hit)}
                        >
                          <span className="flex w-full items-center gap-2">
                            <span className="font-mono text-[11px]">{hit.order_number}</span>
                            <Badge variant="outline" className="rounded-none text-[10px]">
                              {MATCH_BY_LABEL[hit.matched_by] ?? hit.matched_by}
                            </Badge>
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {hit.customer_name || "—"}
                            {hit.customer_phone ? ` · ${hit.customer_phone}` : ""}
                            {hit.lines.length ? ` · ${hit.lines.length} product${hit.lines.length === 1 ? "" : "s"}` : ""}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <p className="mb-1 text-[11px] text-muted-foreground">Type to find the sale, then pick the order.</p>

              {selectedOrder && selectedOrder.lines.length > 0 ? (
                <div className="mt-1">
                  <p className="mb-1 text-[13px]">Products on this order</p>
                  <div className="border border-border bg-background">
                    {selectedOrder.lines.map((line) => {
                      const checked = selectedLineIds.includes(line.id);
                      return (
                        <label key={line.id} className="flex cursor-pointer items-start gap-2 border-b border-border px-3 py-2 last:border-b-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLine(line)}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-[11px]">{line.sku || "—"}</span>
                              <WarrantyBadge status={line.warranty_status} />
                            </span>
                            <span className="block text-xs">{line.name || "Unnamed product"}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              Qty {line.quantity}
                              {line.serial_numbers.length ? ` · ${line.serial_numbers.join(", ")}` : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Select every unit that is coming back. Each product opens its own claim.</p>
                </div>
              ) : (
                <AgainFormRow label="Product SKU" className="mt-1">
                  <AgainUnderlineInput
                    value={form.sku}
                    onChange={(value) => patch({ sku: value })}
                    placeholder={selectedOrder ? "This order has no lines — enter the SKU" : "SKU-… (needed when the order has several lines)"}
                  />
                </AgainFormRow>
              )}

              {selectedLines.length === 1 && (
                <div className="mt-2 border border-border bg-background">
                  <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    <span className="text-xs font-semibold">Warranty check</span>
                    <span className="ml-auto">
                      <WarrantyBadge status={selectedLines[0].warranty_status} />
                    </span>
                  </div>
                  <div className="space-y-1 px-3 py-2 text-[11px]">
                    <p className="text-muted-foreground">{selectedLines[0].warranty_note}</p>
                    <p>
                      <span className="text-muted-foreground">Sold on </span>
                      {selectedOrder?.purchased_at ?? "—"}
                    </p>
                  </div>
                </div>
              )}
              {prior.length > 0 && (
                <div className="mt-2 flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 text-[11px]">
                    <p className="font-semibold text-amber-700 dark:text-amber-300">
                      {prior.length} earlier claim{prior.length === 1 ? "" : "s"} on this unit — you can still continue.
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {prior.slice(0, 4).map((p) => (
                        <li key={p.id} className="truncate">
                          <span className="font-mono">{p.rma_number}</span> · {RMA_STATUS_LABEL[p.status] ?? p.status} · {p.fault_reported}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </Section>

            <Section title="Customer">
              <div className="grid gap-x-8 @md:grid-cols-2">
                <AgainFormRow label="Customer">
                  <AgainUnderlineInput value={form.customerName} onChange={(value) => patch({ customerName: value })} placeholder="Name" />
                </AgainFormRow>
                <AgainFormRow label="Phone">
                  <AgainUnderlineInput value={form.customerPhone} onChange={(value) => patch({ customerPhone: value })} placeholder="Phone number" />
                </AgainFormRow>
              </div>
              <AgainFormRow label="Email">
                <AgainUnderlineInput value={form.customerEmail} onChange={(value) => patch({ customerEmail: value })} placeholder="name@example.com" />
              </AgainFormRow>
            </Section>

            <Section title="Unit">
              {!selectedOrder && (
                <AgainFormRow label="Product">
                  <AgainUnderlineInput value={form.productName} onChange={(value) => patch({ productName: value })} placeholder="Product name" />
                </AgainFormRow>
              )}
              <AgainFormRow label="Serial number">
                <div className="flex items-center gap-1.5">
                  <AgainUnderlineInput
                    className="min-w-0 flex-1"
                    value={form.serial}
                    onChange={(value) => {
                      patch({ serial: value });
                      setSerialLookup(null);
                    }}
                    placeholder="On the unit"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-none"
                    aria-label="Look up this serial"
                    title="Look up this serial"
                    disabled={!form.serial.trim() || checkingSerial}
                    onClick={() => void runSerialLookup()}
                  >
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </AgainFormRow>
              <p className="text-[11px] text-muted-foreground">
                {selectedLines.length > 1
                  ? "Serials on the selected products are used when opening each claim."
                  : "A registered unit can also find the sale for you."}
              </p>

              {serialLookup?.data && (
                <div className="mt-2 border border-border bg-background">
                  <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    <span className="text-xs font-semibold">Registered unit</span>
                    {serialLookup.warranty_status && (
                      <span className="ml-auto">
                        <WarrantyBadge status={serialLookup.warranty_status} />
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 px-3 py-2 text-[11px]">
                    <p className="text-muted-foreground">{serialLookup.warranty_note}</p>
                    <p>
                      <span className="text-muted-foreground">Sold on </span>
                      {serialLookup.purchased_on ?? "—"}
                      {serialLookup.data.order_number && (
                        <>
                          <span className="text-muted-foreground"> · order </span>
                          {serialLookup.data.order_number}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {serialConflict && (
                <div className="mt-2 flex items-start gap-2 border border-red-500/40 bg-red-500/10 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                  <p className="text-[11px] text-red-700 dark:text-red-400">
                    {form.serial.trim()} is already on open claim <span className="font-semibold">{serialLookup?.open_rma_number}</span>. Close or cancel
                    it before receiving this unit again.
                  </p>
                </div>
              )}

              {trace && (
                <div className="mt-2 border border-border bg-background">
                  <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
                    <span className="text-xs font-semibold">Supplier and purchase</span>
                    <span className="ml-auto rounded-none border border-border px-1.5 text-[10px] text-muted-foreground">
                      {trace.source === "traced" ? "Auto-filled from the serial" : "No purchase trace"}
                    </span>
                  </div>
                  <div className="space-y-1 px-3 py-2 text-[11px]">
                    {trace.source === "traced" ? (
                      <>
                        <p>
                          <span className="text-muted-foreground">Supplier </span>
                          {trace.supplier_name}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Purchase receipt </span>
                          {trace.purchase_receipt_no ?? "—"}
                          <span className="text-muted-foreground"> · vendor invoice </span>
                          {trace.vendor_invoice_no ?? "—"}
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        This unit was not received through a purchase, so the supplier cannot be found automatically.
                      </p>
                    )}
                    {canOverride && (
                      <button type="button" className="text-[11px] text-[#00a09d] underline-offset-2 hover:underline" onClick={() => setOverrideSupplier((v) => !v)}>
                        {overrideSupplier ? "Use the traced supplier" : trace.source === "traced" ? "Override supplier" : "Choose the supplier by hand"}
                      </button>
                    )}
                  </div>
                  {overrideSupplier && canOverride && (
                    <div className="space-y-1 border-t border-border px-3 py-2">
                      <AgainFormRow label="Supplier">
                        <FilterSelect
                          value={form.supplierId}
                          onChange={(value) => patch({ supplierId: value })}
                          width="w-full"
                          avoidCollisions
                          ariaLabel="Supplier"
                          placeholder="Choose a supplier…"
                          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                        />
                      </AgainFormRow>
                      <AgainFormRow label="Reason">
                        <AgainUnderlineInput value={form.supplierReason} onChange={(value) => patch({ supplierReason: value })} placeholder="Why it is set by hand" />
                      </AgainFormRow>
                    </div>
                  )}
                </div>
              )}
            </Section>

            <Section title="Problem">
              <AgainFormRow
                label={
                  <>
                    Reported fault <span className="text-destructive">*</span>
                  </>
                }
              >
                <AgainUnderlineTextarea
                  value={form.fault}
                  onChange={(value) => patch({ fault: value })}
                  rows={2}
                  placeholder="What the customer says is wrong"
                />
              </AgainFormRow>
              <div className="grid gap-x-8 @md:grid-cols-2">
                <AgainFormRow label="Accessories">
                  <AgainUnderlineInput value={form.accessories} onChange={(value) => patch({ accessories: value })} placeholder="Box, cable, adapter…" />
                </AgainFormRow>
                <AgainFormRow label="Condition">
                  <AgainUnderlineInput value={form.condition} onChange={(value) => patch({ condition: value })} placeholder="Scratches, dents…" />
                </AgainFormRow>
              </div>
              <label className="flex items-center gap-2 py-1 text-[13px]">
                <input
                  type="checkbox"
                  checked={form.diagnosisRequired}
                  onChange={(e) => patch({ diagnosisRequired: e.target.checked })}
                  className="h-3.5 w-3.5 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                Diagnosis report required before approval
              </label>
              {form.diagnosisRequired && (
                <AgainFormRow label="Diagnosis report">
                  <AgainUnderlineTextarea value={form.diagnosisReport} onChange={(value) => patch({ diagnosisReport: value })} rows={2} placeholder="What the check found" />
                </AgainFormRow>
              )}
            </Section>

            <Section title="Handling">
              <div className="grid gap-x-8 @md:grid-cols-2">
                <AgainFormRow label="Assigned to">
                  <FilterSelect
                    value={form.assignedUserId}
                    onChange={(value) => patch({ assignedUserId: value })}
                    width="w-full"
                    avoidCollisions
                    ariaLabel="Assigned to"
                    placeholder="Unassigned"
                    options={users.map((u) => ({ value: u.id, label: u.name }))}
                  />
                </AgainFormRow>
                <AgainFormRow label="RMA store">
                  <FilterSelect
                    value={form.storeId}
                    onChange={(value) => patch({ storeId: value })}
                    width="w-full"
                    avoidCollisions
                    ariaLabel="Receiving RMA store"
                    placeholder="Choose the RMA store…"
                    options={stores.map((s) => ({ value: s.id, label: s.name }))}
                  />
                </AgainFormRow>
                <AgainFormRow label="Promised delivery">
                  <input
                    type="date"
                    value={form.promisedDate}
                    onChange={(e) => patch({ promisedDate: e.target.value })}
                    className="h-8 w-full border-0 border-b border-input bg-transparent text-[13px] outline-none"
                  />
                </AgainFormRow>
                <AgainFormRow label="Charge estimate">
                  <AgainUnderlineInput value={form.chargeEstimate} onChange={(value) => patch({ chargeEstimate: value.replace(/[^0-9.]/g, "") })} placeholder="0" />
                </AgainFormRow>
                <AgainFormRow label="Received by">
                  <AgainUnderlineInput value={form.receivedBy} onChange={(value) => patch({ receivedBy: value })} placeholder="Staff name" />
                </AgainFormRow>
                <AgainFormRow label="Priority">
                  <FilterSelect
                    value={form.priority}
                    onChange={(value) => patch({ priority: value })}
                    width="w-full"
                    avoidCollisions
                    ariaLabel="Priority"
                    options={[
                      { value: "low", label: "Low" },
                      { value: "normal", label: "Normal" },
                      { value: "high", label: "High" },
                      { value: "urgent", label: "Urgent" },
                    ]}
                  />
                </AgainFormRow>
              </div>
              <AgainFormRow label="Return reason">
                <FilterSelect
                  value={form.reasonId}
                  onChange={(value) => patch({ reasonId: value })}
                  width="w-full"
                  avoidCollisions
                  ariaLabel="Return reason"
                  options={[
                    { value: "", label: "Unspecified" },
                    ...reasons.map((r) => ({ value: r.id, label: `${r.name} (${r.category})` })),
                  ]}
                />
              </AgainFormRow>

              <button
                type="button"
                className="mt-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "Hide advanced" : "Advanced"}
              </button>
              {showAdvanced && (
                <div className="mt-1 grid gap-x-8 @md:grid-cols-2">
                  <AgainFormRow label="RMA type">
                    <FilterSelect
                      value={form.rmaType}
                      onChange={(value) => patch({ rmaType: value })}
                      width="w-full"
                      avoidCollisions
                      ariaLabel="RMA type"
                      options={[
                        { value: "customer", label: "Customer" },
                        { value: "warranty", label: "Warranty" },
                        { value: "supplier", label: "Supplier" },
                      ]}
                    />
                  </AgainFormRow>
                  <AgainFormRow label="Unit location">
                    <FilterSelect
                      value={form.remote ? "remote" : "here"}
                      onChange={(value) => patch({ remote: value === "remote" })}
                      width="w-full"
                      avoidCollisions
                      ariaLabel="Unit location"
                      options={[
                        { value: "here", label: "The unit is here (walk-in)" },
                        { value: "remote", label: "Remote request — not here yet" },
                      ]}
                    />
                  </AgainFormRow>
                  <p className="text-[11px] text-muted-foreground @md:col-span-2">
                    Every complaint is saved as a draft, then sent for approval. A unit that is here is stocked into the RMA store when the complaint is approved; a remote
                    request is stocked when it is marked received.
                  </p>
                </div>
              )}
            </Section>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
