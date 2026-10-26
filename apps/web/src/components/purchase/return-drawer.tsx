"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SearchDropdown } from "@/components/again/again-search-dropdown";
import {
  AgainFormRow,
  AgainUnderlineField,
  AgainUnderlineInput,
  AgainUnderlineSelect,
  AgainUnderlineTextarea,
} from "@/components/again/again-form-sheet";
import { AgainFormGroup, AgainFormNotebook } from "@/components/again/again-form-sheet-layout";
import {
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_CONTENT_CLASS,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
  AgainDrawerControlBar,
  AgainDrawerScrollBody,
  DrawerResizeHandle,
  useDrawerResize,
} from "@/components/again/again-drawer";
import { LineNumericInput } from "@/components/sales/sales-order-line-row-cells";
import { createPurchaseReturn, approvePurchaseReturn, creditPurchaseReturn, rejectPurchaseReturn, apiReturnToPurchaseReturn } from "@/lib/api/purchase-returns";
import { fetchPurchaseOrder, type ApiPurchaseOrder, type ApiPurchaseOrderLine } from "@/lib/api/purchase-orders";
import {
  RETURN_REASON_LABELS,
  RETURN_STATUS_LABELS,
  purchaseLineReturnable,
  type PurchaseReturn,
  type ReturnReason,
  type ReturnStatus,
} from "@/lib/mock-data/purchase-returns";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { printPurchaseReturn } from "@/lib/purchase/purchase-return-print";
import { cn, formatCurrency } from "@/lib/utils";

type ReturnTab = "lines" | "other";

type ReturnLineDraft = {
  lineId: string;
  sku: string;
  name: string;
  ordered: number;
  received: number;
  alreadyReturned: number;
  returnable: number;
  unitPrice: number;
  qty: number;
};

function money(value: string | number | null | undefined) {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function draftsFromOrder(order: ApiPurchaseOrder | null): ReturnLineDraft[] {
  return (order?.lines ?? []).map((line: ApiPurchaseOrderLine) => {
    const returnable = purchaseLineReturnable(line);
    return {
      lineId: line.id,
      sku: line.sku,
      name: line.name,
      ordered: line.quantity_ordered,
      received: line.quantity_received,
      alreadyReturned: line.quantity_returned ?? 0,
      returnable,
      unitPrice: money(line.unit_cost),
      qty: returnable,
    };
  });
}

function draftsFromRecord(
  record: PurchaseReturn,
  order: ApiPurchaseOrder | null,
): ReturnLineDraft[] {
  return (record.lines ?? []).map((line) => {
    const poLine = order?.lines.find((row) => row.id === line.poLineId);
    return {
      lineId: line.poLineId,
      sku: line.sku,
      name: line.name,
      ordered: poLine?.quantity_ordered ?? 0,
      received: poLine?.quantity_received ?? 0,
      alreadyReturned: poLine?.quantity_returned ?? line.quantityReturn,
      returnable: line.quantityReturn,
      unitPrice: line.unitPrice,
      qty: line.quantityReturn,
    };
  });
}

/** Request or view a return of received goods against a purchase order. */
export function ReturnDrawer({
  open,
  onOpenChange,
  orders,
  initialOrderId,
  record,
  onCreated,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: ApiPurchaseOrder[];
  initialOrderId?: string;
  record?: PurchaseReturn | null;
  onCreated?: () => void;
  onUpdated?: (row: PurchaseReturn) => void;
}) {
  const canWrite = useAdminCanWrite();
  const viewing = Boolean(record);
  const viewed = record ?? null;
  const eligible = useMemo(
    () => orders.filter((o) => o.lines.some((l) => purchaseLineReturnable(l) > 0)),
    [orders],
  );
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [viewOrder, setViewOrder] = useState<ApiPurchaseOrder | null>(null);
  const resolvedOrder = viewing
    ? viewOrder
    : (eligible.find((row) => row.id === selectedOrderId) ?? null);

  const initial = useMemo(() => {
    if (viewing && viewed) return draftsFromRecord(viewed, viewOrder);
    return draftsFromOrder(resolvedOrder);
  }, [viewing, viewed, viewOrder, resolvedOrder]);
  const [lines, setLines] = useState<ReturnLineDraft[]>(initial);
  const [reason, setReason] = useState<ReturnReason>("defective");
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [requestedBy, setRequestedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<ReturnTab>("lines");
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderQuery, setOrderQuery] = useState("");
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  const orderAnchorRef = useRef<HTMLDivElement | null>(null);
  const setRootEl = useCallback((el: HTMLDivElement | null) => {
    setPortalHost(el);
  }, []);
  const getOrderAnchor = useCallback(() => orderAnchorRef.current, []);

  const { width: drawerWidth, handleProps: drawerResizeHandle } = useDrawerResize({
    defaultWidth: 880,
    minWidth: 480,
    maxWidthRatio: 0.95,
    storageKey: "againerp:purchase-return-drawer-width",
  });

  useEffect(() => {
    if (!open) return;
    setTab("lines");
    setSaving(false);
    setViewOrder(null);
    if (record) {
      setSelectedOrderId(record.purchaseOrderId);
      setReason(record.reason);
      setReturnDate(String(record.requestDate ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10));
      setRequestedBy(record.requestedBy === "—" ? "" : record.requestedBy ?? "");
      setNotes(record.notes ?? "");
      setOrderOpen(false);
      setOrderQuery("");
      return;
    }
    const nextId =
      initialOrderId && eligible.some((o) => o.id === initialOrderId) ? initialOrderId : "";
    setSelectedOrderId(nextId);
    setReason("defective");
    setReturnDate(new Date().toISOString().slice(0, 10));
    setRequestedBy("");
    setNotes("");
    setOrderOpen(!nextId);
    setOrderQuery("");
  }, [open, eligible, initialOrderId, record]);

  useEffect(() => {
    if (!open || !record?.purchaseOrderId) return;
    let cancelled = false;
    void fetchPurchaseOrder(record.purchaseOrderId)
      .then((order) => {
        if (!cancelled) setViewOrder(order);
      })
      .catch(() => {
        if (!cancelled) setViewOrder(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, record?.purchaseOrderId]);

  useEffect(() => {
    setLines(initial);
  }, [initial]);

  useEffect(() => {
    if (!orderOpen) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (orderAnchorRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-again-search-dropdown]")) return;
      setOrderOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [orderOpen]);

  const setQty = (lineId: string, qty: number) =>
    setLines((rows) =>
      rows.map((r) =>
        r.lineId === lineId
          ? { ...r, qty: Math.max(0, Math.min(r.returnable, Math.round(qty))) }
          : r,
      ),
    );

  const payloadLines = lines.filter((l) => l.qty > 0);
  const overReturning = !viewing && payloadLines.some((l) => l.qty > l.returnable);
  const blocked = viewing || !resolvedOrder || payloadLines.length === 0 || overReturning || saving;
  const creditAmount = viewing
    ? (viewed?.creditAmount ?? payloadLines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0))
    : payloadLines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const status: ReturnStatus = viewed?.status ?? "requested";

  const orderResults = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    const rows = q
      ? eligible.filter((o) =>
          `${o.po_number} ${o.supplier_name ?? ""}`.toLowerCase().includes(q),
        )
      : eligible;
    return rows.slice(0, 16).map((o) => ({
      id: o.id,
      primary: o.po_number,
      secondary: o.supplier_name ?? "Supplier",
    }));
  }, [eligible, orderQuery]);

  const selectOrder = (id: string) => {
    setSelectedOrderId(id);
    setOrderOpen(false);
    setOrderQuery("");
  };

  const clearOrder = () => {
    setSelectedOrderId("");
    setOrderQuery("");
    setOrderOpen(true);
  };

  const submit = async () => {
    if (viewing || !resolvedOrder || blocked) return;
    setSaving(true);
    try {
      const created = await createPurchaseReturn({
        purchase_order_id: resolvedOrder.id,
        reason,
        return_date: returnDate || undefined,
        requested_by: requestedBy.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: payloadLines.map((l) => ({
          purchase_order_line_id: l.lineId,
          quantity_returned: l.qty,
          reason,
        })),
      });
      toast.success(`${created.return_number} requested`);
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create return");
    } finally {
      setSaving(false);
    }
  };

  const runStatus = async (action: "approve" | "reject" | "credit") => {
    if (!viewed) return;
    setSaving(true);
    try {
      const updated =
        action === "approve"
          ? await approvePurchaseReturn(viewed.id)
          : action === "reject"
            ? await rejectPurchaseReturn(viewed.id)
            : await creditPurchaseReturn(viewed.id);
      const next = apiReturnToPurchaseReturn(updated);
      onUpdated?.(next);
      toast.success(
        action === "approve"
          ? `${next.number} approved`
          : action === "reject"
            ? `${next.number} rejected`
            : `${next.number} credited — stock and AP updated`,
      );
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSaving(false);
    }
  };

  const supplierLabel =
    viewed?.supplierName?.trim() ||
    resolvedOrder?.supplier_name?.trim() ||
    "Supplier";
  const headerTitle = viewing
    ? (viewed?.number ?? "Return")
    : resolvedOrder
      ? resolvedOrder.po_number
      : "New";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Purchase return"
        side="right"
        closeButton="none"
        className={cn(AGAIN_DRAWER_CONTENT_CLASS, "sm:!max-w-none sm:!min-w-0")}
        style={{ width: `min(100vw, ${Math.round(drawerWidth)}px)`, maxWidth: "100vw" }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          const target = event.target;
          if (target instanceof Element && target.closest(".ag-root, .ag-theme-again-list")) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          const target = event.target;
          if (target instanceof Element && target.closest(".ag-root, .ag-theme-again-list")) {
            event.preventDefault();
          }
        }}
      >
        <DrawerResizeHandle {...drawerResizeHandle} />
        <div ref={setRootEl} className="relative flex h-full min-h-0 flex-col bg-background">
          <AgainDrawerControlBar>
            {viewing ? (
              <>
                {canWrite && status === "requested" ? (
                  <button
                    type="button"
                    className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
                    style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
                    disabled={saving}
                    onClick={() => void runStatus("approve")}
                  >
                    {saving ? "Saving…" : "Approve"}
                  </button>
                ) : null}
                {canWrite && status === "approved" ? (
                  <button
                    type="button"
                    className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
                    style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
                    disabled={saving}
                    onClick={() => void runStatus("credit")}
                  >
                    {saving ? "Saving…" : "Credit"}
                  </button>
                ) : null}
                {canWrite && status === "requested" ? (
                  <button
                    type="button"
                    className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                    disabled={saving}
                    onClick={() => void runStatus("reject")}
                  >
                    Reject
                  </button>
                ) : null}
                <button
                  type="button"
                  className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                  onClick={() =>
                    void printPurchaseReturn(viewed?.id ?? "").catch((err) =>
                      toast.error(err instanceof Error ? err.message : "Could not open the return for printing"),
                    )
                  }
                >
                  Print
                </button>
                <button
                  type="button"
                  className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
                  style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
                  disabled={blocked}
                  onClick={() => void submit()}
                >
                  {saving ? "Saving…" : "Create"}
                </button>
                <button
                  type="button"
                  className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                  onClick={() => onOpenChange(false)}
                >
                  Discard
                </button>
              </>
            )}
            <span className="ml-1 rounded-none border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
              {RETURN_STATUS_LABELS[status]}
            </span>
            <div className="ml-auto">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-none"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </AgainDrawerControlBar>

          <AgainDrawerScrollBody className="bg-white px-4 py-4 pt-0 dark:bg-muted/20 sm:px-6">
            <div className="-mx-4 sm:-mx-6">
              <div className="border-b border-border bg-background px-4 py-3 sm:px-6">
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-none border border-border/80 bg-[#00a09d] text-white"
                    aria-hidden
                  >
                    <FileText className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div className="relative min-w-0 flex-1" ref={orderAnchorRef}>
                    <p className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                      {headerTitle}
                    </p>
                    {viewing ? (
                      <p className="mt-0.5 min-w-0 truncate text-[12px] font-medium text-foreground">
                        {supplierLabel}
                        {viewed?.poNumber ? (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {viewed.poNumber}
                          </span>
                        ) : null}
                      </p>
                    ) : resolvedOrder && !orderOpen ? (
                      <div className="mt-0.5 flex min-w-0 items-center gap-0.5">
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-[#00a09d]/10 hover:text-[#00a09d]"
                          aria-label="Search received purchase orders"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setOrderOpen(true);
                            setOrderQuery(resolvedOrder.po_number);
                          }}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                          {supplierLabel}
                        </span>
                        <button
                          type="button"
                          onClick={clearOrder}
                          title="Change purchase order"
                          aria-label="Change purchase order"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="mt-0.5 flex min-w-0 items-center gap-0.5">
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-[#00a09d]/10 hover:text-[#00a09d]"
                          aria-label="Search received purchase orders"
                          aria-expanded={orderOpen}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setOrderOpen((openNow) => !openNow)}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <input
                          value={orderQuery}
                          onChange={(e) => {
                            setOrderQuery(e.target.value);
                            setOrderOpen(true);
                            if (!e.target.value) setSelectedOrderId("");
                          }}
                          onFocus={() => setOrderOpen(true)}
                          placeholder={
                            eligible.length
                              ? "Search received purchase order..."
                              : "No returnable orders"
                          }
                          className="h-6 min-w-0 flex-1 bg-transparent text-[12px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
                          autoFocus={orderOpen && !resolvedOrder}
                        />
                      </div>
                    )}
                    <SearchDropdown
                      open={!viewing && orderOpen}
                      getAnchor={getOrderAnchor}
                      portalContainer={portalHost}
                      items={orderResults}
                      onSelect={selectOrder}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <AgainFormGroup className="mb-2">
                <div>
                  <AgainFormRow label="Return date">
                    <AgainUnderlineField readOnly={viewing}>
                      {viewing ? (
                        <p className="min-h-[28px] py-1 text-[13px] leading-[1.3] text-foreground">
                          {returnDate || "—"}
                        </p>
                      ) : (
                        <input
                          type="date"
                          value={returnDate}
                          onChange={(e) => setReturnDate(e.target.value)}
                          className="h-8 w-full bg-transparent text-[13px] text-foreground outline-none"
                        />
                      )}
                    </AgainUnderlineField>
                  </AgainFormRow>
                  <AgainFormRow label="Reason">
                    <AgainUnderlineSelect
                      readOnly={viewing}
                      value={viewing ? RETURN_REASON_LABELS[reason] : reason}
                      onChange={(v) => setReason(v as ReturnReason)}
                    >
                      {Object.entries(RETURN_REASON_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </AgainUnderlineSelect>
                  </AgainFormRow>
                </div>
                <div>
                  <AgainFormRow label="Requested by">
                    <AgainUnderlineInput
                      readOnly={viewing}
                      value={requestedBy}
                      onChange={setRequestedBy}
                      placeholder="Name or staff"
                    />
                  </AgainFormRow>
                  <AgainFormRow label="Warehouse">
                    <AgainUnderlineField readOnly>
                      <p className="min-h-[28px] py-1 text-[13px] leading-[1.3] text-foreground">
                        {viewed?.warehouse || resolvedOrder?.warehouse_name || "—"}
                      </p>
                    </AgainUnderlineField>
                  </AgainFormRow>
                </div>
              </AgainFormGroup>
            </div>

            <div className="-mx-4 sm:-mx-6">
              <AgainFormNotebook
                tabs={[
                  { id: "lines" as const, label: "Return Lines" },
                  { id: "other" as const, label: "Other" },
                ]}
                active={tab}
                onChange={setTab}
                className="border-t-0"
                contentClassName="bg-transparent px-4 py-4 dark:bg-transparent sm:px-6"
              >
                {tab === "lines" ? (
                  <div>
                    <div className="overflow-x-auto">
                      <table
                        className="w-full min-w-[640px] border-collapse text-[13px]"
                        style={{ tableLayout: "fixed" }}
                      >
                        <colgroup>
                          <col style={{ width: 260 }} />
                          <col style={{ width: 72 }} />
                          <col style={{ width: 80 }} />
                          <col style={{ width: 80 }} />
                          <col style={{ width: 88 }} />
                          <col style={{ width: 96 }} />
                          <col style={{ width: 96 }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b border-border/80 text-left">
                            <th className="py-2 pr-3 font-semibold text-foreground">Product</th>
                            <th className="py-2 pr-3 text-right font-semibold text-foreground">
                              Ordered
                            </th>
                            <th className="py-2 pr-3 text-right font-semibold text-foreground">
                              Received
                            </th>
                            <th className="py-2 pr-3 text-right font-semibold text-foreground">
                              Returned
                            </th>
                            <th className="py-2 pr-3 text-right font-semibold text-foreground">
                              Returnable
                            </th>
                            <th className="py-2 pr-3 text-right font-semibold text-foreground">
                              Return qty
                            </th>
                            <th className="py-2 pr-1 text-right font-semibold text-foreground">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.length === 0 ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="border-b border-border/50 px-0 py-8 text-center text-[13px] text-muted-foreground"
                              >
                                {viewing
                                  ? "No lines on this return."
                                  : "Search a received purchase order to return lines."}
                              </td>
                            </tr>
                          ) : (
                            lines.map((line) => {
                              const over = line.qty > line.returnable;
                              const amount = line.qty * line.unitPrice;
                              const cellInput = cn(
                                "h-8 w-full border-b border-border/50 bg-transparent outline-none focus:border-[#00a09d]",
                                over && "border-destructive focus:border-destructive",
                              );
                              return (
                                <tr key={line.lineId} className="border-b border-border/50">
                                  <td className="py-1.5 pr-3 align-top">
                                    <p className="font-medium text-foreground">{line.name}</p>
                                    <p className="font-mono text-[11px] text-muted-foreground">
                                      {line.sku}
                                    </p>
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                                    {line.ordered}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums">
                                    {line.received}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                                    {line.alreadyReturned}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums">
                                    {line.returnable}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right">
                                    {viewing || line.returnable <= 0 ? (
                                      <span className="tabular-nums text-foreground">{line.qty}</span>
                                    ) : (
                                      <LineNumericInput
                                        value={line.qty}
                                        min={0}
                                        steppers
                                        step={1}
                                        onChange={(qty) => setQty(line.lineId, qty)}
                                        className={cn(cellInput, "text-right tabular-nums")}
                                      />
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-1 text-right tabular-nums font-medium">
                                    {formatCurrency(amount)}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    {overReturning ? (
                      <p className="mt-2 text-[12px] text-destructive">
                        Return qty cannot exceed received minus already returned.
                      </p>
                    ) : null}
                    <div className="mt-4 flex justify-end">
                      <div className="w-[min(100%,240px)] border border-border bg-background px-3 py-2.5 text-[12px] shadow-sm">
                        <div className="flex items-center justify-between gap-4 text-[13px] font-semibold text-foreground">
                          <span>Credit</span>
                          <span className="tabular-nums">{formatCurrency(creditAmount)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <AgainFormRow label="Notes">
                    <AgainUnderlineTextarea
                      readOnly={viewing}
                      value={notes}
                      onChange={setNotes}
                      rows={5}
                      placeholder="Internal note for this return"
                    />
                  </AgainFormRow>
                )}
              </AgainFormNotebook>
            </div>
          </AgainDrawerScrollBody>
        </div>
      </SheetContent>
    </Sheet>
  );
}
