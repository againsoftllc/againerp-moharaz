"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  createRmaTicket,
  fetchRmaReasons,
  searchRmaOrders,
  WARRANTY_LABEL,
  WARRANTY_TONE,
  type OrderSearchHit,
  type OrderSearchLine,
  type RmaReason,
} from "@/lib/api/rma";
import { lookupSerial, type SerialLookupResponse } from "@/lib/api/inventory-serials";
import { cn } from "@/lib/utils";

const MATCH_BY_LABEL: Record<string, string> = {
  order_number: "Order",
  phone: "Phone",
  serial: "Serial",
};

function pickDefaultLines(hit: OrderSearchHit): OrderSearchLine[] {
  if (hit.matched_serial) {
    const matched = hit.lines.filter((line) => line.serial_numbers.includes(hit.matched_serial!));
    if (matched.length) return matched;
  }
  if (hit.lines.length === 1) return hit.lines;
  return [];
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Intake for a warranty claim. Looking the order up first fills the customer in
 * and tells you whether the unit is still covered before you accept it.
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
  const [query, setQuery] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [sku, setSku] = useState("");
  const [hits, setHits] = useState<OrderSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderSearchHit | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);
  const [serialLookup, setSerialLookup] = useState<SerialLookupResponse | null>(null);
  const [checkingSerial, setCheckingSerial] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [productName, setProductName] = useState("");
  const [serial, setSerial] = useState("");
  const [fault, setFault] = useState("");
  const [accessories, setAccessories] = useState("");
  const [condition, setCondition] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);
  const [reasons, setReasons] = useState<RmaReason[]>([]);
  const [reasonId, setReasonId] = useState("");
  const [rmaType, setRmaType] = useState("customer");
  const [startStatus, setStartStatus] = useState("received");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!open) return;
    void fetchRmaReasons()
      .then(setReasons)
      .catch(() => setReasons([]));
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!searchBoxRef.current?.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    const q = query.trim();
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
  }, [query, selectedOrder]);

  const selectedLines = useMemo(
    () => (selectedOrder?.lines ?? []).filter((line) => selectedLineIds.includes(line.id)),
    [selectedOrder, selectedLineIds],
  );

  const applyOrder = (hit: OrderSearchHit) => {
    setSelectedOrder(hit);
    setOrderNumber(hit.order_number);
    setQuery(hit.order_number);
    setHits([]);
    setSearchOpen(false);
    setCustomerName(hit.customer_name ?? "");
    setCustomerPhone(hit.customer_phone ?? "");
    setCustomerEmail(hit.customer_email ?? "");
    const preselected = pickDefaultLines(hit);
    setSelectedLineIds(preselected.map((line) => line.id));
    const first = preselected[0];
    if (first) {
      setSku(first.sku);
      setProductName(first.name);
      const serialToUse =
        hit.matched_serial && first.serial_numbers.includes(hit.matched_serial)
          ? hit.matched_serial
          : first.serial_numbers.length === 1
            ? first.serial_numbers[0]
            : "";
      if (serialToUse) setSerial(serialToUse);
    } else {
      setSku("");
      setProductName("");
    }
  };

  const toggleLine = (line: OrderSearchLine) => {
    setSelectedLineIds((current) => {
      const next = current.includes(line.id)
        ? current.filter((id) => id !== line.id)
        : [...current, line.id];
      const remaining = (selectedOrder?.lines ?? []).filter((row) => next.includes(row.id));
      if (remaining.length === 1) {
        setSku(remaining[0].sku);
        setProductName(remaining[0].name);
        if (remaining[0].serial_numbers.length === 1) setSerial(remaining[0].serial_numbers[0]);
      } else if (remaining.length === 0) {
        setSku("");
        setProductName("");
      }
      return next;
    });
  };

  /**
   * Serial-first lookup: an order number is not required when the serial
   * itself is registered — the registry knows the sale.
   */
  const runSerialLookup = async () => {
    if (!serial.trim()) return;
    setCheckingSerial(true);
    try {
      const res = await lookupSerial(serial.trim());
      setSerialLookup(res);
      if (!res.data) {
        toast.message(`${serial.trim()} is not in the registry — proceeding as unregistered.`);
        return;
      }
      if (res.open_rma_number) return; // shown as a blocking banner below

      if (res.data.order_number) {
        setQuery(res.data.order_number);
        try {
          const rows = await searchRmaOrders(res.data.order_number);
          const match =
            rows.find((row) => row.order_number === res.data?.order_number) ?? rows[0];
          if (match) applyOrder(match);
        } catch {
          setOrderNumber(res.data.order_number);
        }
      }
      if (!sku.trim() && res.data.sku) setSku(res.data.sku);
      if (!productName.trim() && res.data.product_name) setProductName(res.data.product_name);
      if (!customerName.trim() && res.data.customer_name) setCustomerName(res.data.customer_name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Serial lookup failed");
    } finally {
      setCheckingSerial(false);
    }
  };

  const serialConflict = Boolean(serialLookup?.open_rma_number);
  const needsProductPick = Boolean(selectedOrder && selectedOrder.lines.length > 0);
  const blocked =
    !fault.trim() ||
    serialConflict ||
    (needsProductPick ? selectedLineIds.length === 0 : !orderNumber.trim() && !customerName.trim());

  const submit = async () => {
    if (blocked) return;
    setSaving(true);
    try {
      const lines = selectedLines;
      const groupId = lines.length > 1 ? crypto.randomUUID() : undefined;
      const created: { id: string; rma_number: string }[] = [];
      const payloads = lines.length
        ? lines.map((line) => {
            const serialForLine =
              lines.length === 1
                ? serial.trim() ||
                  (selectedOrder?.matched_serial &&
                  line.serial_numbers.includes(selectedOrder.matched_serial)
                    ? selectedOrder.matched_serial
                    : "") ||
                  (line.serial_numbers.length === 1 ? line.serial_numbers[0] : "")
                : selectedOrder?.matched_serial &&
                    line.serial_numbers.includes(selectedOrder.matched_serial)
                  ? selectedOrder.matched_serial
                  : "";
            return {
              fault_reported: fault.trim(),
              order_number: orderNumber.trim() || undefined,
              order_item_id: line.id,
              sku: line.sku,
              product_name: line.name,
              customer_name: customerName.trim() || undefined,
              customer_phone: customerPhone.trim() || undefined,
              customer_email: customerEmail.trim() || undefined,
              serial_number: serialForLine || undefined,
              accessories: accessories.trim() || undefined,
              condition_notes: condition.trim() || undefined,
              received_by: receivedBy.trim() || undefined,
              priority,
              rma_type: rmaType,
              reason_id: reasonId || undefined,
              start_status: startStatus as "received" | "pending_approval" | "draft" | "awaiting_return",
              claim_group_id: groupId,
            };
          })
        : [
            {
              fault_reported: fault.trim(),
              order_number: orderNumber.trim() || undefined,
              sku: sku.trim() || undefined,
              customer_name: customerName.trim() || undefined,
              customer_phone: customerPhone.trim() || undefined,
              customer_email: customerEmail.trim() || undefined,
              product_name: productName.trim() || undefined,
              serial_number: serial.trim() || undefined,
              accessories: accessories.trim() || undefined,
              condition_notes: condition.trim() || undefined,
              received_by: receivedBy.trim() || undefined,
              priority,
              rma_type: rmaType,
              reason_id: reasonId || undefined,
              start_status: startStatus as "received" | "pending_approval" | "draft" | "awaiting_return",
            },
          ];

      for (const payload of payloads) {
        const ticket = await createRmaTicket(payload);
        created.push({ id: ticket.id, rma_number: ticket.rma_number });
      }
      const first = created[0];
      toast.success(
        created.length === 1
          ? `${first.rma_number} opened`
          : `${created.map((row) => row.rma_number).join(", ")} opened`,
      );
      onOpenChange(false);
      if (first) onCreated?.(first.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the claim");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        closeButton="inside"
        resizable
        className="flex min-w-[160px] w-[480px] max-w-[720px] flex-col p-0"
      >
        <div className="border-b border-border px-4 py-3 pr-10">
          <h2 className="text-sm font-semibold">New RMA</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Search by order number, phone, or serial. Pick the sale, then the products coming back.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <p className="border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            Product not purchased from us? Do not create an RMA.{" "}
            <Link href="/rma/service-jobs" className="text-foreground underline-offset-2 hover:underline">
              Open a service job
            </Link>{" "}
            instead.
          </p>
          <div ref={searchBoxRef} className="relative">
            <Field
              label="Order, phone or serial"
              hint="Type to find the sale, then pick the order."
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (selectedOrder && e.target.value !== selectedOrder.order_number) {
                      setSelectedOrder(null);
                      setSelectedLineIds([]);
                      setOrderNumber("");
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
                    if (e.key === "Escape") setSearchOpen(false);
                  }}
                  placeholder="ORD-1001, phone, or serial"
                  className="rounded-none pl-7"
                  autoComplete="off"
                />
              </div>
            </Field>
            {searchOpen && query.trim().length >= 2 && !(selectedOrder && query === selectedOrder.order_number) && (
              <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto border border-border bg-popover shadow-md">
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

          {selectedOrder ? (
            <Field
              label="Products on this order"
              hint={
                selectedOrder.lines.length === 0
                  ? "This order has no lines — enter the SKU below."
                  : "Select every unit that is coming back. Each product opens its own claim."
              }
            >
              {selectedOrder.lines.length === 0 ? (
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="SKU-…"
                  className="rounded-none"
                />
              ) : (
                <div className="border border-border">
                  {selectedOrder.lines.map((line) => {
                    const checked = selectedLineIds.includes(line.id);
                    return (
                      <label
                        key={line.id}
                        className="flex cursor-pointer items-start gap-2 border-b border-border px-3 py-2 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLine(line)}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-[11px]">{line.sku || "—"}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-none text-[10px]",
                                WARRANTY_TONE[line.warranty_status],
                              )}
                            >
                              {WARRANTY_LABEL[line.warranty_status] ?? line.warranty_status}
                            </Badge>
                          </span>
                          <span className="block text-xs">{line.name || "Unnamed product"}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            Qty {line.quantity}
                            {line.serial_numbers.length
                              ? ` · ${line.serial_numbers.join(", ")}`
                              : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </Field>
          ) : (
            <Field label="Product SKU" hint="Needed when the order has more than one line.">
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="SKU-…"
                className="rounded-none"
              />
            </Field>
          )}

          {selectedLines.length === 1 && (
            <div className="border border-border">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span className="text-xs font-semibold">Warranty check</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "ml-auto rounded-none text-[10px]",
                    WARRANTY_TONE[selectedLines[0].warranty_status],
                  )}
                >
                  {WARRANTY_LABEL[selectedLines[0].warranty_status]}
                </Badge>
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer">
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Name"
                className="rounded-none"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="rounded-none"
              />
            </Field>
          </div>

          <Field label="Email">
            <Input
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="rounded-none"
            />
          </Field>

          <div className={cn("grid gap-3", selectedOrder ? "grid-cols-1" : "grid-cols-2")}>
            {!selectedOrder && (
              <Field label="Product">
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="rounded-none"
                />
              </Field>
            )}
            <Field
              label="Serial number"
              hint={
                selectedLines.length > 1
                  ? "Serials on the selected products are used when opening each claim."
                  : "A registered unit can also find the sale for you."
              }
            >
              <div className="flex gap-1.5">
                <Input
                  value={serial}
                  onChange={(e) => {
                    setSerial(e.target.value);
                    setSerialLookup(null);
                  }}
                  placeholder="On the unit"
                  className="rounded-none"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 rounded-none px-2.5"
                  disabled={!serial.trim() || checkingSerial}
                  onClick={() => void runSerialLookup()}
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Field>
          </div>

          {serialLookup?.data && (
            <div className="border border-border">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span className="text-xs font-semibold">Registered unit</span>
                {serialLookup.warranty_status && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "ml-auto rounded-none text-[10px]",
                      WARRANTY_TONE[serialLookup.warranty_status as keyof typeof WARRANTY_TONE],
                    )}
                  >
                    {WARRANTY_LABEL[serialLookup.warranty_status as keyof typeof WARRANTY_LABEL] ??
                      serialLookup.warranty_status}
                  </Badge>
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
            <div className="flex items-start gap-2 border border-red-500/40 bg-red-500/10 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
              <p className="text-[11px] text-red-700 dark:text-red-400">
                {serial.trim()} is already on open claim{" "}
                <span className="font-semibold">{serialLookup?.open_rma_number}</span>. Close or
                cancel it before receiving this unit again.
              </p>
            </div>
          )}

          <Field label="Reported fault">
            <Input
              value={fault}
              onChange={(e) => setFault(e.target.value)}
              placeholder="What the customer says is wrong"
              className="rounded-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Accessories received">
              <Input
                value={accessories}
                onChange={(e) => setAccessories(e.target.value)}
                placeholder="Box, cable, adapter…"
                className="rounded-none"
              />
            </Field>
            <Field label="Condition on arrival">
              <Input
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                placeholder="Scratches, dents…"
                className="rounded-none"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Received by">
              <Input
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Priority">
              <FilterSelect
                value={priority}
                onChange={setPriority}
                width="w-full"
                ariaLabel="Priority"
                options={[
                  { value: "low", label: "Low" },
                  { value: "normal", label: "Normal" },
                  { value: "high", label: "High" },
                  { value: "urgent", label: "Urgent" },
                ]}
              />
            </Field>
          </div>

          <Field label="Return reason">
            <FilterSelect
              value={reasonId}
              onChange={setReasonId}
              width="w-full"
              ariaLabel="Return reason"
              options={[
                { value: "", label: "Unspecified" },
                ...reasons.map((r) => ({ value: r.id, label: `${r.name} (${r.category})` })),
              ]}
            />
          </Field>

          <button
            type="button"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide advanced" : "Advanced"}
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="RMA type">
                <FilterSelect
                  value={rmaType}
                  onChange={setRmaType}
                  width="w-full"
                  ariaLabel="RMA type"
                  options={[
                    { value: "customer", label: "Customer" },
                    { value: "warranty", label: "Warranty" },
                    { value: "supplier", label: "Supplier" },
                  ]}
                />
              </Field>
              <Field label="Start as" hint="Walk-in stays Received. Remote requests start pending approval.">
                <FilterSelect
                  value={startStatus}
                  onChange={setStartStatus}
                  width="w-full"
                  ariaLabel="Start status"
                  options={[
                    { value: "received", label: "Received (walk-in)" },
                    { value: "pending_approval", label: "Pending approval" },
                    { value: "awaiting_return", label: "Awaiting return" },
                    { value: "draft", label: "Draft" },
                  ]}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={blocked || saving} onClick={() => void submit()}>
            {saving ? "Opening…" : "Open claim"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
