"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
  AgainDrawerControlBar,
} from "@/components/again/again-drawer";
import { AgainFormNotebook } from "@/components/again/again-form-sheet-layout";
import { LineNumericInput } from "@/components/sales/sales-order-line-row-cells";
import {
  STOCK_LINE_CELL_INPUT,
  STOCK_LINE_LINK,
  StockLineDeleteBtn,
  StockProductSearchAdd,
} from "@/components/inventory/stock-line-search";
import { cn } from "@/lib/utils";
import { fetchStockLevels, type ApiStockLevel } from "@/lib/api/inventory";
import { fetchSerials, type InventorySerial } from "@/lib/api/inventory-serials";
import {
  cancelStockTransfer,
  createStockTransfer,
  fetchStockTransfer,
  receiveStockTransfer,
  shipStockTransfer,
  transferLabel,
  type ApiStockTransfer,
} from "@/lib/api/stock-transfers";
import { useAdminAuth } from "@/lib/store/admin-auth-store";

type DraftLine = {
  itemId: string;
  sku: string;
  name: string;
  available: number;
  tracking: "none" | "serial" | "batch";
  qty: string;
  serialIds: string[];
  batchNumber: string;
};

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

function SerialPickDrawer({
  open,
  onOpenChange,
  product,
  required,
  options,
  selected,
  onSave,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: string;
  required: number;
  options: { id: string; serial_number: string }[];
  selected: string[];
  onSave: (ids: string[]) => void;
  title?: string;
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  const complete = picked.length === required && required > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={title ?? `${product} — Serial Numbers`}
        resizable
        resizeMaxWidth={560}
        className="z-[260] flex min-w-[160px] w-[420px] max-w-[560px] flex-col gap-0 p-0"
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title ?? `${product} — Serial Numbers`}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Selected: {picked.length} / {required}
            {complete ? " · Serial selection complete" : ""}
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-3">
          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground">No serials available.</p>
          ) : (
            options.map((row) => {
              const on = picked.includes(row.id);
              return (
                <label
                  key={row.id}
                  className="flex cursor-pointer items-center gap-2 border border-border px-2 py-1.5 text-[12px]"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      setPicked((current) => {
                        if (on) return current.filter((id) => id !== row.id);
                        if (current.length >= required) return current;
                        return [...current, row.id];
                      });
                    }}
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-border bg-background checked:border-[#00a09d] checked:bg-[#00a09d]"
                  />
                  <span className="font-mono">{row.serial_number}</span>
                </label>
              );
            })
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" className="rounded-none" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-none"
            disabled={!complete}
            onClick={() => {
              onSave(picked);
              onOpenChange(false);
            }}
          >
            Save serials
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type NotebookTab = "lines" | "activity";

function trackingOf(row: ApiStockLevel): DraftLine["tracking"] {
  if (row.tracking_type === "serial" || row.tracking_type === "batch") return row.tracking_type;
  return "none";
}

function TransferTimeline({ transfer }: { transfer: ApiStockTransfer }) {
  const created = true;
  const shipped = Boolean(transfer.shipped_at) || ["in_transit", "partial_received", "completed"].includes(transfer.status);
  const partial = transfer.status === "partial_received";
  const received = transfer.status === "completed";
  const cancelled = transfer.status === "cancelled";
  const step = (done: boolean, label: string) => (
    <span className={done ? "text-foreground" : "text-muted-foreground"}>
      {label} {done ? "✓" : "○"}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border border-border px-3 py-2 text-[12px]">
      <p className="w-full text-[11px] font-medium uppercase text-muted-foreground">Transfer timeline</p>
      {step(created, "Created")}
      {step(shipped, "Shipped")}
      {step(partial || received, partial ? "Partially received" : "Received")}
      {cancelled ? <span className="text-red-600 dark:text-red-400">Cancelled ✓</span> : null}
    </div>
  );
}

export function StockTransferDrawer({
  open,
  onOpenChange,
  warehouses,
  transfer,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouses: { id: string; name: string; is_active?: boolean }[];
  transfer?: ApiStockTransfer | null;
  onChanged?: () => void;
}) {
  const requestedBy = useAdminAuth((s) => s.user?.name) ?? "";
  const [detail, setDetail] = useState<ApiStockTransfer | null>(transfer ?? null);
  const current = detail ?? transfer ?? null;
  const view = Boolean(current);
  const canShip = current?.status === "draft";
  const canReceive = current?.status === "in_transit" || current?.status === "partial_received";
  const readOnlyCreate = view && !canShip;

  const [fromId, setFromId] = useState(transfer?.from_warehouse_id ?? "");
  const [toId, setToId] = useState(transfer?.to_warehouse_id ?? "");
  const [transferDate, setTransferDate] = useState(
    () => transfer?.transfer_date ?? new Date().toISOString().slice(0, 10),
  );
  const [reference, setReference] = useState(transfer?.reference_number ?? "");
  const [notes, setNotes] = useState(transfer?.notes ?? "");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [stock, setStock] = useState<ApiStockLevel[]>([]);
  const [saving, setSaving] = useState(false);
  const [notebookTab, setNotebookTab] = useState<NotebookTab>("lines");
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [serialTarget, setSerialTarget] = useState<DraftLine | null>(null);
  const [availableSerials, setAvailableSerials] = useState<InventorySerial[]>([]);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>(() =>
    Object.fromEntries((transfer?.lines ?? []).map((line) => [line.id, String(line.remaining_qty)])),
  );
  const [receiveSerials, setReceiveSerials] = useState<Record<string, string[]>>({});
  const [receivePick, setReceivePick] = useState<ApiStockTransfer["lines"][number] | null>(null);

  useEffect(() => {
    if (!open) return;
    setNotebookTab("lines");
  }, [open]);

  useEffect(() => {
    if (!open || !transfer?.id) return;
    let cancelled = false;
    void fetchStockTransfer(transfer.id)
      .then((row) => {
        if (cancelled) return;
        setDetail(row);
        setReceiveQty(
          Object.fromEntries(row.lines.map((line) => [line.id, String(line.remaining_qty)])),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, transfer?.id]);

  useEffect(() => {
    if (!open || !fromId || transfer) return;
    let cancelled = false;
    void fetchStockLevels({ warehouse_id: fromId, limit: 1000 })
      .then((rows) => {
        if (!cancelled) setStock(rows.filter((row) => row.available > 0 && row.item_id));
      })
      .catch(() => {
        if (!cancelled) setStock([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, fromId, transfer]);

  const sameWarehouse = Boolean(fromId && toId && fromId === toId);
  const warehouseOptions = warehouses
    .filter((w) => view || w.is_active !== false)
    .map((w) => ({ value: w.id, label: w.name }));
  const fromName = warehouses.find((w) => w.id === fromId)?.name ?? current?.from_warehouse_name ?? "";
  const toName = warehouses.find((w) => w.id === toId)?.name ?? current?.to_warehouse_name ?? "";

  const addLine = (itemId: string, fromStock?: ApiStockLevel) => {
    const row = fromStock ?? stock.find((s) => s.item_id === itemId || s.id === itemId);
    const lineId = row?.item_id || row?.id;
    if (!row || !lineId) return;
    setLines((currentLines) => {
      if (currentLines.some((l) => l.itemId === lineId || l.sku === row.sku)) {
        return currentLines;
      }
      return [
        ...currentLines,
        {
          itemId: lineId,
          sku: row.sku,
          name: row.name,
          available: row.available,
          tracking: trackingOf(row),
          qty: "1",
          serialIds: [],
          batchNumber: "",
        },
      ];
    });
  };

  const loadStockItems = () => {
    const next: DraftLine[] = [];
    for (const row of stock) {
      const lineId = row.item_id || row.id;
      if (!lineId) continue;
      if (next.some((l) => l.itemId === lineId)) continue;
      next.push({
        itemId: lineId,
        sku: row.sku,
        name: row.name,
        available: row.available,
        tracking: trackingOf(row),
        qty: "0",
        serialIds: [],
        batchNumber: "",
      });
    }
    setLines(next);
  };

  const overQty = lines.some((l) => (Number.parseInt(l.qty, 10) || 0) > l.available);
  const serialMissing = lines.some((l) => {
    const qty = Number.parseInt(l.qty, 10) || 0;
    return l.tracking === "serial" && qty > 0 && l.serialIds.length !== qty;
  });
  const batchMissing = lines.some((l) => {
    const qty = Number.parseInt(l.qty, 10) || 0;
    return l.tracking === "batch" && qty > 0 && !l.batchNumber.trim();
  });
  const payloadLines = lines.filter((l) => (Number.parseInt(l.qty, 10) || 0) > 0);
  const blocked =
    sameWarehouse ||
    !fromId ||
    !toId ||
    payloadLines.length === 0 ||
    overQty ||
    serialMissing ||
    batchMissing;

  const title = current ? current.transfer_number : "New Stock Transfer";

  const submitDraft = async (ship: boolean) => {
    if (blocked) return;
    setSaving(true);
    try {
      const created = await createStockTransfer({
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        transfer_date: transferDate || undefined,
        reference_number: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: payloadLines.map((l) => ({
          item_id: l.itemId,
          quantity: Number.parseInt(l.qty, 10),
          serial_ids: l.tracking === "serial" ? l.serialIds : undefined,
          notes: l.tracking === "batch" && l.batchNumber.trim() ? `BATCH:${l.batchNumber.trim()}` : undefined,
        })),
      });
      if (ship) {
        await shipStockTransfer(created.id);
        toast.success(`${created.transfer_number} shipped — source stock reduced`);
      } else {
        toast.success(`${created.transfer_number} saved as draft`);
      }
      onOpenChange(false);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSaving(false);
    }
  };

  const shipExisting = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const shipped = await shipStockTransfer(current.id);
      toast.success(`${shipped.transfer_number} shipped — source stock reduced`);
      onOpenChange(false);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ship failed");
    } finally {
      setSaving(false);
    }
  };

  const receiveExisting = async () => {
    if (!current) return;
    const payload = current.lines
      .map((line) => ({
        line_id: line.id,
        quantity: Number.parseInt(receiveQty[line.id] ?? "0", 10) || 0,
        serial_ids: receiveSerials[line.id] ?? [],
      }))
      .filter((line) => line.quantity > 0);
    if (!payload.length) return;
    const serialBad = current.lines.some((line) => {
      const qty = Number.parseInt(receiveQty[line.id] ?? "0", 10) || 0;
      if (line.tracking_type !== "serial" || qty <= 0) return false;
      return (receiveSerials[line.id] ?? []).length !== qty;
    });
    if (serialBad) {
      toast.error("Serial-tracked lines need exactly one in-transit serial per unit");
      return;
    }
    setSaving(true);
    try {
      const received = await receiveStockTransfer(current.id, { lines: payload });
      toast.success(`${received.transfer_number} received`);
      onOpenChange(false);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Receive failed");
    } finally {
      setSaving(false);
    }
  };

  const openSerials = async (line: DraftLine) => {
    const qty = Number.parseInt(line.qty, 10) || 0;
    if (qty <= 0) return;
    setSerialTarget(line);
    try {
      const res = await fetchSerials({
        item_id: line.itemId,
        warehouse_id: fromId,
        status: "in_stock",
      });
      setAvailableSerials(res.data);
    } catch {
      setAvailableSerials([]);
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
            {!view && (
              <>
                <button
                  type="button"
                  className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
                  style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
                  disabled={blocked || saving}
                  onClick={() => void submitDraft(true)}
                >
                  {saving ? "Shipping…" : "Ship transfer"}
                </button>
                <button
                  type="button"
                  className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                  disabled={blocked || saving}
                  onClick={() => void submitDraft(false)}
                >
                  Save draft
                </button>
              </>
            )}
            {canShip && (
              <button
                type="button"
                className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
                style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
                disabled={saving}
                onClick={() => void shipExisting()}
              >
                {saving ? "Shipping…" : "Ship transfer"}
              </button>
            )}
            {canReceive && (
              <button
                type="button"
                className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
                style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
                disabled={saving}
                onClick={() => void receiveExisting()}
              >
                {saving ? "Receiving…" : "Receive stock"}
              </button>
            )}
            {current?.status === "draft" && (
              <button
                type="button"
                className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await cancelStockTransfer(current.id);
                    toast.success(`${current.transfer_number} cancelled`);
                    onOpenChange(false);
                    onChanged?.();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Cancel failed");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
              onClick={() => onOpenChange(false)}
            >
              Close
            </button>
            <span className="ml-1 text-[13px] font-medium text-foreground">{title}</span>
            {current ? (
              <span className="text-[11px] text-muted-foreground">{transferLabel(current.status)}</span>
            ) : null}
          </AgainDrawerControlBar>

          <div
            ref={setPortalHost}
            className={cn("min-h-0 flex-1 space-y-3 overflow-y-auto", AGAIN_DRAWER_FIELD_SHEET_CLASS)}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Transfer No">
                <Input
                  readOnly
                  value={current?.transfer_number ?? "Auto (TR-YYYY-####)"}
                  className="rounded-none bg-muted/40 font-mono"
                />
              </Field>
              <Field label="Transfer Date" required>
                <Input
                  type="date"
                  value={transferDate}
                  disabled={readOnlyCreate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="rounded-none"
                />
              </Field>
              <Field label="From Warehouse" required>
                {view ? (
                  <Input readOnly value={fromName} className="rounded-none bg-muted/40" />
                ) : (
                  <FilterSelect
                    value={fromId}
                    onChange={(id) => {
                      setFromId(id);
                      setLines([]);
                    }}
                    width="w-full"
                    ariaLabel="From warehouse"
                    options={[{ value: "", label: "Select warehouse" }, ...warehouseOptions]}
                  />
                )}
              </Field>
              <Field label="To Warehouse" required>
                {view ? (
                  <Input readOnly value={toName} className="rounded-none bg-muted/40" />
                ) : (
                  <FilterSelect
                    value={toId}
                    onChange={setToId}
                    width="w-full"
                    ariaLabel="To warehouse"
                    options={[{ value: "", label: "Select warehouse" }, ...warehouseOptions]}
                  />
                )}
              </Field>
              <Field label="Reference No">
                <Input
                  value={view ? current?.reference_number ?? "" : reference}
                  disabled={readOnlyCreate}
                  onChange={(e) => setReference(e.target.value)}
                  className="rounded-none"
                />
              </Field>
              <Field label="Requested By">
                <Input
                  readOnly
                  value={current?.requested_by_name ?? requestedBy}
                  className="rounded-none bg-muted/40"
                />
              </Field>
              <Field label="Notes">
                <Input
                  value={view ? current?.notes ?? "" : notes}
                  disabled={readOnlyCreate}
                  onChange={(e) => setNotes(e.target.value)}
                  className="rounded-none"
                />
              </Field>
            </div>
            {sameWarehouse && (
              <p className="text-[12px] text-red-600 dark:text-red-400">
                Source and destination warehouse must be different.
              </p>
            )}

            <div className="-mx-4 sm:-mx-6">
              <AgainFormNotebook
                tabs={[
                  {
                    id: "lines" as const,
                    label: "Transfer Lines",
                    badge: view ? current?.lines.length : lines.length,
                    badgeTone: "neutral",
                  },
                  ...(view && current && current.events.length > 0
                    ? [
                        {
                          id: "activity" as NotebookTab,
                          label: "Activity",
                          badge: current.events.length,
                          badgeTone: "neutral" as const,
                        },
                      ]
                    : []),
                ]}
                active={notebookTab}
                onChange={(id) => setNotebookTab(id)}
                className="border-t-0"
                contentClassName="bg-transparent px-4 py-4 dark:bg-transparent sm:px-4"
              >
                {notebookTab === "activity" && view && current ? (
                  <div className="space-y-1">
                    {current.events.map((event) => (
                      <p key={event.id} className="text-[13px]">
                        {event.action}
                        {event.performed_by_name ? ` · ${event.performed_by_name}` : ""} ·{" "}
                        {event.created_at.slice(0, 16).replace("T", " ")}
                      </p>
                    ))}
                  </div>
                ) : view && current ? (
                  <>
                    <TransferTimeline transfer={current} />
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[720px] border-collapse text-[13px]">
                        <thead>
                          <tr className="border-b border-border/80 text-left text-muted-foreground">
                            <th className="py-2 pr-2.5 font-medium">Product</th>
                            <th className="py-2 pr-2.5 text-right font-medium">Transferred</th>
                            <th className="py-2 pr-2.5 text-right font-medium">Received</th>
                            <th className="py-2 pr-2.5 text-right font-medium">Remaining</th>
                            {canReceive ? (
                              <th className="w-[110px] py-2 pr-2.5 text-right font-medium">Receive now</th>
                            ) : null}
                            <th className="py-2 font-medium">Serial / Batch</th>
                          </tr>
                        </thead>
                        <tbody>
                          {current.lines.map((line) => (
                            <tr key={line.id} className="border-b border-border/80">
                              <td className="py-1.5 pr-2.5 align-top">
                                <div className="flex min-w-0 items-center gap-0.5 border-b border-border/50">
                                  <p className="h-8 min-w-0 flex-1 overflow-hidden truncate text-[13px] leading-8">
                                    {line.name}
                                  </p>
                                </div>
                                <p className="font-mono text-[11px] text-muted-foreground">{line.sku}</p>
                              </td>
                              <td className="py-1.5 pr-2.5 text-right tabular-nums leading-8">{line.quantity}</td>
                              <td className="py-1.5 pr-2.5 text-right tabular-nums leading-8">{line.received_qty}</td>
                              <td className="py-1.5 pr-2.5 text-right tabular-nums leading-8">{line.remaining_qty}</td>
                              {canReceive ? (
                                <td className="py-1.5 pr-2.5">
                                  <LineNumericInput
                                    value={Number.parseInt(receiveQty[line.id] ?? "0", 10) || 0}
                                    min={0}
                                    steppers
                                    onChange={(value) =>
                                      setReceiveQty((currentQty) => ({
                                        ...currentQty,
                                        [line.id]: String(Math.min(value, line.remaining_qty)),
                                      }))
                                    }
                                    className={STOCK_LINE_CELL_INPUT}
                                  />
                                </td>
                              ) : null}
                              <td className="py-1.5 font-mono text-[11px] text-muted-foreground">
                                {line.tracking_type === "serial" ? (
                                  canReceive && line.remaining_qty > 0 ? (
                                    <button
                                      type="button"
                                      className={cn(STOCK_LINE_LINK, "h-8 text-[13px] leading-8")}
                                      onClick={() => setReceivePick(line)}
                                    >
                                      Select serials ({(receiveSerials[line.id] ?? []).length}/
                                      {Number.parseInt(receiveQty[line.id] ?? "0", 10) || 0})
                                    </button>
                                  ) : (
                                    line.serials.map((s) => s.serial_number).join(", ") || "—"
                                  )
                                ) : (
                                  line.tracking_type
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <StockProductSearchAdd
                        items={stock.filter((row) => !lines.some((l) => l.itemId === (row.item_id ?? row.id)))}
                        disabled={!fromId}
                        placeholder={
                          fromId ? "Enter product name / SKU" : "Select from warehouse first"
                        }
                        portalHost={portalHost}
                        itemSecondary={(row) => `${row.sku} · avail ${row.available}`}
                        onPick={(row) => addLine(row.item_id ?? row.id, row)}
                      />
                      <button
                        type="button"
                        className={cn(STOCK_LINE_LINK, "shrink-0 disabled:opacity-40")}
                        disabled={!fromId || stock.length === 0}
                        onClick={loadStockItems}
                      >
                        Load stock items
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] border-collapse text-[13px]">
                        <thead>
                          <tr className="border-b border-border/80 text-left text-muted-foreground">
                            <th className="py-2 pr-2.5 font-medium">Product</th>
                            <th className="w-[88px] py-2 pr-2.5 text-right font-medium">Available</th>
                            <th className="w-[110px] py-2 pr-2.5 text-right font-medium">Transfer qty</th>
                            <th className="w-[160px] py-2 font-medium">Serial / Batch</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-[13px] text-muted-foreground">
                                {fromId
                                  ? "Search a product above, or load source warehouse stock."
                                  : "Select a from warehouse, then add products."}
                              </td>
                            </tr>
                          ) : (
                            lines.map((line) => {
                              const qty = Number.parseInt(line.qty, 10) || 0;
                              return (
                                <tr key={line.itemId} className="group border-b border-border/80">
                                  <td className="relative py-1.5 pr-2.5 align-top">
                                    <div className="flex min-w-0 items-center gap-0.5 border-b border-border/50">
                                      <p
                                        className="h-8 min-w-0 flex-1 overflow-hidden truncate text-[13px] leading-8"
                                        title={line.name}
                                      >
                                        {line.name}
                                      </p>
                                    </div>
                                    <p className="font-mono text-[11px] text-muted-foreground">{line.sku}</p>
                                  </td>
                                  <td className="py-1.5 pr-2.5 text-right tabular-nums leading-8 text-muted-foreground">
                                    {line.available}
                                  </td>
                                  <td className="py-1.5 pr-2.5">
                                    <LineNumericInput
                                      value={qty}
                                      min={0}
                                      steppers
                                      onChange={(value) =>
                                        setLines((rows) =>
                                          rows.map((row) =>
                                            row.itemId === line.itemId
                                              ? { ...row, qty: String(Math.min(value, row.available)) }
                                              : row,
                                          ),
                                        )
                                      }
                                      className={STOCK_LINE_CELL_INPUT}
                                    />
                                  </td>
                                  <td className="relative py-1.5 pr-6">
                                    {line.tracking === "serial" ? (
                                      <button
                                        type="button"
                                        className={cn(
                                          STOCK_LINE_LINK,
                                          "h-8 text-[13px] leading-8 disabled:opacity-40",
                                        )}
                                        disabled={qty <= 0}
                                        onClick={() => void openSerials(line)}
                                      >
                                        Manage serials ({line.serialIds.length}/{qty})
                                      </button>
                                    ) : line.tracking === "batch" ? (
                                      <input
                                        value={line.batchNumber}
                                        placeholder="Batch / LOT"
                                        onChange={(e) =>
                                          setLines((rows) =>
                                            rows.map((row) =>
                                              row.itemId === line.itemId
                                                ? { ...row, batchNumber: e.target.value }
                                                : row,
                                            ),
                                          )
                                        }
                                        className="h-8 min-w-0 w-full border-b border-border/50 bg-transparent text-[13px] outline-none focus:border-[#00a09d]"
                                      />
                                    ) : (
                                      <span className="text-[13px] leading-8 text-muted-foreground">
                                        Quantity only
                                      </span>
                                    )}
                                    <StockLineDeleteBtn
                                      onRemove={() =>
                                        setLines((rows) => rows.filter((row) => row.itemId !== line.itemId))
                                      }
                                    />
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    {overQty && (
                      <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">
                        Transfer quantity cannot exceed available stock.
                      </p>
                    )}
                    {serialMissing && (
                      <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">
                        Serial-tracked products need exactly one serial per transferred unit.
                      </p>
                    )}
                    {batchMissing && (
                      <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">
                        Batch-tracked products need a batch / LOT number.
                      </p>
                    )}
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      Shipping reduces source stock and holds quantity in transit until the destination receives it.
                    </p>
                  </>
                )}
              </AgainFormNotebook>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <SerialPickDrawer
        key={`ship:${serialTarget?.itemId ?? "none"}`}
        open={Boolean(serialTarget)}
        onOpenChange={(next) => {
          if (!next) setSerialTarget(null);
        }}
        product={serialTarget?.name ?? ""}
        required={Number.parseInt(serialTarget?.qty ?? "0", 10) || 0}
        options={availableSerials.map((row) => ({ id: row.id, serial_number: row.serial_number }))}
        selected={serialTarget?.serialIds ?? []}
        onSave={(ids) => {
          if (!serialTarget) return;
          setLines((rows) =>
            rows.map((row) => (row.itemId === serialTarget.itemId ? { ...row, serialIds: ids } : row)),
          );
        }}
      />

      <SerialPickDrawer
        key={`recv:${receivePick?.id ?? "none"}`}
        open={Boolean(receivePick)}
        onOpenChange={(next) => {
          if (!next) setReceivePick(null);
        }}
        product={receivePick?.name ?? ""}
        required={Number.parseInt(receiveQty[receivePick?.id ?? ""] ?? "0", 10) || 0}
        options={(receivePick?.serials ?? [])
          .filter((row) => row.status === "shipped")
          .map((row) => ({ id: row.serial_id, serial_number: row.serial_number }))}
        selected={receiveSerials[receivePick?.id ?? ""] ?? []}
        title={`${receivePick?.name ?? ""} — In transit serials`}
        onSave={(ids) => {
          if (!receivePick) return;
          setReceiveSerials((current) => ({ ...current, [receivePick.id]: ids }));
        }}
      />
    </>
  );
}
