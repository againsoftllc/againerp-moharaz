"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowLeftRight,
  ArrowUpNarrowWide,
  ChartColumn,
  ChartLine,
  ChartPie,
  Check,
  Download,
  Layers,
  RefreshCw,
  Search,
  Settings,
  Table2,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCsv } from "@/components/finance/finance-report-shell";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import type { ApiFinanceReport } from "@/lib/api/finance";
import { formatGroupedNumber } from "@/lib/localisation/company-format";
import { getCompanyFormat } from "@/lib/store/company-format-store";
import { cn } from "@/lib/utils";

/**
 * Odoo-style "Invoices Analysis": one dataset (customer invoices pre-aggregated by month ×
 * customer × status × source), viewed either as a graph (bar / line / pie of one measure over
 * months, optionally stacked by status or cumulative) or as a pivot (rows × columns × measures).
 */

type Fact = {
  month: string;
  quarter: string;
  year: string;
  customer_id: string;
  customer_name: string;
  status: string;
  source_type: string;
  source_label: string;
  untaxed: number;
  tax: number;
  total: number;
  amount_due: number;
  count: number;
};

type MeasureKey = "untaxed" | "tax" | "total" | "amount_due" | "count";
type Dim = "month" | "quarter" | "year" | "customer" | "status" | "source" | "none";

const MEASURES: { key: MeasureKey; label: string }[] = [
  { key: "untaxed", label: "Untaxed Amount" },
  { key: "tax", label: "Tax" },
  { key: "total", label: "Total" },
  { key: "amount_due", label: "Amount Due" },
  { key: "count", label: "Count" },
];

const DIMS: { key: Dim; label: string }[] = [
  { key: "month", label: "Invoice Date: Month" },
  { key: "quarter", label: "Invoice Date: Quarter" },
  { key: "year", label: "Invoice Date: Year" },
  { key: "customer", label: "Customer" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
];

const STATUS_FILTERS = [
  { value: "invoiced", label: "Invoiced" },
  { value: "open", label: "Open" },
  { value: "paid", label: "Paid" },
  { value: "all", label: "All" },
];

// Fixed categorical order (validated palette, dataviz skill): status series never re-map when a
// filter drops one of them.
const STATUS_ORDER = ["paid", "partial", "open", "void"] as const;
const STATUS_LABEL: Record<string, string> = { paid: "Paid", partial: "Partially paid", open: "Open", void: "Void" };
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#7a5cd6", "#8a8a8a"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#8d72e6", "#9a9a9a"];

function str(value: unknown) {
  return value == null ? "" : String(value);
}
function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function fmt(value: number, measure: MeasureKey) {
  if (measure === "count") return String(Math.round(value));
  const grouped = formatGroupedNumber(Math.abs(value), { ...getCompanyFormat(), decimalPlaces: 2 });
  return value < 0 ? `-${grouped}` : grouped;
}
function monthLabel(iso: string) {
  const [y, m] = iso.split("-");
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
}
function dimValue(f: Fact, dim: Dim): { key: string; label: string } {
  switch (dim) {
    case "month":
      return { key: f.month, label: monthLabel(f.month) };
    case "quarter":
      return { key: f.quarter, label: f.quarter.replace("-", " ") };
    case "year":
      return { key: f.year, label: f.year };
    case "customer":
      return { key: f.customer_id, label: f.customer_name };
    case "status":
      return { key: f.status, label: STATUS_LABEL[f.status] ?? f.status };
    case "source":
      return { key: f.source_type, label: f.source_label };
    default:
      return { key: "total", label: "Total" };
  }
}
function isDark() {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  if (root.getAttribute("data-theme") === "dark" || root.classList.contains("dark")) return true;
  if (root.getAttribute("data-theme") === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

type Props = {
  report: ApiFinanceReport | null;
  loading?: boolean;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (iso: string) => void;
  onDateToChange: (iso: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  onRefresh: () => void;
};

export function InvoicesAnalysis({ report, loading = false, dateFrom, dateTo, onDateFromChange, onDateToChange, status, onStatusChange, onRefresh }: Props) {
  const [view, setView] = useState<"graph" | "pivot">("graph");
  const [measure, setMeasure] = useState<MeasureKey>("untaxed");
  const [chart, setChart] = useState<"bar" | "line" | "pie">("line");
  const [stacked, setStacked] = useState(false);
  const [cumulative, setCumulative] = useState(false);
  const [sort, setSort] = useState<"none" | "asc" | "desc">("none");
  const [search, setSearch] = useState("");
  const [pivotMeasures, setPivotMeasures] = useState<MeasureKey[]>(["untaxed"]);
  const [rowDim, setRowDim] = useState<Dim>("customer");
  const [colDim, setColDim] = useState<Dim>("month");
  const [expandedRows, setExpandedRows] = useState(true);

  const facts = useMemo<Fact[]>(() => {
    const rows = (report?.rows ?? []) as Record<string, unknown>[];
    const q = search.trim().toLowerCase();
    return rows
      .map((r) => ({
        month: str(r.month),
        quarter: str(r.quarter),
        year: str(r.year),
        customer_id: str(r.customer_id),
        customer_name: str(r.customer_name),
        status: str(r.status),
        source_type: str(r.source_type),
        source_label: str(r.source_label),
        untaxed: num(r.untaxed),
        tax: num(r.tax),
        total: num(r.total),
        amount_due: num(r.amount_due),
        count: num(r.count),
      }))
      .filter((f) => !q || f.customer_name.toLowerCase().includes(q));
  }, [report, search]);

  const palette = isDark() ? SERIES_DARK : SERIES_LIGHT;
  const measureLabel = MEASURES.find((m) => m.key === measure)?.label ?? "Measure";

  // ---- graph data --------------------------------------------------------------------------
  const graph = useMemo(() => {
    if (chart === "pie") {
      const byCustomer = new Map<string, { name: string; value: number }>();
      for (const f of facts) {
        const slot = byCustomer.get(f.customer_id) ?? { name: f.customer_name, value: 0 };
        slot.value += f[measure];
        byCustomer.set(f.customer_id, slot);
      }
      const sorted = [...byCustomer.values()].sort((a, b) => b.value - a.value);
      const top = sorted.slice(0, 7);
      const rest = sorted.slice(7).reduce((sum, x) => sum + x.value, 0);
      if (rest > 0) top.push({ name: "Other", value: rest });
      return { points: top, series: [] as string[] };
    }
    const months = [...new Set(facts.map((f) => f.month))].sort();
    const series = stacked ? STATUS_ORDER.filter((s) => facts.some((f) => f.status === s)) : [];
    const points = months.map((m) => {
      const row: Record<string, string | number> = { key: m, name: monthLabel(m), value: 0 };
      for (const f of facts) {
        if (f.month !== m) continue;
        row.value = num(row.value) + f[measure];
        if (stacked) row[f.status] = num(row[f.status]) + f[measure];
      }
      return row;
    });
    if (cumulative) {
      let run = 0;
      const runs: Record<string, number> = {};
      for (const p of points) {
        run += num(p.value);
        p.value = run;
        for (const s of series) {
          runs[s] = (runs[s] ?? 0) + num(p[s]);
          p[s] = runs[s];
        }
      }
    }
    if (sort !== "none") points.sort((a, b) => (sort === "asc" ? num(a.value) - num(b.value) : num(b.value) - num(a.value)));
    return { points, series: series as string[] };
  }, [facts, measure, chart, stacked, cumulative, sort]);

  // ---- pivot data --------------------------------------------------------------------------
  const pivot = useMemo(() => {
    const rowKeys = new Map<string, string>();
    const colKeys = new Map<string, string>();
    const cells = new Map<string, Record<MeasureKey, number>>();
    const zero = (): Record<MeasureKey, number> => ({ untaxed: 0, tax: 0, total: 0, amount_due: 0, count: 0 });
    const bump = (k: string, f: Fact) => {
      const c = cells.get(k) ?? zero();
      for (const m of MEASURES) c[m.key] += f[m.key];
      cells.set(k, c);
    };
    for (const f of facts) {
      const r = dimValue(f, rowDim);
      const c = dimValue(f, colDim);
      rowKeys.set(r.key, r.label);
      colKeys.set(c.key, c.label);
      bump(`${r.key}|${c.key}`, f);
      bump(`${r.key}|*`, f);
      bump(`*|${c.key}`, f);
      bump(`*|*`, f);
    }
    const timeDims: Dim[] = ["month", "quarter", "year"];
    const sortKeys = (m: Map<string, string>, dim: Dim) =>
      [...m.entries()].sort((a, b) => (timeDims.includes(dim) ? a[0].localeCompare(b[0]) : a[1].localeCompare(b[1])));
    return { rows: sortKeys(rowKeys, rowDim), cols: colDim === "none" ? [] : sortKeys(colKeys, colDim), cells };
  }, [facts, rowDim, colDim]);

  function exportPivotCsv() {
    const headers = [DIMS.find((d) => d.key === rowDim)?.label ?? "", ...pivot.cols.flatMap(([, label]) => pivotMeasures.map((m) => `${label} · ${MEASURES.find((x) => x.key === m)?.label}`)), ...pivotMeasures.map((m) => `Total · ${MEASURES.find((x) => x.key === m)?.label}`)];
    const line = (rk: string, label: string) => [
      label,
      ...pivot.cols.flatMap(([ck]) => pivotMeasures.map((m) => pivot.cells.get(`${rk}|${ck}`)?.[m] ?? 0)),
      ...pivotMeasures.map((m) => pivot.cells.get(`${rk}|*`)?.[m] ?? 0),
    ];
    downloadCsv(`invoices-analysis-${dateTo}.csv`, headers, [line("*", "Total"), ...pivot.rows.map(([rk, label]) => line(rk, label))]);
    toast.success("Pivot exported");
  }

  const tooltipFmt = (value: unknown) => fmt(num(value), measure);
  const statusFacet = STATUS_FILTERS.find((s) => s.value === status)?.label ?? "Invoiced";

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Control panel — title, search with facets, view switcher */}
      <div className="print-hide flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h1 className="text-lg font-medium">Invoices Analysis</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Report settings">
              <Settings className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={onRefresh} disabled={loading}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportPivotCsv} disabled={!report}>
              <Download className="mr-2 h-3.5 w-3.5" /> Export pivot CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-auto flex min-w-[280px] max-w-[520px] flex-1 items-center gap-1 rounded-md border border-border bg-background px-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex h-7 shrink-0 items-center gap-1 rounded bg-[#875a7b]/20 px-2 text-xs font-medium text-foreground">
                <span className="rounded bg-[#875a7b] px-1 text-[10px] text-white">▼</span> {statusFacet}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {STATUS_FILTERS.map((opt) => (
                <DropdownMenuItem key={opt.value} onClick={() => onStatusChange(opt.value)}>
                  <span className="mr-2 inline-flex w-3.5 justify-center">{status === opt.value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}</span>
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded bg-[#875a7b]/20 px-2 text-xs font-medium text-foreground">
            <span className="rounded bg-[#875a7b] px-1 text-[10px] text-white">▼</span> Customers
          </span>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-8 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
            aria-label="Search customers"
          />
          {search ? (
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setSearch("")} aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <DateRangePresetPicker
          value={{ dateFrom, dateTo }}
          onChange={(next) => {
            onDateFromChange(next.dateFrom);
            onDateToChange(next.dateTo);
          }}
        />

        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            className={cn("inline-flex h-8 w-9 items-center justify-center", view === "graph" ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted/50")}
            onClick={() => setView("graph")}
            aria-label="Graph view"
            aria-pressed={view === "graph"}
          >
            <TrendingUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn("inline-flex h-8 w-9 items-center justify-center border-l border-border", view === "pivot" ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted/50")}
            onClick={() => setView("pivot")}
            aria-label="Pivot view"
            aria-pressed={view === "pivot"}
          >
            <Table2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* View toolbar */}
      <div className="print-hide flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {view === "graph" ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" className="h-8 rounded-md bg-[#875a7b] px-3 text-sm font-medium text-white hover:bg-[#6d4864]">
                  {measureLabel} ▾
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {MEASURES.map((m) => (
                  <DropdownMenuItem key={m.key} onClick={() => setMeasure(m.key)}>
                    <span className="mr-2 inline-flex w-3.5 justify-center">{measure === m.key ? <Check className="h-3.5 w-3.5 text-primary" /> : null}</span>
                    {m.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              {(
                [
                  ["bar", ChartColumn, "Bar chart"],
                  ["line", ChartLine, "Line chart"],
                  ["pie", ChartPie, "Pie chart"],
                ] as const
              ).map(([key, Icon, label], i) => (
                <button
                  key={key}
                  type="button"
                  className={cn("inline-flex h-8 w-9 items-center justify-center", i > 0 && "border-l border-border", chart === key ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted/50")}
                  onClick={() => setChart(key)}
                  aria-label={label}
                  aria-pressed={chart === key}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                className={cn("inline-flex h-8 w-9 items-center justify-center", stacked ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted/50")}
                onClick={() => setStacked((v) => !v)}
                aria-label="Stack by status"
                aria-pressed={stacked}
                disabled={chart === "pie"}
              >
                <Layers className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cn("inline-flex h-8 w-9 items-center justify-center border-l border-border", cumulative ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted/50")}
                onClick={() => setCumulative((v) => !v)}
                aria-label="Cumulative"
                aria-pressed={cumulative}
                disabled={chart === "pie"}
              >
                <TrendingUp className="h-4 w-4" />
              </button>
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                className={cn("inline-flex h-8 w-9 items-center justify-center", sort === "desc" ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted/50")}
                onClick={() => setSort((s) => (s === "desc" ? "none" : "desc"))}
                aria-label="Sort descending"
                aria-pressed={sort === "desc"}
                disabled={chart === "pie"}
              >
                <ArrowDownWideNarrow className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cn("inline-flex h-8 w-9 items-center justify-center border-l border-border", sort === "asc" ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted/50")}
                onClick={() => setSort((s) => (s === "asc" ? "none" : "asc"))}
                aria-label="Sort ascending"
                aria-pressed={sort === "asc"}
                disabled={chart === "pie"}
              >
                <ArrowUpNarrowWide className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" className="h-8 rounded-md bg-[#875a7b] px-3 text-sm font-medium text-white hover:bg-[#6d4864]">
                  Measures ▾
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {MEASURES.map((m) => (
                  <DropdownMenuCheckboxItem
                    key={m.key}
                    checked={pivotMeasures.includes(m.key)}
                    onCheckedChange={(on) =>
                      setPivotMeasures((prev) => {
                        const next = on ? [...prev, m.key] : prev.filter((k) => k !== m.key);
                        return next.length ? MEASURES.map((x) => x.key).filter((k) => next.includes(k)) : prev;
                      })
                    }
                  >
                    {m.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="secondary" size="sm" className="h-8 rounded-md px-3 text-xs font-medium">
                  Rows: {DIMS.find((d) => d.key === rowDim)?.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {DIMS.map((d) => (
                  <DropdownMenuItem key={d.key} onClick={() => setRowDim(d.key)}>
                    <span className="mr-2 inline-flex w-3.5 justify-center">{rowDim === d.key ? <Check className="h-3.5 w-3.5 text-primary" /> : null}</span>
                    {d.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="secondary" size="sm" className="h-8 rounded-md px-3 text-xs font-medium">
                  Columns: {colDim === "none" ? "Total only" : DIMS.find((d) => d.key === colDim)?.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {[...DIMS, { key: "none" as Dim, label: "Total only" }].map((d) => (
                  <DropdownMenuItem key={d.key} onClick={() => setColDim(d.key)}>
                    <span className="mr-2 inline-flex w-3.5 justify-center">{colDim === d.key ? <Check className="h-3.5 w-3.5 text-primary" /> : null}</span>
                    {d.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setColDim(colDim === "none" ? "month" : colDim)}>Reset</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                className="inline-flex h-8 w-9 items-center justify-center text-muted-foreground hover:bg-muted/50"
                onClick={() => {
                  const r = rowDim;
                  setRowDim(colDim === "none" ? "month" : colDim);
                  setColDim(r);
                }}
                aria-label="Flip axis"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cn("inline-flex h-8 w-9 items-center justify-center border-l border-border", expandedRows ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted/50")}
                onClick={() => setExpandedRows((v) => !v)}
                aria-label={expandedRows ? "Collapse rows" : "Expand rows"}
                aria-pressed={expandedRows}
              >
                <Layers className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-9 items-center justify-center border-l border-border text-muted-foreground hover:bg-muted/50"
                onClick={exportPivotCsv}
                aria-label="Download pivot"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {loading ? "Loading…" : `${num(report?.totals?.count)} invoices · ${num(report?.totals?.customer_count)} customers`}
        </span>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto px-3 py-4 sm:px-6">
        {loading && !report ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading invoices analysis…</p>
        ) : facts.length === 0 ? (
          <p className="mx-auto max-w-lg py-16 text-center text-base font-semibold">
            From this report, you can have an overview of the amount invoiced to your customers. The search tool can also be used to personalise your Invoices reports and so, match this analysis to your needs.
          </p>
        ) : view === "graph" ? (
          <div className="h-[calc(100vh-260px)] min-h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chart === "pie" ? (
                <PieChart>
                  <Pie data={graph.points} dataKey="value" nameKey="name" innerRadius="35%" outerRadius="80%" paddingAngle={1} stroke="var(--background)" strokeWidth={2}>
                    {graph.points.map((_, i) => (
                      <Cell key={i} fill={palette[i % palette.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={tooltipFmt} />
                  <Legend />
                </PieChart>
              ) : chart === "bar" ? (
                <BarChart data={graph.points} margin={{ top: 16, right: 16, left: 8, bottom: 8 }} barCategoryGap="30%">
                  <CartesianGrid vertical={false} strokeOpacity={0.15} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => fmt(num(v), measure)} />
                  <Tooltip formatter={tooltipFmt} cursor={{ fillOpacity: 0.06 }} />
                  {graph.series.length ? <Legend /> : null}
                  {graph.series.length ? (
                    graph.series.map((s, i) => (
                      <Bar key={s} dataKey={s} name={STATUS_LABEL[s] ?? s} stackId="status" fill={palette[i]} stroke="var(--background)" strokeWidth={2} radius={i === graph.series.length - 1 ? [4, 4, 0, 0] : 0} />
                    ))
                  ) : (
                    <Bar dataKey="value" name={measureLabel} fill={palette[0]} radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              ) : (
                <LineChart data={graph.points} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => fmt(num(v), measure)} />
                  <Tooltip formatter={tooltipFmt} />
                  {graph.series.length ? <Legend /> : null}
                  {graph.series.length ? (
                    graph.series.map((s, i) => (
                      <Line key={s} type="monotone" dataKey={s} name={STATUS_LABEL[s] ?? s} stroke={palette[i]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--background)" }} activeDot={{ r: 6 }} />
                    ))
                  ) : (
                    <Line type="monotone" dataKey="value" name={measureLabel} stroke={palette[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--background)" }} activeDot={{ r: 6 }} />
                  )}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-[13px]">
              <thead>
                {pivot.cols.length ? (
                  <tr>
                    <th className="border-b border-border px-3 py-2 text-left font-semibold" />
                    <th colSpan={pivot.cols.length * pivotMeasures.length} className="border-b border-border px-3 py-2 text-left font-semibold">
                      ⊟ Total
                    </th>
                    <th colSpan={pivotMeasures.length} className="border-b border-border px-3 py-2" />
                  </tr>
                ) : null}
                <tr>
                  <th className="border-b border-border px-3 py-2 text-left font-semibold" />
                  {pivot.cols.map(([ck, label]) => (
                    <th key={ck} colSpan={pivotMeasures.length} className="whitespace-nowrap border-b border-l border-border px-3 py-2 text-left font-semibold">
                      ⊞ {label}
                    </th>
                  ))}
                  <th colSpan={pivotMeasures.length} className="whitespace-nowrap border-b border-l border-border px-3 py-2 text-left font-semibold">Total</th>
                </tr>
                {pivotMeasures.length > 1 || pivot.cols.length ? (
                  <tr>
                    <th className="border-b border-border" />
                    {[...pivot.cols.map(([ck]) => ck), "*"].map((ck) =>
                      pivotMeasures.map((m) => (
                        <th key={`${ck}-${m}`} className="whitespace-nowrap border-b border-border px-3 py-1 text-right text-[12px] font-medium text-muted-foreground">
                          {MEASURES.find((x) => x.key === m)?.label}
                        </th>
                      )),
                    )}
                  </tr>
                ) : null}
              </thead>
              <tbody>
                <tr className="bg-muted/40 font-semibold">
                  <td className="whitespace-nowrap px-3 py-2">⊟ Total</td>
                  {[...pivot.cols.map(([ck]) => ck), "*"].map((ck) =>
                    pivotMeasures.map((m) => (
                      <td key={`t-${ck}-${m}`} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {fmt(pivot.cells.get(`*|${ck}`)?.[m] ?? 0, m)}
                      </td>
                    )),
                  )}
                </tr>
                {expandedRows
                  ? pivot.rows.map(([rk, label]) => (
                      <tr key={rk} className="border-b border-border/60">
                        <td className="whitespace-nowrap px-3 py-2 pl-8 text-muted-foreground">⊞ {label}</td>
                        {[...pivot.cols.map(([ck]) => ck), "*"].map((ck) =>
                          pivotMeasures.map((m) => {
                            const v = pivot.cells.get(`${rk}|${ck}`)?.[m];
                            return (
                              <td key={`${rk}-${ck}-${m}`} className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground", ck === "*" && "font-medium text-foreground")}>
                                {v == null ? "" : fmt(v, m)}
                              </td>
                            );
                          }),
                        )}
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
