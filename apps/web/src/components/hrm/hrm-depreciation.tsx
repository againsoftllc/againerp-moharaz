"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Download,
  Filter,
  LayoutDashboard,
  List,
  Printer,
  Search,
  ShoppingCart,
} from "lucide-react";
import {
  DEPRECIATION_METHOD_LABEL,
  DEPRECIATION_METHOD_OPTIONS,
  depreciationPct,
  formatDepMoney,
  pctOf,
  type AssetDepreciationRow,
  type DepreciationMethod,
} from "@/lib/mock-data/hrm-depreciation";
import { listAssetDepreciationReportRows } from "@/lib/api/hrm-assets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type SortKey =
  | "assetName"
  | "purchaseDate"
  | "purchaseCost"
  | "currentValue"
  | "depreciationAmount";
type SortDir = "asc" | "desc";

export function HrmDepreciation() {
  const [rows, setRows] = useState<AssetDepreciationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftMethod, setDraftMethod] = useState<"all" | DepreciationMethod>("all");
  const [methodFilter, setMethodFilter] = useState<"all" | DepreciationMethod>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("purchaseCost");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await listAssetDepreciationReportRows();
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load report");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const totalPurchaseValue = rows.reduce((sum, row) => sum + row.purchaseCost, 0);
    const totalCurrentValue = rows.reduce((sum, row) => sum + row.currentValue, 0);
    const totalDepreciation = rows.reduce((sum, row) => sum + row.depreciationAmount, 0);
    return { totalPurchaseValue, totalCurrentValue, totalDepreciation };
  }, [rows]);
  const currentPct = pctOf(summary.totalCurrentValue, summary.totalPurchaseValue);
  const depPct = pctOf(summary.totalDepreciation, summary.totalPurchaseValue);

  const filtered = useMemo(() => {
    let list = rows;
    if (methodFilter !== "all") list = list.filter((r) => r.method === methodFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.assetName.toLowerCase().includes(q) ||
          r.assetType.toLowerCase().includes(q) ||
          DEPRECIATION_METHOD_LABEL[r.method].toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, methodFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "assetName" ? "asc" : "desc");
    }
  }

  function exportCsv() {
    const header = [
      "Asset Name",
      "Type",
      "Purchase Date",
      "Purchase Cost",
      "Method",
      "Current Value",
      "Depreciation",
      "Depreciation %",
    ];
    const lines = filtered.map((r) =>
      [
        r.assetName,
        r.assetType,
        r.purchaseDate,
        r.purchaseCost,
        DEPRECIATION_METHOD_LABEL[r.method],
        r.currentValue,
        r.depreciationAmount,
        depreciationPct(r.purchaseCost, r.depreciationAmount).toFixed(2),
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "asset-depreciation-report.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported depreciation report");
  }

  function printReport() {
    window.print();
  }

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      onClick={() => toggleSort(col)}
    >
      {label}
      <span className="text-[10px] opacity-60">
        {sortKey === col ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );

  const fieldClass =
    "h-9 w-full rounded-none border border-border bg-background px-2 text-sm text-foreground";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Asset Depreciation Report
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild type="button" variant="outline" size="sm" className="h-9 rounded-none">
            <Link href="/hrm/assets">
              <List className="size-3.5" />
              Asset List
            </Link>
          </Button>
          <Button asChild type="button" variant="outline" size="sm" className="h-9 rounded-none">
            <Link href="/hrm/assets/dashboard">
              <LayoutDashboard className="size-3.5" />
              Dashboard
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-none"
            onClick={printReport}
          >
            <Printer className="size-3.5" />
            Print
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-none"
            onClick={exportCsv}
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      <h1 className="hidden text-xl font-semibold print:block">Asset Depreciation Report</h1>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search..."
            className="h-9 rounded-none pl-8"
          />
        </div>
        <Button type="button" size="sm" className={cn("h-9", GREEN_BTN)} onClick={() => setPage(1)}>
          <Search className="size-3.5" />
          Search
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-none"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <Filter className="size-3.5" />
          Filters
        </Button>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Per Page:
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
            className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
          >
            {[50, 100, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtersOpen ? (
        <div className="rounded-none border border-border bg-card p-3 print:hidden">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[180px] flex-col gap-1 text-xs text-muted-foreground">
              Depreciation Method
              <select
                value={draftMethod}
                onChange={(e) =>
                  setDraftMethod(e.target.value as "all" | DepreciationMethod)
                }
                className={fieldClass}
              >
                <option value="all">All</option>
                {DEPRECIATION_METHOD_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className={cn("h-9", GREEN_BTN)}
                onClick={() => {
                  setMethodFilter(draftMethod);
                  setPage(1);
                }}
              >
                Apply Filters
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-none"
                onClick={() => {
                  setDraftMethod("all");
                  setMethodFilter("all");
                  setSearch("");
                  setPage(1);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          title="Total Purchase Value"
          value={formatDepMoney(summary.totalPurchaseValue)}
          caption="Original cost of all assets"
          icon={<ShoppingCart className="size-4" />}
          theme="sky"
        />
        <SummaryCard
          title="Total Current Value"
          value={formatDepMoney(summary.totalCurrentValue)}
          caption={`${currentPct}% of purchase value`}
          captionIcon={<ArrowUpRight className="size-3.5" />}
          icon={<DollarSign className="size-4" />}
          theme="emerald"
          progress={currentPct}
        />
        <SummaryCard
          title="Total Depreciation"
          value={formatDepMoney(summary.totalDepreciation)}
          caption={`${depPct}% of purchase value`}
          captionIcon={<ArrowDownRight className="size-3.5" />}
          icon={<ArrowDownRight className="size-4" />}
          theme="rose"
          progress={depPct}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">Asset Depreciation Details</div>
        </div>
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Asset Name" col="assetName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Purchase Date" col="purchaseDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Purchase Cost" col="purchaseCost" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Depreciation Method
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Current Value" col="currentValue" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Depreciation" col="depreciationAmount" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Depreciation %
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading depreciation records...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No depreciation records found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => {
                const pct = depreciationPct(row.purchaseCost, row.depreciationAmount);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/20"
                  >
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {(pageSafe - 1) * perPage + idx + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground">{row.assetName}</div>
                      <div className="text-xs text-muted-foreground">{row.assetType}</div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{row.purchaseDate}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {formatDepMoney(row.purchaseCost)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className="rounded-none border-sky-500/30 bg-sky-500/15 text-[10px] font-normal text-sky-800 dark:text-sky-300"
                      >
                        {DEPRECIATION_METHOD_LABEL[row.method]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-medium text-emerald-700 dark:text-emerald-300">
                      {formatDepMoney(row.currentValue)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-medium text-red-600 dark:text-red-400">
                      {formatDepMoney(row.depreciationAmount)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{pct.toFixed(2)}%</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground print:hidden">
        <span>
          Showing{" "}
          {filtered.length === 0 ? 0 : (pageSafe - 1) * perPage + 1}–
          {Math.min(pageSafe * perPage, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none"
            disabled={pageSafe <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <span className="px-2 tabular-nums">
            {pageSafe} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none"
            disabled={pageSafe >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  caption,
  captionIcon,
  icon,
  theme,
  progress,
}: {
  title: string;
  value: string;
  caption: string;
  captionIcon?: ReactNode;
  icon: ReactNode;
  theme: "sky" | "emerald" | "rose";
  progress?: number;
}) {
  const themes = {
    sky: {
      icon: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      bar: "bg-sky-500",
      value: "text-sky-700 dark:text-sky-300",
    },
    emerald: {
      icon: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      bar: "bg-emerald-500",
      value: "text-emerald-700 dark:text-emerald-300",
    },
    rose: {
      icon: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      bar: "bg-rose-500",
      value: "text-rose-700 dark:text-rose-300",
    },
  }[theme];

  return (
    <div className="overflow-hidden rounded-none border border-border bg-card">
      <div className="flex items-start justify-between gap-2 p-4">
        <div>
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className={cn("mt-1 text-xl font-semibold tabular-nums", themes.value)}>
            {value}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {captionIcon}
            {caption}
          </div>
        </div>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-none border",
            themes.icon,
          )}
        >
          {icon}
        </div>
      </div>
      <div className="h-1.5 w-full bg-muted">
        <div
          className={cn("h-full", themes.bar)}
          style={{ width: `${progress ?? 100}%` }}
        />
      </div>
    </div>
  );
}
