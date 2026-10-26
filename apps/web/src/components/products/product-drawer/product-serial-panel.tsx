"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Input } from "@/components/ui/input";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { SerialDetailSheet } from "@/components/inventory/serial-detail-sheet";
import {
  fetchSerials,
  SERIAL_STATUS_LABEL,
  SERIAL_STATUS_TONE,
  serialLocationLabel,
  type InventorySerial,
  type SerialListMeta,
} from "@/lib/api/inventory-serials";
import { formatCurrency, formatDate } from "@/lib/utils";
import { HISTORY_GRID_CANVAS_CLASS, HISTORY_GRID_CLASS, PanelMessage } from "./drawer-shared";
import { usePagedHistory } from "./use-paged-history";

const DAY_MS = 24 * 60 * 60 * 1000;
const AGE_TONE = {
  fresh: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  ageing: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  old: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  closed: "border-slate-500/30 bg-slate-500/10 text-slate-500 dark:text-slate-400",
} as const;

/** API timestamps are naive UTC (no offset); without a designator `new Date()` would read them as local time. */
function parseApiTime(value: string | null | undefined): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) || !raw.includes("T") ? raw : `${raw}Z`;
  const time = new Date(withZone).getTime();
  return Number.isNaN(time) ? null : time;
}

function dayCount(days: number): string {
  if (days <= 0) return "Today";
  return days === 1 ? "1 day" : `${days} days`;
}

type Ymd = { years: number; months: number; days: number };

/** A calendar date ("2026-10-25" or a timestamp starting with it) as a UTC midnight, so day maths ignores the time zone. */
function dateOnly(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((value ?? "").trim());
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
}

function todayDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Years, months and days from `from` to `to` (to >= from), counted on the calendar: 25 Oct to 25 Jan is 3 months, not 92 days. */
function ymdBetween(from: Date, to: Date): Ymd {
  // whole months first (the day of the month is kept, or the month's last day when it is shorter: 31 Jan + 1 month = 28 Feb),
  // then the days left over
  const addMonths = (date: Date, count: number): Date => {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
    return target;
  };
  let wholeMonths = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (addMonths(from, wholeMonths).getTime() > to.getTime()) wholeMonths -= 1;
  const days = Math.round((to.getTime() - addMonths(from, wholeMonths).getTime()) / DAY_MS);
  return { years: Math.floor(wholeMonths / 12), months: wholeMonths % 12, days };
}

function ymdText({ years, months, days }: Ymd): string {
  const parts = [
    years > 0 ? `${years} ${years === 1 ? "year" : "years"}` : "",
    months > 0 ? `${months} ${months === 1 ? "month" : "months"}` : "",
    days > 0 ? `${days} ${days === 1 ? "day" : "days"}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : "0 days";
}

/** Total warranty length in days, to sort the column by (units without a running warranty last). */
function warrantyLength(row: InventorySerial | undefined): number {
  const start = dateOnly(row?.sold_at);
  const expiry = dateOnly(row?.warranty_expires_on);
  return start && expiry ? Math.round((expiry.getTime() - start.getTime()) / DAY_MS) : Number.MAX_SAFE_INTEGER;
}

type WarrantyView = {
  start: string;
  total: string;
  left: string;
  leftTone: string;
  leftTitle: string;
  expires: string;
  leftDays: number | null;
};

/**
 * The warranty of one unit. It starts on the day the unit was sold (that is when the serial is bound to the sale and the expiry
 * is stamped); a unit still in stock has none running yet. Shows the total length, and how much is left from today - or how long
 * ago it ended.
 */
function serialWarranty(row: InventorySerial): WarrantyView {
  const none: WarrantyView = { start: "—", total: "—", left: "—", leftTone: "", leftTitle: "", expires: "—", leftDays: null };
  const start = dateOnly(row.sold_at);
  const expiry = dateOnly(row.warranty_expires_on);
  if (!start) return { ...none, left: "Starts when sold" };
  const base = { ...none, start: formatDate((row.sold_at ?? "").slice(0, 10)) };
  if (!expiry) return { ...base, left: "Not set", leftTitle: "The product's warranty could not be read when it was sold" };
  const total = expiry.getTime() >= start.getTime() ? ymdBetween(start, expiry) : { years: 0, months: 0, days: 0 };
  const today = todayDate();
  const leftDays = Math.round((expiry.getTime() - today.getTime()) / DAY_MS);
  const expires = formatDate(row.warranty_expires_on as string);
  const common = { ...base, total: ymdText(total), expires, leftDays };
  if (leftDays < 0) {
    const ago = ymdText(ymdBetween(expiry, today));
    return { ...common, left: `Expired ${ago} ago`, leftTone: AGE_TONE.old, leftTitle: `Ended ${expires}` };
  }
  if (leftDays === 0) return { ...common, left: "Ends today", leftTone: AGE_TONE.ageing, leftTitle: `Ends ${expires}` };
  const left = ymdText(ymdBetween(today, expiry));
  return {
    ...common,
    left,
    leftTone: leftDays > 60 ? AGE_TONE.fresh : AGE_TONE.ageing,
    leftTitle: `${leftDays} ${leftDays === 1 ? "day" : "days"} left · ends ${expires}`,
  };
}

/**
 * Serial aging: how long ago the unit was purchased (received into stock). A unit still on the shelf ages up to today and is
 * coloured by how long it has sat there (30 days or less, up to 90, older); a unit that has left stock shows how long it
 * stayed - "Sold after 12 days" - and is not coloured, so only stock that is still here draws the eye.
 */
function serialAge(row: InventorySerial): { text: string; title: string; tone: string } | null {
  const received = parseApiTime(row.received_at);
  if (received === null) return null;
  const purchased = formatDate((row.received_at ?? "").slice(0, 10));
  if (row.status === "in_stock" || row.status === "in_transit") {
    const days = Math.max(0, Math.floor((Date.now() - received) / DAY_MS));
    return {
      text: dayCount(days),
      title: `Purchased ${purchased} · ${dayCount(days)} in stock`,
      tone: days <= 30 ? AGE_TONE.fresh : days <= 90 ? AGE_TONE.ageing : AGE_TONE.old,
    };
  }
  const left =
    row.status === "sold" ? (parseApiTime(row.sold_at) ?? parseApiTime(row.updated_at)) : parseApiTime(row.updated_at);
  const days = Math.max(0, Math.floor(((left ?? Date.now()) - received) / DAY_MS));
  const verb = row.status === "sold" ? "Sold" : row.status === "returned" ? "Returned" : "Left stock";
  return {
    text: `${verb} after ${dayCount(days)}`.replace("after Today", "the same day"),
    title: `Purchased ${purchased} · ${verb.toLowerCase()} ${days <= 0 ? "the same day" : `after ${dayCount(days)}`}`,
    tone: AGE_TONE.closed,
  };
}

export function ProductSerialPanel({ itemId }: { itemId: string }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<InventorySerial | null>(null);
  const load = useCallback(
    (page: number, perPage: number) =>
      fetchSerials({ item_id: itemId, q: search, limit: perPage, offset: page * perPage }),
    [itemId, search],
  );
  const list = usePagedHistory<InventorySerial, SerialListMeta>(load);

  // Older API builds don't report total_matching; fall back to the rows seen so far.
  const total = list.meta?.total_matching ?? list.page * list.pageSize + list.rows.length;

  const columnDefs = useMemo<ColDef<InventorySerial>[]>(
    () => [
      {
        colId: "serial_number",
        headerName: "Serial / IMEI",
        field: "serial_number",
        flex: 1,
        minWidth: 150,
        cellClass: "font-mono text-[11px] font-medium",
      },
      {
        colId: "status",
        headerName: "Status",
        field: "status",
        width: 110,
        minWidth: 96,
        cellRenderer: (p: ICellRendererParams<InventorySerial>) =>
          p.data ? (
            <GridChipBadge className={SERIAL_STATUS_TONE[p.data.status] ?? ""} title={SERIAL_STATUS_LABEL[p.data.status]}>
              {SERIAL_STATUS_LABEL[p.data.status] ?? p.data.status}
            </GridChipBadge>
          ) : null,
      },
      {
        colId: "supplier",
        headerName: "Supplier",
        width: 160,
        minWidth: 120,
        valueGetter: (p) => p.data?.supplier_name?.trim() || "—",
        tooltipValueGetter: (p) => p.data?.supplier_name?.trim() || undefined,
      },
      {
        colId: "purchased",
        headerName: "Purchased",
        width: 110,
        minWidth: 96,
        valueGetter: (p) => parseApiTime(p.data?.received_at) ?? 0,
        valueFormatter: (p) => (p.data?.received_at ? formatDate(p.data.received_at.slice(0, 10)) : "—"),
      },
      {
        // serial aging: how long ago it was purchased; click the header to put the oldest (or newest) first
        colId: "age",
        headerName: "Age",
        width: 130,
        minWidth: 100,
        comparator: (_a, _b, nodeA, nodeB) =>
          (parseApiTime(nodeA.data?.received_at) ?? Number.MAX_SAFE_INTEGER) -
          (parseApiTime(nodeB.data?.received_at) ?? Number.MAX_SAFE_INTEGER),
        valueGetter: (p) => (p.data ? (serialAge(p.data)?.text ?? "—") : "—"),
        cellRenderer: (p: ICellRendererParams<InventorySerial>) => {
          const age = p.data ? serialAge(p.data) : null;
          return age ? (
            <GridChipBadge className={age.tone} title={age.title}>
              {age.text}
            </GridChipBadge>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        colId: "purchase_cost",
        headerName: "Cost",
        width: 100,
        minWidth: 80,
        cellClass: "tabular-nums",
        valueGetter: (p) => {
          const cost = Number(p.data?.purchase_unit_cost);
          return p.data?.purchase_unit_cost != null && Number.isFinite(cost) ? cost : null;
        },
        valueFormatter: (p) => (p.value == null ? "—" : formatCurrency(Number(p.value))),
      },
      {
        colId: "source",
        headerName: "Purchased on",
        width: 150,
        minWidth: 110,
        valueGetter: (p) => p.data?.source_label?.trim() || p.data?.source_number?.trim() || "—",
        tooltipValueGetter: (p) => p.data?.source_label?.trim() || undefined,
      },
      {
        colId: "warehouse",
        headerName: "Warehouse",
        width: 130,
        minWidth: 100,
        valueGetter: (p) => (p.data ? serialLocationLabel(p.data) : "—"),
      },
      {
        colId: "customer",
        headerName: "Customer",
        width: 140,
        minWidth: 110,
        valueGetter: (p) => p.data?.customer_name?.trim() || "—",
      },
      {
        colId: "order_number",
        headerName: "Invoice/Order",
        width: 120,
        minWidth: 100,
        cellClass: "font-mono text-[11px]",
        valueGetter: (p) => p.data?.order_number || "—",
      },
      {
        // the warranty runs from the day the unit was sold
        colId: "warranty_start",
        headerName: "Warranty from",
        width: 120,
        minWidth: 100,
        valueGetter: (p) => (p.data ? serialWarranty(p.data).start : "—"),
        comparator: (_a, _b, nodeA, nodeB) =>
          (parseApiTime(nodeA.data?.sold_at) ?? 0) - (parseApiTime(nodeB.data?.sold_at) ?? 0),
      },
      {
        colId: "warranty_total",
        headerName: "Total warranty",
        width: 150,
        minWidth: 120,
        valueGetter: (p) => (p.data ? serialWarranty(p.data).total : "—"),
        comparator: (_a, _b, nodeA, nodeB) => warrantyLength(nodeA.data) - warrantyLength(nodeB.data),
      },
      {
        colId: "warranty_left",
        headerName: "Warranty left",
        width: 190,
        minWidth: 140,
        valueGetter: (p) => (p.data ? serialWarranty(p.data).left : "—"),
        comparator: (_a, _b, nodeA, nodeB) =>
          (nodeA.data ? (serialWarranty(nodeA.data).leftDays ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER) -
          (nodeB.data ? (serialWarranty(nodeB.data).leftDays ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER),
        cellRenderer: (p: ICellRendererParams<InventorySerial>) => {
          const view = p.data ? serialWarranty(p.data) : null;
          if (!view) return <span className="text-muted-foreground">—</span>;
          return view.leftTone ? (
            <GridChipBadge className={view.leftTone} title={view.leftTitle}>
              {view.left}
            </GridChipBadge>
          ) : (
            <span className="text-muted-foreground" title={view.leftTitle || undefined}>
              {view.left}
            </span>
          );
        },
      },
      {
        colId: "warranty_expires",
        headerName: "Warranty ends",
        width: 120,
        minWidth: 100,
        valueGetter: (p) => (p.data ? serialWarranty(p.data).expires : "—"),
      },
    ],
    [],
  );

  if (list.error) return <PanelMessage title="Could not load serials" hint={list.error} tone="error" />;

  return (
    <>
      <AgainListGrid<InventorySerial>
        embedded
        className={HISTORY_GRID_CLASS}
        gridClassName={HISTORY_GRID_CANVAS_CLASS}
        rowData={list.rows}
        columnDefs={columnDefs}
        loading={list.loading && !list.loaded}
        onRowClicked={setSelected}
        filterBar={
          <Input
            placeholder="Search serial, customer, order…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              list.setPage(0);
            }}
            aria-label="Search serials"
            className="h-7 w-[220px] shrink-0 rounded-none"
          />
        }
        serverPaging={{
          total,
          page: list.page,
          pageSize: list.pageSize,
          onPageChange: list.setPage,
          onPageSizeChange: list.setPageSize,
        }}
        emptyTitle={search ? "No serials match" : "No serials registered"}
        emptyHint={search ? "Try a different serial, customer or order number." : "Units are registered on receipt."}
      />
      <SerialDetailSheet
        open={selected !== null}
        serial={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </>
  );
}
