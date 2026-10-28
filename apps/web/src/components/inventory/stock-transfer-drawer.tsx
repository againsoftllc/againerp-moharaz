"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWarehouseAccess } from "@/lib/auth/warehouse-access";
import { toast } from "sonner";
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
import { AGAIN_FORM_TITLE_CLASS, AgainFormField, AgainFormGroupTitle } from "@/components/again/again-form-sheet";
import { AgainFormNotebook } from "@/components/again/again-form-sheet-layout";
import { LineNumericInput } from "@/components/sales/sales-order-line-row-cells";
import {
  STOCK_LINE_CELL_INPUT,
  STOCK_LINE_LINK,
  StockLineDeleteBtn,
  StockProductSearchAdd,
} from "@/components/inventory/stock-line-search";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { fetchStockLevels, type ApiStockLevel } from "@/lib/api/inventory";
import { fetchSerials, type InventorySerial } from "@/lib/api/inventory-serials";
import {
  cancelStockTransfer,
  createStockTransfer,
  fetchStockTransfer,
  receiveStockTransfer,
  shipStockTransfer,
  transferLabel,
  updateStockTransfer,
  type ApiStockTransfer,
  type CreateStockTransferInput,
} from "@/lib/api/stock-transfers";
import { printStockTransfer } from "@/lib/inventory/transfer-print";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { useAdminAuth } from "@/lib/store/admin-auth-store";

type DraftLine = {
  itemId: string;
  sku: string;
  name: string;
  available: number;
  unitCost: number;
  tracking: "none" | "serial" | "batch";
  qty: string;
  serialIds: string[];
  batchNumber: string;
};

/** What the user types into a transfer: kept as a draft and compared with the saved record to tell "unsaved". */
type FormValues = {
  fromId: string;
  toId: string;
  transferDate: string;
  reference: string;
  notes: string;
  lines: DraftLine[];
};

type NotebookTab = "lines" | "info" | "note" | "activity";

const HEADER_ROW = "grid-cols-[9.5rem_minmax(0,1fr)]";
const TH = "py-2 pr-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const num = (value: string) => Number.parseInt(value, 10) || 0;
const today = () => new Date().toISOString().slice(0, 10);

function trackingOf(value?: string | null): DraftLine["tracking"] {
  return value === "serial" || value === "batch" ? value : "none";
}

function signature(values: FormValues): string {
  return JSON.stringify({ ...values, lines: values.lines.map((l) => [l.itemId, l.qty, l.serialIds, l.batchNumber]) });
}

/** The form values of a saved transfer (also what Discard goes back to). */
function valuesOf(t: ApiStockTransfer | null | undefined): FormValues {
  if (!t) return { fromId: "", toId: "", transferDate: today(), reference: "", notes: "", lines: [] };
  return {
    fromId: t.from_warehouse_id,
    toId: t.to_warehouse_id,
    transferDate: t.transfer_date,
    reference: t.reference_number ?? "",
    notes: t.notes ?? "",
    lines: t.lines.map((line) => ({
      itemId: line.item_id,
      sku: line.sku,
      name: line.name,
      available: line.available_qty ?? 0,
      unitCost: Number(line.unit_cost ?? 0),
      tracking: trackingOf(line.tracking_type),
      qty: String(line.quantity),
      serialIds: line.serials.map((s) => s.serial_id),
      batchNumber: (line.notes ?? "").replace(/^BATCH:/i, "").trim(),
    })),
  };
}

/** Odoo's status bar: Draft > In Transit > Received; the current step filled, a cancelled transfer shows its state instead. */
function TransferStatusSteps({ status }: { status: string | null }) {
  if (status === "cancelled") {
    return (
      <span className="hidden h-6 items-center bg-muted px-2 text-[11px] font-medium text-muted-foreground lg:inline-flex">
        Cancelled
      </span>
    );
  }
  const labels = ["Draft", "In Transit", "Received"] as const;
  const current = !status || status === "draft" ? 0 : status === "completed" ? 2 : 1;
  return (
    <div className="hidden items-center text-[11px] lg:flex" aria-label="Transfer stage">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center">
          {i > 0 ? <span className="px-1 text-muted-foreground">›</span> : null}
          <span className={cn("px-2 py-0.5", i === current ? "bg-[#00a09d] font-medium text-white" : "bg-muted text-muted-foreground")}>
            {i === 1 && status === "partial_received" ? "Partly Received" : label}
          </span>
        </div>
      ))}
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
  const [query, setQuery] = useState("");
  const complete = picked.length === required && required > 0;
  const shown = options.filter((row) => row.serial_number.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? `${product} — Serial Numbers`}
      nested
      resizable
      defaultWidth={420}
      minWidth={320}
      widthStorageKey="again-transfer-serials-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => onOpenChange(false)} />}>
          <AgainDrawerButton
            variant="primary"
            disabled={!complete}
            onClick={() => {
              onSave(picked);
              onOpenChange(false);
            }}
          >
            Save
          </AgainDrawerButton>
          <AgainDrawerButton onClick={() => onOpenChange(false)}>Discard</AgainDrawerButton>
        </AgainDrawerControlBar>
        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="space-y-3">
            <div>
              <h2 className="text-[15px] font-semibold">{title ?? `${product} — Serial Numbers`}</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Selected <span className="font-medium text-foreground">{picked.length}</span> of {required}
                {complete ? " · complete" : ""}
              </p>
            </div>
            <div className="again-odoo-form flex items-center gap-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a serial…"
                className="h-8 min-w-0 flex-1 bg-transparent px-1 text-[13px] outline-none"
              />
              <button
                type="button"
                className={cn(STOCK_LINE_LINK, "shrink-0")}
                onClick={() => setPicked(options.slice(0, required).map((row) => row.id))}
              >
                Pick first {required}
              </button>
            </div>
            <div className="space-y-1">
              {shown.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-muted-foreground">
                  {options.length === 0 ? "No serials available in this warehouse." : "No serial matches your search."}
                </p>
              ) : (
                shown.map((row) => {
                  const on = picked.includes(row.id);
                  return (
                    <label
                      key={row.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 border px-2 py-1.5 text-[13px]",
                        on ? "border-[#00a09d]/50 bg-[#00a09d]/5" : "border-border bg-background",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setPicked((current) => {
                            if (on) return current.filter((id) => id !== row.id);
                            if (current.length >= required) return current;
                            return [...current, row.id];
                          })
                        }
                        className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-border bg-background checked:border-[#00a09d] checked:bg-[#00a09d]"
                      />
                      <span className="font-mono">{row.serial_number}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}

/**
 * Stock transfer in the common drawer (docs/common/drawercommon.md) with the Odoo form look (docs/common/formcommon.md):
 * status bar Draft > In Transit > Received, a title band with the route, Products / Additional Info / Note / Activity tabs,
 * a totals card, drafts kept for new and existing transfers. A draft can be edited and saved before it is shipped; shipping
 * takes the stock out of the source warehouse and holds it in transit; the destination then receives all or part of it.
 */
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
  const warehouseAccess = useWarehouseAccess();
  const requestedBy = useAdminAuth((s) => s.user?.name) ?? "";
  const [detail, setDetail] = useState<ApiStockTransfer | null>(transfer ?? null);
  const current = detail ?? transfer ?? null;
  const editable = !current || current.status === "draft";
  const canReceive = current?.status === "in_transit" || current?.status === "partial_received";

  const initial = useMemo(() => valuesOf(transfer), [transfer]);
  const [fromId, setFromId] = useState(initial.fromId);
  const [toId, setToId] = useState(initial.toId);
  const [transferDate, setTransferDate] = useState(initial.transferDate);
  const [reference, setReference] = useState(initial.reference);
  const [notes, setNotes] = useState(initial.notes);
  const [lines, setLines] = useState<DraftLine[]>(initial.lines);
  const [baseSig, setBaseSig] = useState(() => signature(initial));
  const [loaded, setLoaded] = useState(!transfer?.id);
  const [stock, setStock] = useState<ApiStockLevel[]>([]);
  const [stockQuery, setStockQuery] = useState("");
  // the typed text the current `stock` answers: the search box adds nothing by itself until it matches what is typed
  const [stockLoadedFor, setStockLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<NotebookTab>("lines");
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [serialTarget, setSerialTarget] = useState<DraftLine | null>(null);
  const [availableSerials, setAvailableSerials] = useState<InventorySerial[]>([]);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>(() =>
    Object.fromEntries((transfer?.lines ?? []).map((line) => [line.id, String(line.remaining_qty)])),
  );
  const [receiveSerials, setReceiveSerials] = useState<Record<string, string[]>>({});
  const [receivePick, setReceivePick] = useState<ApiStockTransfer["lines"][number] | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<number | null>(null);
  const [restoredTick, setRestoredTick] = useState(0);

  const values: FormValues = { fromId, toId, transferDate, reference, notes, lines };
  const dirty = open && editable && loaded && signature(values) !== baseSig;

  const apply = (v: FormValues) => {
    setFromId(v.fromId);
    setToId(v.toId);
    setTransferDate(v.transferDate);
    setReference(v.reference);
    setNotes(v.notes);
    setLines(v.lines);
  };

  /** Put a saved record on screen: the form, what "unsaved" is measured against, and the receive defaults. */
  const adopt = (row: ApiStockTransfer) => {
    const v = valuesOf(row);
    setDetail(row);
    apply(v);
    setBaseSig(signature(v));
    setReceiveQty(Object.fromEntries(row.lines.map((line) => [line.id, String(line.remaining_qty)])));
    setReceiveSerials({});
    setLoaded(true);
  };

  useEffect(() => {
    if (!open || !transfer?.id) return;
    let cancelled = false;
    void fetchStockTransfer(transfer.id)
      .then((row) => {
        if (!cancelled) adopt(row);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transfer?.id]);

  // Stock available in the source warehouse, for the product search. A warehouse can hold thousands of products (the API
  // returns at most 1000 per call), so what is typed is searched on the server instead of filtering a truncated list.
  useEffect(() => {
    if (!open || !editable || !fromId) return;
    let cancelled = false;
    const asked = stockQuery.trim();
    const timer = window.setTimeout(() => {
      void fetchStockLevels({ warehouse_id: fromId, limit: 1000, search: asked || undefined })
        .then((rows) => {
          if (cancelled) return;
          setStock(rows.filter((row) => row.available > 0 && row.item_id));
          setStockLoadedFor(asked);
        })
        .catch(() => {
          if (cancelled) return;
          setStock([]);
          setStockLoadedFor(asked);
        });
    }, stockQuery ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, editable, fromId, stockQuery]);

  // one draft per transfer ("stock-transfer:new" for a new one); only a transfer that can still be edited keeps one
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<FormValues & { tab: NotebookTab; scrollTop: number }>({
    key: editable ? (current ? `stock-transfer:${current.id}` : "stock-transfer:new") : null,
    ready: open && loaded,
    dirty,
    getValues: () => ({ ...values, tab, scrollTop: bodyScrollRef.current?.scrollTop ?? 0 }),
    restore: (v) => {
      apply(v);
      if (v.tab) setTab(v.tab);
      pendingScrollRef.current = v.scrollTop;
      setRestoredTick((t) => t + 1);
    },
    onDiscard: () => apply(valuesOf(current)),
    label: "stock transfer",
  });

  useEffect(() => {
    if (!open || pendingScrollRef.current == null) return;
    const top = pendingScrollRef.current;
    pendingScrollRef.current = null;
    const timer = window.setTimeout(() => bodyScrollRef.current?.scrollTo({ top }), 150);
    return () => window.clearTimeout(timer);
  }, [open, restoredTick]);

  // every dismissal (outside click, Esc, the X) goes through here and keeps a draft
  const handleOpenChange = (next: boolean) => {
    if (!next) saveDraftIfDirty();
    onOpenChange(next);
  };

  const sameWarehouse = Boolean(fromId && toId && fromId === toId);
  const warehouseOptions = warehouses
    .filter((w) => w.is_active !== false || w.id === fromId || w.id === toId)
    .map((w) => ({ value: w.id, label: w.name }));
  // stock leaves only from a warehouse the member works in (the server refuses others); it may go to any
  const sourceOptions = warehouseAccess
    .pickable(warehouses, fromId)
    .filter((w) => w.is_active !== false || w.id === fromId)
    .map((w) => ({ value: w.id, label: w.name }));
  const fromName = warehouses.find((w) => w.id === fromId)?.name ?? current?.from_warehouse_name ?? "";
  const toName = warehouses.find((w) => w.id === toId)?.name ?? current?.to_warehouse_name ?? "";

  const addLine = (row: ApiStockLevel) => {
    const lineId = row.item_id || row.id;
    if (!lineId) return;
    setLines((rows) => {
      if (rows.some((l) => l.itemId === lineId || l.sku === row.sku)) return rows;
      return [
        ...rows,
        {
          itemId: lineId,
          sku: row.sku,
          name: row.name,
          available: row.available,
          unitCost: Number(row.unit_cost ?? 0),
          tracking: trackingOf(row.tracking_type),
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
      if (!lineId || next.some((l) => l.itemId === lineId)) continue;
      next.push({
        itemId: lineId,
        sku: row.sku,
        name: row.name,
        available: row.available,
        unitCost: Number(row.unit_cost ?? 0),
        tracking: trackingOf(row.tracking_type),
        qty: "0",
        serialIds: [],
        batchNumber: "",
      });
    }
    setLines(next);
  };

  const patchLine = (itemId: string, patch: Partial<DraftLine>) =>
    setLines((rows) => rows.map((row) => (row.itemId === itemId ? { ...row, ...patch } : row)));

  const overQty = lines.some((l) => num(l.qty) > l.available);
  const serialMissing = lines.some((l) => l.tracking === "serial" && num(l.qty) > 0 && l.serialIds.length !== num(l.qty));
  const batchMissing = lines.some((l) => l.tracking === "batch" && num(l.qty) > 0 && !l.batchNumber.trim());
  const payloadLines = lines.filter((l) => num(l.qty) > 0);
  const blocked = sameWarehouse || !fromId || !toId || payloadLines.length === 0 || overQty || serialMissing || batchMissing;
  const totalUnits = payloadLines.reduce((sum, l) => sum + num(l.qty), 0);
  const totalValue = payloadLines.reduce((sum, l) => sum + num(l.qty) * l.unitCost, 0);

  const payload = (): CreateStockTransferInput => ({
    from_warehouse_id: fromId,
    to_warehouse_id: toId,
    transfer_date: transferDate || undefined,
    reference_number: reference.trim() || undefined,
    notes: notes.trim() || undefined,
    lines: payloadLines.map((l) => ({
      item_id: l.itemId,
      quantity: num(l.qty),
      serial_ids: l.tracking === "serial" ? l.serialIds : undefined,
      notes: l.tracking === "batch" && l.batchNumber.trim() ? `BATCH:${l.batchNumber.trim()}` : undefined,
    })),
  });

  const persist = () => (current ? updateStockTransfer(current.id, payload()) : createStockTransfer(payload()));

  const run = async (work: () => Promise<void>, failure: string) => {
    setSaving(true);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : failure);
    } finally {
      setSaving(false);
    }
  };

  const save = () =>
    run(async () => {
      const row = await persist();
      clearDraft();
      adopt(row);
      toast.success(`${row.transfer_number} saved as draft`);
      onChanged?.();
    }, "Save failed");

  const ship = () =>
    run(async () => {
      let row = !current || dirty ? await persist() : current;
      row = await shipStockTransfer(row.id);
      clearDraft();
      adopt(row);
      setTab("lines");
      toast.success(`${row.transfer_number} shipped — source stock reduced, in transit`);
      onChanged?.();
    }, "Ship failed");

  const receive = () => {
    if (!current) return;
    const entries = current.lines
      .map((line) => ({
        line_id: line.id,
        quantity: num(receiveQty[line.id] ?? "0"),
        serial_ids: receiveSerials[line.id] ?? [],
        tracking: line.tracking_type,
      }))
      .filter((line) => line.quantity > 0);
    if (!entries.length) return;
    if (entries.some((line) => line.tracking === "serial" && line.serial_ids.length !== line.quantity)) {
      toast.error("Serial-tracked lines need exactly one in-transit serial per unit received");
      return;
    }
    void run(async () => {
      const row = await receiveStockTransfer(current.id, {
        lines: entries.map(({ line_id, quantity, serial_ids }) => ({ line_id, quantity, serial_ids })),
      });
      adopt(row);
      toast.success(row.status === "completed" ? `${row.transfer_number} received in full` : `${row.transfer_number} partly received`);
      onChanged?.();
    }, "Receive failed");
  };

  const cancelTransfer = () => {
    if (!current) return;
    if (!window.confirm(`Cancel ${current.transfer_number}? Nothing has been shipped, so no stock changes.`)) return;
    void run(async () => {
      await cancelStockTransfer(current.id);
      clearDraft();
      toast.success(`${current.transfer_number} cancelled`);
      onOpenChange(false);
      onChanged?.();
    }, "Cancel failed");
  };

  const discard = () => {
    clearDraft();
    if (!current) {
      onOpenChange(false);
      return;
    }
    apply(valuesOf(current));
  };

  const print = () => {
    if (current && !printStockTransfer(current)) toast.info("Allow pop-ups to open the transfer note.");
  };

  const openSerials = async (line: DraftLine) => {
    if (num(line.qty) <= 0) return;
    setSerialTarget(line);
    try {
      const res = await fetchSerials({ item_id: line.itemId, warehouse_id: fromId, status: "in_stock" });
      setAvailableSerials(res.data);
    } catch {
      setAvailableSerials([]);
    }
  };

  const title = current ? current.transfer_number : "New Transfer";
  const receivingUnits = current ? current.lines.reduce((sum, l) => sum + num(receiveQty[l.id] ?? "0"), 0) : 0;
  const inTransitUnits = current ? current.lines.reduce((sum, l) => sum + l.remaining_qty, 0) : 0;
  const shippedUnits = current ? current.lines.reduce((sum, l) => sum + l.shipped_qty, 0) : 0;
  const receivedUnits = current ? current.lines.reduce((sum, l) => sum + l.received_qty, 0) : 0;
  const viewValue = current ? current.lines.reduce((sum, l) => sum + l.quantity * Number(l.unit_cost ?? 0), 0) : 0;
  const nestedOpen = Boolean(serialTarget || receivePick);
  // the one-line summary under the title: what is on the form while editing, what the saved transfer carries once shipped
  const summaryProducts = current && !editable ? current.lines.length : payloadLines.length;
  const summaryUnits = current && !editable ? current.lines.reduce((sum, l) => sum + l.quantity, 0) : totalUnits;

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      resizable
      defaultWidth={860}
      defaultWidthRatio={0.6} // a lot of information: 60 % of the screen until the user drags it
      minWidth={520}
      widthStorageKey="again-stock-transfer-drawer-width"
      onPointerDownOutside={(event) => nestedOpen && event.preventDefault()}
      onInteractOutside={(event) => nestedOpen && event.preventDefault()}
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar
          trailing={
            <>
              <TransferStatusSteps status={current?.status ?? null} />
              <AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />
            </>
          }
        >
          {editable ? (
            <>
              <AgainDrawerButton
                variant="primary"
                disabled={blocked || saving}
                aria-busy={saving}
                onClick={() => void (dirty || !current ? save() : ship())}
              >
                {saving ? "Saving…" : dirty || !current ? "Save" : "Ship Transfer"}
              </AgainDrawerButton>
              {dirty || !current ? (
                <AgainDrawerButton variant="success" disabled={blocked || saving} onClick={() => void ship()}>
                  Ship Transfer
                </AgainDrawerButton>
              ) : null}
              {current && !dirty ? <AgainDrawerButton onClick={print}>Print</AgainDrawerButton> : null}
              <AgainDrawerButton disabled={saving || (!!current && !dirty)} onClick={discard}>
                {current ? "Discard" : "Cancel"}
              </AgainDrawerButton>
              {current && !dirty ? (
                <AgainDrawerButton variant="danger" disabled={saving} onClick={cancelTransfer}>
                  Cancel Transfer
                </AgainDrawerButton>
              ) : null}
              {dirty ? (
                <span className="ml-1 text-[11px] text-amber-700 dark:text-amber-400">Unsaved changes · closing keeps a draft</span>
              ) : null}
            </>
          ) : (
            <>
              {canReceive ? (
                <AgainDrawerButton variant="primary" disabled={saving || receivingUnits === 0} aria-busy={saving} onClick={receive}>
                  {saving ? "Receiving…" : "Receive"}
                </AgainDrawerButton>
              ) : null}
              <AgainDrawerButton onClick={print}>Print</AgainDrawerButton>
            </>
          )}
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody scrollRef={bodyScrollRef} className={cn("bg-white px-4 py-4 pt-0 dark:bg-muted/20 sm:px-6")}>
          <div ref={setPortalHost} className="-mx-4 sm:-mx-6">
            {/* title band: number, route, the header fields (Odoo form) */}
            <div className="@container border-b border-border bg-background px-4 py-4 sm:px-6">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className={cn(AGAIN_FORM_TITLE_CLASS, "min-w-0 truncate")}>{title}</h2>
                {current ? (
                  <span className="text-[13px] text-muted-foreground">{transferLabel(current.status)}</span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {fromName || "Source"} <span className="px-1">→</span> {toName || "Destination"}
                {summaryProducts > 0 ? (
                  <>
                    {" · "}
                    {summaryProducts} product{summaryProducts === 1 ? "" : "s"}
                    {" · "}
                    {summaryUnits} unit{summaryUnits === 1 ? "" : "s"}
                  </>
                ) : null}
              </p>

              <div className="again-odoo-form mt-4 grid gap-x-10 gap-y-0 @xl:grid-cols-2">
                <div className="min-w-0">
                  <AgainFormField label="Source Warehouse" required={editable} className={HEADER_ROW}>
                    {editable ? (
                      <FilterSelect
                        value={fromId}
                        onChange={(id) => {
                          if (id === fromId) return;
                          setFromId(id);
                          setLines([]);
                        }}
                        width="w-full"
                        avoidCollisions
                        ariaLabel="Source warehouse"
                        options={[{ value: "", label: "Select warehouse" }, ...sourceOptions]}
                      />
                    ) : (
                      <p className="flex min-h-[28px] items-center px-1 text-[13px]">{fromName || "—"}</p>
                    )}
                  </AgainFormField>
                  <AgainFormField label="Destination" required={editable} className={HEADER_ROW}>
                    {editable ? (
                      <FilterSelect
                        value={toId}
                        onChange={setToId}
                        width="w-full"
                        avoidCollisions
                        ariaLabel="Destination warehouse"
                        options={[{ value: "", label: "Select warehouse" }, ...warehouseOptions]}
                      />
                    ) : (
                      <p className="flex min-h-[28px] items-center px-1 text-[13px]">{toName || "—"}</p>
                    )}
                    {sameWarehouse ? (
                      <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">Source and destination must be different.</p>
                    ) : null}
                  </AgainFormField>
                </div>
                <div className="min-w-0">
                  <AgainFormField label="Transfer Date" required={editable} className={HEADER_ROW}>
                    <input
                      type="date"
                      value={transferDate}
                      disabled={!editable}
                      onChange={(e) => setTransferDate(e.target.value)}
                      className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-70"
                    />
                  </AgainFormField>
                  <AgainFormField label="Source Document" className={HEADER_ROW}>
                    <input
                      value={reference}
                      disabled={!editable}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="PO, request or reference no."
                      className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-70"
                    />
                  </AgainFormField>
                  <AgainFormField label="Requested By" className={HEADER_ROW}>
                    <p className="flex min-h-[28px] items-center px-1 text-[13px]">{current?.requested_by_name ?? requestedBy ?? "—"}</p>
                  </AgainFormField>
                </div>
              </div>
              {!editable && current ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {current.status === "completed" || current.status === "cancelled"
                    ? `${transferLabel(current.status)} transfers are read-only.`
                    : "Shipped transfers cannot be edited: the goods are on the way, so the destination receives them."}
                </p>
              ) : null}
            </div>

            {/* notebook */}
            <AgainFormNotebook
              tabs={[
                {
                  id: "lines" as NotebookTab,
                  label: "Products",
                  badge: !editable && current ? current.lines.length : lines.length,
                  badgeTone: "neutral" as const,
                },
                { id: "info" as NotebookTab, label: "Additional Info" },
                { id: "note" as NotebookTab, label: "Note" },
                ...(current && current.events.length > 0
                  ? [{ id: "activity" as NotebookTab, label: "Activity", badge: current.events.length, badgeTone: "neutral" as const }]
                  : []),
              ]}
              active={tab}
              onChange={setTab}
              className="border-t-0"
              tabsClassName="pl-1.5 sm:pl-3.5"
              contentClassName="@container bg-transparent px-4 py-4 dark:bg-transparent sm:px-6"
            >
              {tab === "lines" && editable ? (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <StockProductSearchAdd
                      items={stock.filter((row) => !lines.some((l) => l.itemId === (row.item_id ?? row.id)))}
                      disabled={!fromId}
                      placeholder={fromId ? "Add a product: name, SKU or barcode" : "Select the source warehouse first"}
                      portalHost={portalHost}
                      itemSecondary={(row) => `${row.sku} · available ${row.available}`}
                      onPick={addLine}
                      onQueryChange={setStockQuery}
                      loading={stockLoadedFor !== stockQuery.trim()}
                    />
                    <button
                      type="button"
                      className={cn(STOCK_LINE_LINK, "shrink-0 disabled:opacity-40")}
                      disabled={!fromId || stock.length === 0}
                      onClick={loadStockItems}
                    >
                      Load available stock (first 1000)
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-border/80 text-left">
                          <th className={TH}>Product</th>
                          <th className={cn(TH, "w-[84px] text-right")}>Available</th>
                          <th className={cn(TH, "w-[120px] text-right")}>Transfer qty</th>
                          <th className={cn(TH, "w-[96px] text-right")}>Unit cost</th>
                          <th className={cn(TH, "w-[100px] text-right")}>Value</th>
                          <th className={cn(TH, "w-[170px]")}>Serial / Batch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-[13px] text-muted-foreground">
                              {fromId
                                ? "No products yet. Search a product above, or load everything available in the source warehouse."
                                : "Select the source warehouse, then add the products to move."}
                            </td>
                          </tr>
                        ) : (
                          lines.map((line) => {
                            const qty = num(line.qty);
                            const over = qty > line.available;
                            return (
                              <tr key={line.itemId} className="group border-b border-border/80">
                                <td className="relative py-1.5 pr-2.5 align-top">
                                  <p className="h-8 truncate text-[13px] font-medium leading-8" title={line.name}>
                                    {line.name}
                                  </p>
                                  <p className="font-mono text-[11px] text-muted-foreground">{line.sku}</p>
                                </td>
                                <td
                                  className={cn(
                                    "py-1.5 pr-2.5 text-right tabular-nums leading-8",
                                    over ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
                                  )}
                                  title={over ? "More than is available in the source warehouse" : undefined}
                                >
                                  {line.available}
                                </td>
                                <td className="py-1.5 pr-2.5">
                                  <LineNumericInput
                                    value={qty}
                                    min={0}
                                    steppers
                                    onChange={(value) => patchLine(line.itemId, { qty: String(Math.min(value, line.available)) })}
                                    className={STOCK_LINE_CELL_INPUT}
                                  />
                                </td>
                                <td className="py-1.5 pr-2.5 text-right tabular-nums leading-8 text-muted-foreground">
                                  {line.unitCost > 0 ? formatCurrency(line.unitCost) : "—"}
                                </td>
                                <td className="py-1.5 pr-2.5 text-right tabular-nums leading-8">
                                  {line.unitCost > 0 && qty > 0 ? formatCurrency(line.unitCost * qty) : "—"}
                                </td>
                                <td className="relative py-1.5 pr-6">
                                  {line.tracking === "serial" ? (
                                    <button
                                      type="button"
                                      className={cn(STOCK_LINE_LINK, "h-8 leading-8 disabled:opacity-40", line.serialIds.length !== qty && qty > 0 && "text-amber-600")}
                                      disabled={qty <= 0}
                                      onClick={() => void openSerials(line)}
                                    >
                                      Serials ({line.serialIds.length}/{qty})
                                    </button>
                                  ) : line.tracking === "batch" ? (
                                    <input
                                      value={line.batchNumber}
                                      placeholder="Batch / LOT"
                                      onChange={(e) => patchLine(line.itemId, { batchNumber: e.target.value })}
                                      className="h-8 w-full min-w-0 border-b border-border/50 bg-transparent text-[13px] outline-none focus:border-[#00a09d]"
                                    />
                                  ) : (
                                    <span className="text-[13px] leading-8 text-muted-foreground">Quantity only</span>
                                  )}
                                  <StockLineDeleteBtn onRemove={() => setLines((rows) => rows.filter((row) => row.itemId !== line.itemId))} />
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  {overQty ? <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">A quantity is more than the source warehouse has available.</p> : null}
                  {serialMissing ? <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">Serial-tracked products need exactly one serial per unit moved.</p> : null}
                  {batchMissing ? <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">Batch-tracked products need a batch / LOT number.</p> : null}
                  <div className="mt-4 flex justify-end">
                    <dl className="w-full max-w-[18rem] space-y-1 border-t border-border pt-2 text-[13px]">
                      <div className="flex justify-between"><dt className="text-muted-foreground">Products</dt><dd className="tabular-nums">{payloadLines.length}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">Units</dt><dd className="tabular-nums">{totalUnits}</dd></div>
                      <div className="flex justify-between border-t border-border pt-1 text-[15px] font-semibold"><dt>Transfer value</dt><dd className="tabular-nums">{formatCurrency(totalValue)}</dd></div>
                    </dl>
                  </div>
                  <p className="mt-3 text-[12px] text-muted-foreground">
                    Shipping takes the stock out of {fromName || "the source warehouse"} and holds it in transit until {toName || "the destination"} receives it.
                  </p>
                </>
              ) : null}

              {tab === "lines" && !editable && current ? (
                <>
                  {canReceive ? (
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] text-muted-foreground">
                        <span className="font-medium text-foreground">{inTransitUnits}</span> unit{inTransitUnits === 1 ? "" : "s"} still in transit. Enter what arrived, then Receive.
                      </p>
                      <button
                        type="button"
                        className={STOCK_LINE_LINK}
                        onClick={() => setReceiveQty(Object.fromEntries(current.lines.map((l) => [l.id, String(l.remaining_qty)])))}
                      >
                        Receive everything remaining
                      </button>
                    </div>
                  ) : null}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-border/80 text-left">
                          <th className={TH}>Product</th>
                          <th className={cn(TH, "text-right")}>Shipped</th>
                          <th className={cn(TH, "text-right")}>Received</th>
                          <th className={cn(TH, "text-right")}>In transit</th>
                          {canReceive ? <th className={cn(TH, "w-[120px] text-right")}>Receive now</th> : null}
                          <th className={cn(TH, "text-right")}>Value</th>
                          <th className={TH}>Serial / Batch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {current.lines.map((line) => (
                          <tr key={line.id} className="border-b border-border/80">
                            <td className="py-1.5 pr-2.5 align-top">
                              <p className="truncate text-[13px] font-medium leading-6">{line.name}</p>
                              <p className="font-mono text-[11px] text-muted-foreground">{line.sku}</p>
                            </td>
                            <td className="py-1.5 pr-2.5 text-right tabular-nums leading-6">{line.shipped_qty || line.quantity}</td>
                            <td className="py-1.5 pr-2.5 text-right tabular-nums leading-6">{line.received_qty}</td>
                            <td className={cn("py-1.5 pr-2.5 text-right tabular-nums leading-6", line.remaining_qty > 0 && "font-medium text-sky-700 dark:text-sky-400")}>
                              {line.remaining_qty}
                            </td>
                            {canReceive ? (
                              <td className="py-1.5 pr-2.5">
                                {line.remaining_qty > 0 ? (
                                  <LineNumericInput
                                    value={num(receiveQty[line.id] ?? "0")}
                                    min={0}
                                    steppers
                                    onChange={(value) =>
                                      setReceiveQty((q) => ({ ...q, [line.id]: String(Math.min(value, line.remaining_qty)) }))
                                    }
                                    className={STOCK_LINE_CELL_INPUT}
                                  />
                                ) : (
                                  <span className="block text-right text-[12px] text-muted-foreground">Done</span>
                                )}
                              </td>
                            ) : null}
                            <td className="py-1.5 pr-2.5 text-right tabular-nums leading-6 text-muted-foreground">
                              {Number(line.unit_cost ?? 0) > 0 ? formatCurrency(line.quantity * Number(line.unit_cost)) : "—"}
                            </td>
                            <td className="py-1.5 font-mono text-[11px] text-muted-foreground">
                              {line.tracking_type === "serial" ? (
                                canReceive && line.remaining_qty > 0 ? (
                                  <button type="button" className={cn(STOCK_LINE_LINK, "text-[13px]")} onClick={() => setReceivePick(line)}>
                                    Select serials ({(receiveSerials[line.id] ?? []).length}/{num(receiveQty[line.id] ?? "0")})
                                  </button>
                                ) : (
                                  line.serials.map((s) => s.serial_number).join(", ") || "—"
                                )
                              ) : line.tracking_type === "batch" ? (
                                (line.notes ?? "").replace(/^BATCH:/i, "Batch ") || "Batch"
                              ) : (
                                <span className="font-sans">Quantity only</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <dl className="w-full max-w-[18rem] space-y-1 border-t border-border pt-2 text-[13px]">
                      <div className="flex justify-between"><dt className="text-muted-foreground">Shipped</dt><dd className="tabular-nums">{shippedUnits || current.lines.reduce((s, l) => s + l.quantity, 0)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">Received</dt><dd className="tabular-nums">{receivedUnits}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">In transit</dt><dd className="tabular-nums">{inTransitUnits}</dd></div>
                      <div className="flex justify-between border-t border-border pt-1 text-[15px] font-semibold"><dt>Transfer value</dt><dd className="tabular-nums">{formatCurrency(viewValue)}</dd></div>
                    </dl>
                  </div>
                </>
              ) : null}

              {tab === "info" ? (
                <div className="again-odoo-form grid gap-x-10 gap-y-0 @xl:grid-cols-2">
                  <AgainFormGroupTitle className="@xl:col-span-2">Movement</AgainFormGroupTitle>
                  <AgainFormField label="Status" className={HEADER_ROW}>
                    <p className="flex min-h-[28px] items-center px-1 text-[13px]">{current ? transferLabel(current.status) : "Not saved yet"}</p>
                  </AgainFormField>
                  <AgainFormField label="Requested by" className={HEADER_ROW}>
                    <p className="flex min-h-[28px] items-center px-1 text-[13px]">{current?.requested_by_name ?? requestedBy ?? "—"}</p>
                  </AgainFormField>
                  <AgainFormField label="Created" className={HEADER_ROW}>
                    <p className="flex min-h-[28px] items-center px-1 text-[13px]">{current ? formatDateTime(current.created_at) : "—"}</p>
                  </AgainFormField>
                  <AgainFormField label="Last updated" className={HEADER_ROW}>
                    <p className="flex min-h-[28px] items-center px-1 text-[13px]">{current ? formatDateTime(current.updated_at) : "—"}</p>
                  </AgainFormField>
                  <AgainFormGroupTitle className="@xl:col-span-2">Shipment</AgainFormGroupTitle>
                  <AgainFormField label="Shipped by" className={HEADER_ROW}>
                    <p className="flex min-h-[28px] items-center px-1 text-[13px]">{current?.shipped_by_name ?? "—"}</p>
                  </AgainFormField>
                  <AgainFormField label="Shipped on" className={HEADER_ROW}>
                    <p className="flex min-h-[28px] items-center px-1 text-[13px]">{current?.shipped_at ? formatDateTime(current.shipped_at) : "—"}</p>
                  </AgainFormField>
                  <AgainFormGroupTitle className="@xl:col-span-2">Receipt</AgainFormGroupTitle>
                  <AgainFormField label="Received by" className={HEADER_ROW}>
                    <p className="flex min-h-[28px] items-center px-1 text-[13px]">{current?.received_by_name ?? "—"}</p>
                  </AgainFormField>
                  <AgainFormField label="Completed on" className={HEADER_ROW}>
                    <p className="flex min-h-[28px] items-center px-1 text-[13px]">{current?.completed_at ? formatDateTime(current.completed_at) : "—"}</p>
                  </AgainFormField>
                  <AgainFormField label="Transfer date" className={HEADER_ROW}>
                    <p className="flex min-h-[28px] items-center px-1 text-[13px]">{transferDate ? formatDate(transferDate) : "—"}</p>
                  </AgainFormField>
                </div>
              ) : null}

              {tab === "note" ? (
                <div className="again-odoo-form">
                  {editable ? (
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={6}
                      placeholder="Instructions for the warehouse, handling notes, reason for the transfer…"
                      className="w-full resize-y bg-transparent px-1 py-1.5 text-[13px] leading-[1.45] outline-none"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap px-1 py-1.5 text-[13px] leading-[1.45]">{notes || "No notes."}</p>
                  )}
                </div>
              ) : null}

              {tab === "activity" && current ? (
                <ol className="space-y-0">
                  {[...current.events].reverse().map((event) => (
                    <li key={event.id} className="flex gap-3 border-b border-border/60 py-2 last:border-b-0">
                      <span className="mt-1.5 h-2 w-2 shrink-0 bg-[#00a09d]" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium">{event.action}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {event.performed_by_name ?? "System"} · {formatDateTime(event.created_at)}
                        </p>
                        {event.details ? <p className="mt-0.5 text-[12px] text-muted-foreground">{event.details}</p> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : null}
            </AgainFormNotebook>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>

      <SerialPickDrawer
        key={`ship:${serialTarget?.itemId ?? "none"}`}
        open={Boolean(serialTarget)}
        onOpenChange={(next) => {
          if (!next) setSerialTarget(null);
        }}
        product={serialTarget?.name ?? ""}
        required={num(serialTarget?.qty ?? "0")}
        options={availableSerials.map((row) => ({ id: row.id, serial_number: row.serial_number }))}
        selected={serialTarget?.serialIds ?? []}
        onSave={(ids) => {
          if (serialTarget) patchLine(serialTarget.itemId, { serialIds: ids });
        }}
      />

      <SerialPickDrawer
        key={`recv:${receivePick?.id ?? "none"}`}
        open={Boolean(receivePick)}
        onOpenChange={(next) => {
          if (!next) setReceivePick(null);
        }}
        product={receivePick?.name ?? ""}
        required={num(receiveQty[receivePick?.id ?? ""] ?? "0")}
        options={(receivePick?.serials ?? [])
          .filter((row) => row.status === "shipped")
          .map((row) => ({ id: row.serial_id, serial_number: row.serial_number }))}
        selected={receiveSerials[receivePick?.id ?? ""] ?? []}
        title={`${receivePick?.name ?? ""} — In transit serials`}
        onSave={(ids) => {
          if (receivePick) setReceiveSerials((cur) => ({ ...cur, [receivePick.id]: ids }));
        }}
      />
    </AgainDrawerPanel>
  );
}
