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
  ADJUSTMENT_REASONS,
  applyStockAdjustment,
  cancelStockAdjustment,
  createStockAdjustment,
  fetchStockAdjustment,
  adjustmentLabel,
  adjustmentTypeLabel,
  formatDiff,
  type ApiStockAdjustment,
} from "@/lib/api/stock-adjustments";
import { useAdminAuth } from "@/lib/store/admin-auth-store";

type DraftLine = {
  itemId: string;
  sku: string;
  name: string;
  available: number;
  systemQty: number;
  tracking: "none" | "serial" | "batch";
  physical: string;
  keepSerialIds: string[];
  addSerials: string[];
  batchNumber: string;
  /** Search-picked lines stay visible even when "Only differences" is on. */
  pinned?: boolean;
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

type NotebookTab = "lines" | "activity";

function trackingOf(row: ApiStockLevel): DraftLine["tracking"] {
  if (row.tracking_type === "serial" || row.tracking_type === "batch") return row.tracking_type;
  return "none";
}

export function StockAdjustmentDrawer({
  open,
  onOpenChange,
  warehouses,
  adjustment,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouses: { id: string; name: string; is_active?: boolean }[];
  adjustment?: ApiStockAdjustment | null;
  onChanged?: () => void;
}) {
  const requestedBy = useAdminAuth((s) => s.user?.name) ?? "";
  const [detail, setDetail] = useState<ApiStockAdjustment | null>(adjustment ?? null);
  const current = detail ?? adjustment ?? null;
  const view = Boolean(current);
  const canApply = current?.status === "draft";

  const [warehouseId, setWarehouseId] = useState(adjustment?.warehouse_id ?? "");
  const [adjustmentDate, setAdjustmentDate] = useState(
    () => adjustment?.adjustment_date ?? new Date().toISOString().slice(0, 10),
  );
  const [reason, setReason] = useState(adjustment?.reason ?? "physical_count");
  const [reasonDetails, setReasonDetails] = useState(adjustment?.reason_details ?? "");
  const [reference, setReference] = useState(adjustment?.reference_number ?? "");
  const [notes, setNotes] = useState(adjustment?.notes ?? "");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [stock, setStock] = useState<ApiStockLevel[]>([]);
  const [hideZeros, setHideZeros] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notebookTab, setNotebookTab] = useState<NotebookTab>("lines");
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [serialTarget, setSerialTarget] = useState<DraftLine | null>(null);
  const [availableSerials, setAvailableSerials] = useState<InventorySerial[]>([]);
  const [addDraft, setAddDraft] = useState("");

  useEffect(() => {
    if (!open) return;
    setNotebookTab("lines");
  }, [open]);

  useEffect(() => {
    if (!open || !adjustment?.id) return;
    let cancelled = false;
    void fetchStockAdjustment(adjustment.id)
      .then((row) => {
        if (!cancelled) setDetail(row);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, adjustment]);

  useEffect(() => {
    if (!open || !warehouseId || adjustment) return;
    let cancelled = false;
    void fetchStockLevels({ warehouse_id: warehouseId, limit: 1000 })
      .then((rows) => {
        if (!cancelled) setStock(rows.filter((row) => row.item_id));
      })
      .catch(() => {
        if (!cancelled) setStock([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, warehouseId, adjustment]);

  const warehouseName =
    warehouses.find((w) => w.id === warehouseId)?.name ?? current?.warehouse_name ?? "";
  const warehouseOptions = warehouses
    .filter((w) => view || w.is_active !== false)
    .map((w) => ({ value: w.id, label: w.name }));

  const addLine = (itemId: string, fromStock?: ApiStockLevel) => {
    const row =
      fromStock ??
      stock.find((s) => s.item_id === itemId || s.id === itemId);
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
          systemQty: row.on_hand,
          tracking: trackingOf(row),
          physical: String(row.on_hand),
          keepSerialIds: [],
          addSerials: [],
          batchNumber: "",
          pinned: true,
        },
      ];
    });
  };

  const loadStockItems = () => {
    const next: DraftLine[] = [];
    for (const row of stock) {
      if (!row.item_id) continue;
      if (next.some((l) => l.itemId === row.item_id)) continue;
      next.push({
        itemId: row.item_id,
        sku: row.sku,
        name: row.name,
        available: row.available,
        systemQty: row.on_hand,
        tracking: trackingOf(row),
        physical: String(row.on_hand),
        keepSerialIds: [],
        addSerials: [],
        batchNumber: "",
      });
    }
    setLines(next);
  };

  const parsed = lines.map((line) => {
    const physical = Number.parseInt(line.physical, 10);
    const qty = Number.isFinite(physical) ? physical : 0;
    return { ...line, physicalQty: qty, diff: qty - line.systemQty };
  });
  const visible = hideZeros ? parsed.filter((l) => l.diff !== 0 || l.pinned) : parsed;
  const payloadLines = parsed.filter((l) => l.diff !== 0);
  const negativePhysical = parsed.some((l) => l.physicalQty < 0);
  const serialMissing = payloadLines.some((l) => {
    if (l.tracking !== "serial") return false;
    if (l.diff < 0) return l.keepSerialIds.length !== l.physicalQty;
    if (l.diff > 0) return l.addSerials.filter(Boolean).length !== l.diff;
    return false;
  });
  const batchMissing = payloadLines.some(
    (l) => l.tracking === "batch" && !l.batchNumber.trim(),
  );
  const otherMissing = reason === "other" && !reasonDetails.trim();
  const blocked =
    !warehouseId ||
    !reason ||
    otherMissing ||
    payloadLines.length === 0 ||
    negativePhysical ||
    serialMissing ||
    batchMissing;

  const title = current ? current.adjustment_number : "New Stock Adjustment";

  const submit = async (apply: boolean) => {
    if (blocked) return;
    setSaving(true);
    try {
      const created = await createStockAdjustment({
        warehouse_id: warehouseId,
        adjustment_date: adjustmentDate || undefined,
        reason,
        reason_details: reasonDetails.trim() || undefined,
        reference_number: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: payloadLines.map((l) => ({
          item_id: l.itemId,
          physical_qty: l.physicalQty,
          notes: l.tracking === "batch" && l.batchNumber.trim() ? `BATCH:${l.batchNumber.trim()}` : undefined,
          keep_serial_ids: l.tracking === "serial" && l.diff < 0 ? l.keepSerialIds : undefined,
          add_serial_numbers:
            l.tracking === "serial" && l.diff > 0 ? l.addSerials.filter(Boolean) : undefined,
        })),
      });
      if (apply) {
        await applyStockAdjustment(created.id);
        toast.success(`${created.adjustment_number} applied — warehouse stock updated`);
      } else {
        toast.success(`${created.adjustment_number} saved as draft`);
      }
      onOpenChange(false);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Adjustment failed");
    } finally {
      setSaving(false);
    }
  };

  const applyExisting = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const applied = await applyStockAdjustment(current.id);
      toast.success(`${applied.adjustment_number} applied — warehouse stock updated`);
      onOpenChange(false);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setSaving(false);
    }
  };

  const openSerials = async (line: DraftLine) => {
    setSerialTarget(line);
    setAddDraft("");
    try {
      const res = await fetchSerials({
        item_id: line.itemId,
        warehouse_id: warehouseId,
        status: "in_stock",
      });
      setAvailableSerials(res.data);
      if (line.keepSerialIds.length === 0 && Number.parseInt(line.physical, 10) >= line.systemQty) {
        setLines((rows) =>
          rows.map((row) =>
            row.itemId === line.itemId
              ? { ...row, keepSerialIds: res.data.map((s) => s.id) }
              : row,
          ),
        );
      }
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
                  onClick={() => void submit(true)}
                >
                  {saving ? "Applying…" : "Apply adjustment"}
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
            {canApply && (
              <button
                type="button"
                className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
                style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
                disabled={saving}
                onClick={() => void applyExisting()}
              >
                {saving ? "Applying…" : "Apply adjustment"}
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
                    await cancelStockAdjustment(current.id);
                    toast.success(`${current.adjustment_number} cancelled`);
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
              <span className="text-[11px] text-muted-foreground">
                {adjustmentLabel(current.status)} · {adjustmentTypeLabel(current.adjustment_type)}
              </span>
            ) : null}
          </AgainDrawerControlBar>

          <div
            ref={setPortalHost}
            className={cn("min-h-0 flex-1 space-y-3 overflow-y-auto", AGAIN_DRAWER_FIELD_SHEET_CLASS)}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Adjustment No">
                <Input
                  readOnly
                  value={current?.adjustment_number ?? "Auto (ADJ-YYYY-####)"}
                  className="rounded-none bg-muted/40 font-mono"
                />
              </Field>
              <Field label="Adjustment Date" required>
                <Input
                  type="date"
                  value={adjustmentDate}
                  disabled={view}
                  onChange={(e) => setAdjustmentDate(e.target.value)}
                  className="rounded-none"
                />
              </Field>
              <Field label="Warehouse" required>
                {view ? (
                  <Input readOnly value={warehouseName} className="rounded-none bg-muted/40" />
                ) : (
                  <FilterSelect
                    value={warehouseId}
                    onChange={(id) => {
                      setWarehouseId(id);
                      setLines([]);
                    }}
                    width="w-full"
                    ariaLabel="Warehouse"
                    options={[{ value: "", label: "Select warehouse" }, ...warehouseOptions]}
                  />
                )}
              </Field>
              <Field label="Reason" required>
                {view ? (
                  <Input readOnly value={current?.reason_label ?? ""} className="rounded-none bg-muted/40" />
                ) : (
                  <FilterSelect
                    value={reason}
                    onChange={setReason}
                    width="w-full"
                    ariaLabel="Reason"
                    options={ADJUSTMENT_REASONS}
                  />
                )}
              </Field>
              {(reason === "other" || current?.reason === "other") && (
                <Field label="Reason Details" required>
                  <Input
                    value={view ? current?.reason_details ?? "" : reasonDetails}
                    disabled={view}
                    onChange={(e) => setReasonDetails(e.target.value)}
                    className="rounded-none"
                  />
                </Field>
              )}
              <Field label="Reference No">
                <Input
                  value={view ? current?.reference_number ?? "" : reference}
                  disabled={view}
                  onChange={(e) => setReference(e.target.value)}
                  className="rounded-none"
                />
              </Field>
              <Field label="Created By">
                <Input
                  readOnly
                  value={current?.created_by_name ?? requestedBy}
                  className="rounded-none bg-muted/40"
                />
              </Field>
              <Field label="Notes">
                <Input
                  value={view ? current?.notes ?? "" : notes}
                  disabled={view}
                  onChange={(e) => setNotes(e.target.value)}
                  className="rounded-none"
                />
              </Field>
            </div>

            <div className="-mx-4 sm:-mx-6">
              <AgainFormNotebook
                tabs={[
                  {
                    id: "lines" as const,
                    label: "Adjustment Lines",
                    badge: view ? current?.lines.length : lines.length,
                    badgeTone: "neutral",
                  },
                  ...(view && current && current.events.length > 0
                    ? [{ id: "activity" as NotebookTab, label: "Activity", badge: current.events.length, badgeTone: "neutral" as const }]
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
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-border/80 text-left text-muted-foreground">
                          <th className="py-2 pr-2.5 font-medium">Product</th>
                          <th className="py-2 pr-2.5 text-right font-medium">Current</th>
                          <th className="py-2 pr-2.5 text-right font-medium">Physical</th>
                          <th className="py-2 pr-2.5 text-right font-medium">Adjustment</th>
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
                            <td className="py-1.5 pr-2.5 text-right tabular-nums leading-8">{line.system_qty}</td>
                            <td className="py-1.5 pr-2.5 text-right tabular-nums leading-8">{line.physical_qty}</td>
                            <td className="py-1.5 pr-2.5 text-right tabular-nums font-medium leading-8">
                              {formatDiff(line.adjustment_qty)}
                            </td>
                            <td className="py-1.5 font-mono text-[11px] text-muted-foreground">
                              {line.serials.length
                                ? line.serials
                                    .filter((s) => s.action !== "keep")
                                    .map((s) => `${s.serial_number} (${s.action}${s.status ? ` · ${s.status}` : ""})`)
                                    .join(", ") || "—"
                                : line.tracking_type}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <StockProductSearchAdd
                        items={stock.filter((row) => !lines.some((l) => l.itemId === row.item_id))}
                        disabled={!warehouseId}
                        placeholder={
                          warehouseId ? "Enter product name / SKU" : "Select warehouse first"
                        }
                        portalHost={portalHost}
                        onPick={(row) => addLine(row.item_id ?? row.id, row)}
                      />
                      <button
                        type="button"
                        className={cn(STOCK_LINE_LINK, "shrink-0 disabled:opacity-40")}
                        disabled={!warehouseId || stock.length === 0}
                        onClick={loadStockItems}
                      >
                        Load stock items
                      </button>
                      <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={hideZeros}
                          onChange={(e) => setHideZeros(e.target.checked)}
                          className="h-3.5 w-3.5 appearance-none rounded-none border border-border bg-background checked:border-[#00a09d] checked:bg-[#00a09d]"
                        />
                        Only differences
                      </label>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] border-collapse text-[13px]">
                        <thead>
                          <tr className="border-b border-border/80 text-left text-muted-foreground">
                            <th className="py-2 pr-2.5 font-medium">Product</th>
                            <th className="w-[88px] py-2 pr-2.5 text-right font-medium">Current</th>
                            <th className="w-[100px] py-2 pr-2.5 text-right font-medium">Physical</th>
                            <th className="w-[110px] py-2 pr-2.5 text-right font-medium">Adjustment</th>
                            <th className="w-[160px] py-2 font-medium">Serial / Batch</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-6 text-center text-[13px] text-muted-foreground">
                                {warehouseId
                                  ? "Search a product above, or load warehouse stock."
                                  : "Select a warehouse, then add products."}
                              </td>
                            </tr>
                          ) : (
                            visible.map((line) => (
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
                                  {line.systemQty}
                                </td>
                                <td className="py-1.5 pr-2.5">
                                  <LineNumericInput
                                    value={Number.parseInt(line.physical, 10) || 0}
                                    min={0}
                                    steppers
                                    onChange={(value) =>
                                      setLines((rows) =>
                                        rows.map((row) =>
                                          row.itemId === line.itemId
                                            ? { ...row, physical: String(value) }
                                            : row,
                                        ),
                                      )
                                    }
                                    className={STOCK_LINE_CELL_INPUT}
                                  />
                                </td>
                                <td
                                  className={cn(
                                    "py-1.5 pr-2.5 text-right tabular-nums font-medium leading-8",
                                    line.diff < 0 && "text-red-600 dark:text-red-400",
                                    line.diff > 0 && "text-emerald-600 dark:text-emerald-400",
                                  )}
                                >
                                  {formatDiff(line.diff)}
                                </td>
                                <td className="relative py-1.5 pr-6">
                                  {line.tracking === "serial" ? (
                                    <button
                                      type="button"
                                      className={cn(STOCK_LINE_LINK, "h-8 text-[13px] leading-8 disabled:opacity-40")}
                                      disabled={line.diff === 0}
                                      onClick={() => void openSerials(line)}
                                    >
                                      Manage serials
                                      {line.diff < 0
                                        ? ` (${line.keepSerialIds.length}/${line.physicalQty})`
                                        : line.diff > 0
                                          ? ` (+${line.addSerials.filter(Boolean).length}/${line.diff})`
                                          : ""}
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
                                    <span className="text-[13px] leading-8 text-muted-foreground">Quantity only</span>
                                  )}
                                  <StockLineDeleteBtn
                                    onRemove={() =>
                                      setLines((rows) => rows.filter((row) => row.itemId !== line.itemId))
                                    }
                                  />
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {negativePhysical && (
                      <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">
                        Physical quantity cannot be negative.
                      </p>
                    )}
                    {serialMissing && (
                      <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">
                        Serial-tracked differences need matching serials (remaining units or new found serials).
                      </p>
                    )}
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      Draft does not change stock. Apply writes the warehouse quantity and stock ledger.
                    </p>
                  </>
                )}
              </AgainFormNotebook>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(serialTarget)}
        onOpenChange={(next) => {
          if (!next) setSerialTarget(null);
        }}
      >
        <SheetContent
          side="right"
          title="Serial numbers"
          resizable
          resizeMaxWidth={560}
          className="z-[260] flex min-w-[160px] w-[420px] max-w-[560px] flex-col gap-0 p-0"
        >
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{serialTarget?.name} — Serials</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              System {serialTarget?.systemQty ?? 0} · Physical{" "}
              {Number.parseInt(serialTarget?.physical ?? "0", 10) || 0}
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {serialTarget && (Number.parseInt(serialTarget.physical, 10) || 0) < serialTarget.systemQty ? (
              availableSerials.map((row) => {
                const on = serialTarget.keepSerialIds.includes(row.id);
                const required = Number.parseInt(serialTarget.physical, 10) || 0;
                return (
                  <label
                    key={row.id}
                    className="flex cursor-pointer items-center gap-2 border border-border px-2 py-1.5 text-[12px]"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        setLines((rows) =>
                          rows.map((line) => {
                            if (line.itemId !== serialTarget.itemId) return line;
                            if (on) return { ...line, keepSerialIds: line.keepSerialIds.filter((id) => id !== row.id) };
                            if (line.keepSerialIds.length >= required) return line;
                            return { ...line, keepSerialIds: [...line.keepSerialIds, row.id] };
                          }),
                        );
                        setSerialTarget((currentLine) => {
                          if (!currentLine) return currentLine;
                          if (on) {
                            return {
                              ...currentLine,
                              keepSerialIds: currentLine.keepSerialIds.filter((id) => id !== row.id),
                            };
                          }
                          if (currentLine.keepSerialIds.length >= required) return currentLine;
                          return { ...currentLine, keepSerialIds: [...currentLine.keepSerialIds, row.id] };
                        });
                      }}
                      className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-border bg-background checked:border-[#00a09d] checked:bg-[#00a09d]"
                    />
                    <span className="font-mono">{row.serial_number}</span>
                  </label>
                );
              })
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">Existing in-stock serials stay. Add found units:</p>
                {(serialTarget?.addSerials ?? []).map((value, index) => (
                  <Input
                    key={`${serialTarget?.itemId}-add-${index}`}
                    value={value}
                    placeholder={`New serial ${index + 1}`}
                    onChange={(e) => {
                      const next = e.target.value;
                      setLines((rows) =>
                        rows.map((line) => {
                          if (line.itemId !== serialTarget?.itemId) return line;
                          const addSerials = [...line.addSerials];
                          addSerials[index] = next;
                          return { ...line, addSerials };
                        }),
                      );
                      setSerialTarget((currentLine) => {
                        if (!currentLine) return currentLine;
                        const addSerials = [...currentLine.addSerials];
                        addSerials[index] = next;
                        return { ...currentLine, addSerials };
                      });
                    }}
                    className="rounded-none font-mono"
                  />
                ))}
                <div className="flex gap-2">
                  <Input
                    value={addDraft}
                    placeholder="Type serial and add"
                    onChange={(e) => setAddDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || !addDraft.trim() || !serialTarget) return;
                      const needed =
                        (Number.parseInt(serialTarget.physical, 10) || 0) - serialTarget.systemQty;
                      if (serialTarget.addSerials.length >= needed) return;
                      const next = addDraft.trim();
                      setAddDraft("");
                      setLines((rows) =>
                        rows.map((line) =>
                          line.itemId === serialTarget.itemId
                            ? { ...line, addSerials: [...line.addSerials, next] }
                            : line,
                        ),
                      );
                      setSerialTarget({ ...serialTarget, addSerials: [...serialTarget.addSerials, next] });
                    }}
                    className="rounded-none font-mono"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            <Button variant="outline" size="sm" className="rounded-none" onClick={() => setSerialTarget(null)}>
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
