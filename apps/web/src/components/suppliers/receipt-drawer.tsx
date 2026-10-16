"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
  AgainDrawerControlBar,
} from "@/components/again/again-drawer";
import { cn } from "@/lib/utils";
import {
  createPurchaseReceipt,
  postPurchaseReceipt,
  correctPurchaseReceiptLine,
  type ApiPurchaseReceipt,
} from "@/lib/api/purchase-receipts";
import type { ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { useAdminIsAdmin } from "@/lib/hooks/use-admin-can-write";
import { Pencil, Eye } from "lucide-react";
import { InventoryProductQuickAdd } from "@/components/inventory/inventory-product-quick-add";
import {
  SerialsDrawer,
  trackingOf,
  remainingOf,
  parseBatchNotes,
  type TrackingType,
} from "@/components/suppliers/receiving-shared";

type ReceiptLine = {
  lineId: string;
  receiptLineId?: string;
  productId?: string;
  sku: string;
  name: string;
  ordered: number;
  previouslyReceived: number;
  remaining: number;
  tracking: TrackingType;
  qty: string;
  serials: string[];
  batchNumber: string;
  batchExpiry: string;
};

// Receiving items table — same drag-reorder / resize / show-hide columns as
// the PO's Order Lines table (see usePoLineTableLayout in po-form-drawer.tsx).
const RECEIPT_COLS = [
  "product",
  "ordered",
  "previouslyReceived",
  "remaining",
  "receiveNow",
  "tracking",
  "serialBatch",
] as const;

type ReceiptCol = (typeof RECEIPT_COLS)[number];

const RECEIPT_COL_LABELS: Record<ReceiptCol, string> = {
  product: "Product",
  ordered: "Ordered",
  previouslyReceived: "Previously received",
  remaining: "Remaining",
  receiveNow: "Receive now",
  tracking: "Tracking",
  serialBatch: "Serial / Batch",
};

const RECEIPT_DEFAULT_WIDTHS: Record<ReceiptCol, number> = {
  product: 260,
  ordered: 90,
  previouslyReceived: 130,
  remaining: 100,
  receiveNow: 160,
  tracking: 100,
  serialBatch: 200,
};

const RECEIPT_MIN_WIDTHS: Record<ReceiptCol, number> = {
  product: 96,
  ordered: 56,
  previouslyReceived: 56,
  remaining: 56,
  receiveNow: 96,
  tracking: 64,
  serialBatch: 96,
};

const RECEIPT_DEFAULT_VISIBLE: Record<ReceiptCol, boolean> = {
  product: true,
  ordered: true,
  previouslyReceived: true,
  remaining: true,
  receiveNow: true,
  tracking: true,
  serialBatch: true,
};

function useReceiptLineTableLayout() {
  const [order, setOrder] = useState<ReceiptCol[]>([...RECEIPT_COLS]);
  const [widths, setWidths] = useState(RECEIPT_DEFAULT_WIDTHS);
  const [visible, setVisible] = useState(RECEIPT_DEFAULT_VISIBLE);
  const [dragCol, setDragCol] = useState<ReceiptCol | null>(null);

  const moveColumn = useCallback((from: ReceiptCol, to: ReceiptCol) => {
    if (from === to) return;
    setOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(from);
      const toIdx = next.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      return next;
    });
  }, []);

  const startResize = useCallback(
    (col: ReceiptCol, startX: number) => {
      const startWidth = widths[col];
      const onMove = (event: MouseEvent) => {
        const delta = event.clientX - startX;
        setWidths((current) => ({
          ...current,
          [col]: Math.max(RECEIPT_MIN_WIDTHS[col], startWidth + delta),
        }));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [widths],
  );

  const toggleVisible = useCallback((col: ReceiptCol) => {
    setVisible((current) => {
      const next = { ...current, [col]: !current[col] };
      // Never let every column disappear — always keep at least one visible.
      if (!Object.values(next).some(Boolean)) return current;
      return next;
    });
  }, []);

  return { order, widths, visible, dragCol, setDragCol, moveColumn, startResize, toggleVisible };
}

function ReceiptLineHeaderCell({
  col,
  width,
  dragCol,
  onDragColChange,
  onMoveColumn,
  onResizeStart,
}: {
  col: ReceiptCol;
  width: number;
  dragCol: ReceiptCol | null;
  onDragColChange: (col: ReceiptCol | null) => void;
  onMoveColumn: (from: ReceiptCol, to: ReceiptCol) => void;
  onResizeStart: (col: ReceiptCol, clientX: number) => void;
}) {
  const label = RECEIPT_COL_LABELS[col];
  const alignRight = col === "ordered" || col === "previouslyReceived" || col === "remaining";

  return (
    <th
      style={{ width, minWidth: width, maxWidth: width }}
      className={cn(
        "group/col relative overflow-hidden px-2 py-1.5 font-medium",
        alignRight && "text-right",
      )}
      draggable
      onDragStart={(event) => {
        onDragColChange(col);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => onDragColChange(null)}
      onDragOver={(event) => {
        if (!dragCol || dragCol === col) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!dragCol || dragCol === col) return;
        event.preventDefault();
        onMoveColumn(dragCol, col);
        onDragColChange(null);
      }}
    >
      <span
        className={cn(
          "block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
          "cursor-grab active:cursor-grabbing",
          dragCol === col && "opacity-60",
        )}
        title={label}
      >
        {label}
      </span>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label} column`}
        className="absolute inset-y-0 right-0 z-20 w-2.5 cursor-col-resize group/resize"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onResizeStart(col, event.clientX);
        }}
        onDragStart={(event) => event.preventDefault()}
      >
        <span
          className="pointer-events-none absolute inset-y-1 right-[4px] w-px bg-transparent group-hover/col:bg-border group-hover/resize:bg-[#00a09d]"
          aria-hidden
        />
      </div>
    </th>
  );
}

function ManageReceiptColumns({
  visible,
  onToggle,
}: {
  visible: Record<ReceiptCol, boolean>;
  onToggle: (col: ReceiptCol) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        title="Add / remove columns"
        aria-label="Add / remove columns"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 items-center gap-1 rounded-none border border-border/80 bg-muted/50 px-2 text-[11px] text-foreground hover:bg-muted"
      >
        Columns
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[200px] rounded-none border border-border bg-popover py-1 shadow-lg">
          {RECEIPT_COLS.map((col) => (
            <label
              key={col}
              className="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-[12px] hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={visible[col]}
                onChange={() => onToggle(col)}
                className="h-3.5 w-3.5"
              />
              {RECEIPT_COL_LABELS[col]}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

/**
 * Receive goods against a confirmed purchase order. Posting the receipt is what
 * moves stock — the API writes the inventory movement, serials, and the payable.
 */
export function ReceiptDrawer({
  open,
  onOpenChange,
  order,
  orders,
  receipt,
  onReceived,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ApiPurchaseOrder | null;
  orders?: ApiPurchaseOrder[];
  receipt?: ApiPurchaseReceipt | null;
  onReceived?: () => void;
}) {
  const eligible = useMemo(
    () =>
      (orders ?? []).filter(
        (row) => row.status === "confirmed" || row.status === "partial_received",
      ),
    [orders],
  );
  const [selectedOrderId, setSelectedOrderId] = useState(order?.id ?? "");
  const resolvedOrder = order ?? eligible.find((row) => row.id === selectedOrderId) ?? null;
  const readOnly = Boolean(receipt && receipt.status !== "draft");
  const isAdmin = useAdminIsAdmin();
  const canCorrect = isAdmin && receipt?.status === "posted";
  const [correctTarget, setCorrectTarget] = useState<{
    receiptLineId: string;
    sku: string;
    name: string;
    currentQty: number;
  } | null>(null);
  const [correctQty, setCorrectQty] = useState("");
  const [correctReason, setCorrectReason] = useState("");
  const [correcting, setCorrecting] = useState(false);

  async function submitCorrection() {
    if (!receipt || !correctTarget) return;
    const nextQty = Number.parseInt(correctQty, 10);
    if (Number.isNaN(nextQty) || nextQty < 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (!correctReason.trim()) {
      toast.error("A reason is required");
      return;
    }
    setCorrecting(true);
    try {
      await correctPurchaseReceiptLine(receipt.id, correctTarget.receiptLineId, {
        new_quantity: nextQty,
        reason: correctReason.trim(),
      });
      toast.success(`${correctTarget.sku} corrected: ${correctTarget.currentQty} → ${nextQty}`);
      setCorrectTarget(null);
      setCorrectQty("");
      setCorrectReason("");
      onReceived?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setCorrecting(false);
    }
  }

  const initial = useMemo<ReceiptLine[]>(() => {
    const poLines = resolvedOrder?.lines ?? [];
    if (poLines.length === 0 && receipt?.lines.length) {
      return receipt.lines.map((line) => {
        const batch = parseBatchNotes(line.notes);
        return {
          lineId: line.purchase_order_line_id,
          productId: line.item_id ?? undefined,
          sku: line.sku ?? "",
          name: line.name ?? "",
          ordered: line.quantity_received,
          previouslyReceived: 0,
          remaining: 0,
          tracking: line.serial_numbers?.length ? "serial" : batch.batchNumber ? "batch" : "none",
          qty: String(line.quantity_received),
          serials: line.serial_numbers ?? [],
          batchNumber: batch.batchNumber,
          batchExpiry: batch.batchExpiry,
        };
      });
    }
    return poLines.map((l) => {
      const posted = receipt?.lines.find((line) => line.purchase_order_line_id === l.id);
      const thisQty = posted?.quantity_received ?? 0;
      const previouslyReceived =
        receipt?.status === "posted"
          ? Math.max(0, l.quantity_received - thisQty)
          : l.quantity_received;
      const remaining = remainingOf(l);
      const batch = parseBatchNotes(posted?.notes);
      return {
        lineId: l.id,
        receiptLineId: posted?.id,
        productId: l.item_id,
        sku: l.sku,
        name: l.name,
        ordered: l.quantity_ordered,
        previouslyReceived,
        remaining,
        tracking: trackingOf(l),
        qty: receipt ? String(thisQty) : "0",
        serials: posted?.serial_numbers ?? [],
        batchNumber: batch.batchNumber,
        batchExpiry: batch.batchExpiry,
      };
    });
  }, [resolvedOrder, receipt]);

  const [lines, setLines] = useState<ReceiptLine[]>(initial);
  const { order: colOrder, widths: colWidths, visible: colVisible, dragCol, setDragCol, moveColumn, startResize, toggleVisible } =
    useReceiptLineTableLayout();
  const [receiptDate, setReceiptDate] = useState(
    () => receipt?.receipt_date ?? new Date().toISOString().slice(0, 10),
  );
  const [receivedBy, setReceivedBy] = useState(receipt?.received_by ?? "");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [notes, setNotes] = useState(receipt?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [serialTarget, setSerialTarget] = useState<ReceiptLine | null>(null);
  const [viewProductId, setViewProductId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedOrderId(order?.id ?? "");
    setReceiptDate(receipt?.receipt_date ?? new Date().toISOString().slice(0, 10));
    setReceivedBy(receipt?.received_by ?? "");
    setNotes(receipt?.notes ?? "");
    setDeliveryNote("");
    // Intentionally excludes `initial`: it's derived from `selectedOrderId`, so including it
    // here would reset `selectedOrderId` back to `order?.id` on every PO pick, undoing the
    // user's selection. Line syncing is handled by the effect below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id, receipt]);

  useEffect(() => {
    if (!open) return;
    setLines(initial);
  }, [open, initial]);

  const setQty = (lineId: string, qty: string) =>
    setLines((rows) => rows.map((r) => (r.lineId === lineId ? { ...r, qty } : r)));

  const payloadLines = lines
    .map((l) => ({ ...l, parsed: Number.parseInt(l.qty, 10) }))
    .filter((l) => Number.isFinite(l.parsed) && l.parsed > 0);

  const overReceiving = payloadLines.some(
    (l) => l.parsed > l.remaining && !resolvedOrder?.allow_over_receive,
  );
  const serialMissing = payloadLines.some(
    (l) => l.tracking === "serial" && l.serials.filter(Boolean).length !== l.parsed,
  );
  const batchMissing = payloadLines.some((l) => l.tracking === "batch" && l.parsed > 0 && !l.batchNumber.trim());
  const fullyReceived = Boolean(
    resolvedOrder && remainingOfTotals(resolvedOrder) <= 0 && resolvedOrder.status === "completed",
  );
  const blocked =
    readOnly ||
    !resolvedOrder ||
    payloadLines.length === 0 ||
    overReceiving ||
    serialMissing ||
    batchMissing ||
    fullyReceived;

  const title = receipt
    ? receipt.receipt_number
    : resolvedOrder
      ? `Receive ${resolvedOrder.po_number}`
      : "New Purchase Receipt";

  const submit = async (post: boolean) => {
    if (!resolvedOrder || blocked) return;
    setSaving(true);
    try {
      const created = await createPurchaseReceipt({
        purchase_order_id: resolvedOrder.id,
        receipt_date: receiptDate || undefined,
        received_by: receivedBy.trim() || undefined,
        delivery_note: deliveryNote.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: payloadLines.map((l) => ({
          purchase_order_line_id: l.lineId,
          quantity_received: l.parsed,
          serial_numbers: l.tracking === "serial" ? l.serials.filter(Boolean) : undefined,
          notes:
            l.tracking === "batch" && l.batchNumber.trim()
              ? `BATCH:${l.batchNumber.trim()}${l.batchExpiry ? `|exp=${l.batchExpiry}` : ""}`
              : undefined,
        })),
      });

      if (post) {
        await postPurchaseReceipt(created.id);
        toast.success(`${created.receipt_number} posted — stock updated`);
      } else {
        toast.success(`${created.receipt_number} saved as draft`);
      }
      onOpenChange(false);
      onReceived?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Receipt failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          resizable
          resizeMaxWidth={2400}
          className="flex min-w-[160px] w-[60vw] max-w-[90vw] flex-col gap-0 p-0"
          title={title}
        >
          <AgainDrawerControlBar>
            {!readOnly && (
              <>
                <button
                  type="button"
                  className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
                  style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
                  disabled={blocked || saving}
                  onClick={() => void submit(true)}
                >
                  {saving ? "Posting…" : "Confirm receipt"}
                </button>
                <button
                  type="button"
                  className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                  disabled={blocked || saving}
                  onClick={() => void submit(false)}
                >
                  Save draft
                </button>
              </>
            )}
            <button
              type="button"
              className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
              onClick={() => onOpenChange(false)}
            >
              {readOnly ? "Close" : "Cancel"}
            </button>
            <span className="ml-1 text-[13px] font-medium text-foreground">{title}</span>
          </AgainDrawerControlBar>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Receipt No">
                <Input
                  readOnly
                  value={receipt?.receipt_number ?? "Auto (GRN-YYYY-####)"}
                  className="rounded-none bg-muted/40 font-mono"
                />
              </Field>
              {!order && !receipt && (
                <Field label="Purchase Order" required>
                  <FilterSelect
                    value={selectedOrderId}
                    onChange={(v) => setSelectedOrderId(v)}
                    width="w-full"
                    ariaLabel="Purchase order"
                    options={[
                      { value: "", label: "Select a purchase order" },
                      ...eligible.map((row) => ({
                        value: row.id,
                        label: `${row.po_number} · ${row.supplier_name ?? ""}`,
                      })),
                    ]}
                  />
                </Field>
              )}
              <Field label="Supplier">
                <Input
                  readOnly
                  value={resolvedOrder?.supplier_name ?? ""}
                  className="rounded-none bg-muted/40"
                />
              </Field>
              <Field label="Receipt Date" required>
                <Input
                  type="date"
                  value={receiptDate}
                  disabled={readOnly}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  className="rounded-none"
                />
              </Field>
              <Field label="Warehouse" required>
                <Input
                  readOnly
                  value={resolvedOrder?.warehouse_name ?? receipt?.warehouse_name ?? ""}
                  className="rounded-none bg-muted/40"
                />
              </Field>
              <Field label="Supplier delivery note">
                <Input
                  value={deliveryNote}
                  disabled={readOnly}
                  onChange={(e) => setDeliveryNote(e.target.value)}
                  placeholder="Optional reference"
                  className="rounded-none"
                />
              </Field>
              <Field label="Received by">
                <Input
                  value={receivedBy}
                  disabled={readOnly}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  placeholder="Who checked the delivery"
                  className="rounded-none"
                />
              </Field>
              <Field label="Notes">
                <Input
                  value={notes}
                  disabled={readOnly}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                  className="rounded-none"
                />
              </Field>
            </div>

            {fullyReceived && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Fully received — no remaining quantity.</p>
            )}

            <div className="flex justify-end">
              <ManageReceiptColumns visible={colVisible} onToggle={toggleVisible} />
            </div>
            <div className="overflow-x-auto border border-border">
              <table
                className="border-collapse text-[12px]"
                style={{
                  tableLayout: "fixed",
                  minWidth: colOrder
                    .filter((c) => colVisible[c])
                    .reduce((sum, c) => sum + colWidths[c], 0),
                }}
              >
                <colgroup>
                  {colOrder
                    .filter((c) => colVisible[c])
                    .map((c) => (
                      <col key={c} style={{ width: colWidths[c] }} />
                    ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
                    {colOrder
                      .filter((c) => colVisible[c])
                      .map((col) => (
                        <ReceiptLineHeaderCell
                          key={col}
                          col={col}
                          width={colWidths[col]}
                          dragCol={dragCol}
                          onDragColChange={setDragCol}
                          onMoveColumn={moveColumn}
                          onResizeStart={startResize}
                        />
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td
                        colSpan={colOrder.filter((c) => colVisible[c]).length}
                        className="px-2 py-3 text-xs text-muted-foreground"
                      >
                        Select a purchase order to load items.
                      </td>
                    </tr>
                  ) : (
                    lines.map((l) => {
                      const qty = Number.parseInt(l.qty, 10) || 0;
                      const serialsReady = l.serials.filter(Boolean).length;

                      const cell = (col: ReceiptCol) => {
                        switch (col) {
                          case "product":
                            return (
                              <td key={col} className="overflow-hidden px-2 py-1.5">
                                <div className="flex min-w-0 items-center gap-0.5">
                                  <div className="min-w-0 flex-1 overflow-hidden">
                                    <p className="truncate font-medium" title={l.name || undefined}>
                                      {l.name}
                                    </p>
                                    <p className="truncate font-mono text-[11px] text-muted-foreground">{l.sku}</p>
                                  </div>
                                  {l.productId ? (
                                    <button
                                      type="button"
                                      className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                      aria-label="View product"
                                      title="View product"
                                      onClick={() => setViewProductId(l.productId!)}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            );
                          case "ordered":
                            return (
                              <td key={col} className="px-2 py-1.5 text-right tabular-nums">
                                {l.ordered}
                              </td>
                            );
                          case "previouslyReceived":
                            return (
                              <td key={col} className="px-2 py-1.5 text-right tabular-nums">
                                {l.previouslyReceived}
                              </td>
                            );
                          case "remaining":
                            return (
                              <td key={col} className="px-2 py-1.5 text-right tabular-nums">
                                {l.remaining}
                              </td>
                            );
                          case "receiveNow":
                            return (
                              <td key={col} className="px-2 py-1.5">
                                <div className="flex items-center justify-end gap-1">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={resolvedOrder?.allow_over_receive ? undefined : l.remaining}
                                    value={l.qty}
                                    disabled={readOnly || l.remaining <= 0}
                                    onChange={(e) => setQty(l.lineId, e.target.value)}
                                    className="h-7 rounded-none text-right"
                                  />
                                  {canCorrect && l.receiptLineId ? (
                                    <button
                                      type="button"
                                      title="Admin: correct received quantity"
                                      className="shrink-0 text-muted-foreground hover:text-foreground"
                                      onClick={() => {
                                        setCorrectTarget({
                                          receiptLineId: l.receiptLineId!,
                                          sku: l.sku,
                                          name: l.name,
                                          currentQty: Number.parseInt(l.qty, 10) || 0,
                                        });
                                        setCorrectQty(l.qty);
                                        setCorrectReason("");
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            );
                          case "tracking":
                            return (
                              <td key={col} className="px-2 py-1.5 capitalize text-muted-foreground">
                                {l.tracking}
                              </td>
                            );
                          case "serialBatch":
                            return (
                              <td key={col} className="overflow-hidden px-2 py-1.5">
                                {l.tracking === "serial" ? (
                                  readOnly ? (
                                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                                      {(l.serials.filter(Boolean).length
                                        ? l.serials.filter(Boolean)
                                        : ["—"]
                                      ).join(", ")}
                                    </p>
                                  ) : (
                                    <button
                                      type="button"
                                      className="text-[11px] text-[#00a09d] hover:underline disabled:text-muted-foreground"
                                      disabled={qty <= 0}
                                      onClick={() => setSerialTarget(l)}
                                    >
                                      Manage serials {qty > 0 ? `(${serialsReady}/${qty})` : ""}
                                    </button>
                                  )
                                ) : l.tracking === "batch" ? (
                                  <div className="flex min-w-[160px] flex-col gap-1">
                                    <Input
                                      value={l.batchNumber}
                                      disabled={readOnly}
                                      placeholder="Batch / LOT"
                                      onChange={(e) =>
                                        setLines((rows) =>
                                          rows.map((row) =>
                                            row.lineId === l.lineId
                                              ? { ...row, batchNumber: e.target.value }
                                              : row,
                                          ),
                                        )
                                      }
                                      className="h-7 rounded-none"
                                    />
                                    <Input
                                      type="date"
                                      value={l.batchExpiry}
                                      disabled={readOnly}
                                      onChange={(e) =>
                                        setLines((rows) =>
                                          rows.map((row) =>
                                            row.lineId === l.lineId
                                              ? { ...row, batchExpiry: e.target.value }
                                              : row,
                                          ),
                                        )
                                      }
                                      className="h-7 rounded-none"
                                    />
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">None</span>
                                )}
                              </td>
                            );
                          default:
                            return null;
                        }
                      };

                      return (
                        <tr key={l.lineId} className="border-b border-border last:border-b-0">
                          {colOrder.filter((c) => colVisible[c]).map((col) => cell(col))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {correctTarget && (
              <div className="space-y-2 border border-amber-500/40 bg-amber-500/5 px-3 py-2.5">
                <p className="text-[12px] font-medium">
                  Correct received quantity — {correctTarget.name} ({correctTarget.sku})
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Admin only. Adjusts stock and the linked payable, and is written to a permanent audit trail.
                </p>
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">New quantity</label>
                    <Input
                      type="number"
                      min={0}
                      value={correctQty}
                      disabled={correcting}
                      onChange={(e) => setCorrectQty(e.target.value)}
                      className="h-7 w-24 rounded-none text-right"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] text-muted-foreground">Reason (required)</label>
                    <Input
                      value={correctReason}
                      disabled={correcting}
                      onChange={(e) => setCorrectReason(e.target.value)}
                      placeholder="e.g. 2 units were double counted"
                      className="h-7 rounded-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                    disabled={correcting}
                    onClick={() => setCorrectTarget(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
                    style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
                    disabled={correcting}
                    onClick={() => void submitCorrection()}
                  >
                    {correcting ? "Saving…" : "Save correction"}
                  </button>
                </div>
              </div>
            )}

            {receipt ? (
              <div className="space-y-1 border border-border px-3 py-2">
                <p className="text-[11px] font-medium uppercase text-muted-foreground">Activity</p>
                <p className="text-[12px]">Created {receipt.created_at.slice(0, 16).replace("T", " ")}</p>
                {receipt.posted_at ? (
                  <>
                    <p className="text-[12px]">Confirmed {receipt.posted_at.slice(0, 16).replace("T", " ")}</p>
                    <p className="text-[12px]">Inventory updated {receipt.posted_at.slice(0, 16).replace("T", " ")}</p>
                  </>
                ) : (
                  <p className="text-[12px] text-muted-foreground">Not confirmed — inventory not updated</p>
                )}
              </div>
            ) : null}

            {overReceiving && (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Receive now cannot exceed remaining quantity.
              </p>
            )}
            {serialMissing && (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Serial-tracked items need exactly one serial per received unit.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Confirming a receipt increases inventory. Saving a draft does not.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      <SerialsDrawer
        open={Boolean(serialTarget)}
        onOpenChange={(next) => {
          if (!next) setSerialTarget(null);
        }}
        product={serialTarget?.name ?? ""}
        required={Number.parseInt(serialTarget?.qty ?? "0", 10) || 0}
        value={serialTarget?.serials ?? []}
        onSave={(serials) => {
          if (!serialTarget) return;
          setLines((rows) =>
            rows.map((row) => (row.lineId === serialTarget.lineId ? { ...row, serials } : row)),
          );
        }}
      />
      <InventoryProductQuickAdd
        open={Boolean(viewProductId)}
        nested
        productId={viewProductId}
        onOpenChange={(next) => {
          if (!next) setViewProductId(null);
        }}
      />
    </>
  );
}

function remainingOfTotals(order: ApiPurchaseOrder) {
  return order.lines.reduce((sum, line) => sum + remainingOf(line), 0);
}
