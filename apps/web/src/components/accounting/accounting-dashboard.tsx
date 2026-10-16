"use client";

import { useId, useState, type ReactNode } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Calculator,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  FileSpreadsheet,
  FileText,
  Files,
  Folder,
  Package,
  Settings2,
} from "lucide-react";
import {
  ACCOUNTING_KPI_CARDS,
  ACCOUNTING_KPI_ROWS,
  ACCOUNTING_PERIOD_TREND,
  ACCOUNTING_REMINDERS,
  ACCOUNTING_SHORTCUTS,
  type AccountingKpiRow,
  type AccountingShortcutGroup,
} from "@/lib/mock-data/accounting-dashboard";
import { chartValueAsNumber } from "@/lib/charts/recharts-tooltip";
import { useIsDark } from "@/lib/use-is-dark";
import { cn, formatMoney, formatQuantity } from "@/lib/utils";

type ChartKind = "bar" | "stacked-bar" | "line" | "area" | "stacked-area";

const LINK = "text-[#125ab2] hover:underline dark:text-sky-400";

const TILES = [
  { id: "balance-sheet", label: "Balance Sheet", color: "#d4a017", Icon: FileSpreadsheet },
  { id: "trial-balance", label: "Trial Balance", color: "#b86b32", Icon: FileText },
  { id: "income-statement", label: "Income Statement", color: "#6d7c93", Icon: CircleDollarSign },
  { id: "budget-actual", label: "Budget vs Actual", color: "#5d9a45", Icon: BarChart3 },
] as const;

const REMINDER_BAR: Record<string, string> = {
  info: "#2f6fed",
  danger: "#d64545",
  warn: "#e3a008",
};

const SHORTCUT_ICONS: Record<AccountingShortcutGroup["icon"], typeof BarChart3> = {
  sales: BarChart3,
  inventory: Package,
  arap: Files,
  financials: Calculator,
};

const CHART_TYPES: { id: ChartKind; label: string; bars: number[]; stacked?: boolean; line?: boolean; area?: boolean }[] = [
  { id: "bar", label: "Column", bars: [4, 7, 5] },
  { id: "stacked-bar", label: "Stacked column", bars: [4, 7, 5], stacked: true },
  { id: "line", label: "Line", bars: [], line: true },
  { id: "area", label: "Area", bars: [], area: true },
  { id: "stacked-area", label: "Stacked area", bars: [], area: true, stacked: true },
];

function money(value: number) {
  return formatMoney(value);
}

function axisK(value: unknown) {
  const n = chartValueAsNumber(value);
  return `${formatMoney(n / 1000)}K`;
}

function axisCount(value: unknown) {
  return formatQuantity(chartValueAsNumber(value));
}

function HomeBar() {
  return (
    <div className="mb-2.5 flex h-9 shrink-0 items-center justify-between gap-3 border border-[#d7dce1] bg-[#e9ecef] px-3 dark:border-border dark:bg-muted">
      <h1 className="text-[15px] font-semibold text-[#333] dark:text-foreground">Home</h1>
      <div className="flex items-center gap-1">
        {["Viewing: Portlet date settings", "Personalize", "Layout"].map((label) => (
          <button
            key={label}
            type="button"
            className="inline-flex h-7 items-center gap-0.5 rounded-none border border-[#c5ccd3] bg-white px-2 text-[11px] text-[#333] hover:bg-[#f7f8fa] dark:border-border dark:bg-background dark:text-foreground dark:hover:bg-muted"
          >
            {label}
            <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

function TileTexture() {
  const patternId = useId().replace(/:/g, "");
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-30" aria-hidden>
      <defs>
        <pattern id={patternId} width="48" height="24" patternUnits="userSpaceOnUse">
          <path d="M0 12 C8 4, 16 4, 24 12 S40 20, 48 12" fill="none" stroke="white" strokeWidth="1.2" />
          <path d="M0 18 C8 10, 16 10, 24 18 S40 26, 48 18" fill="none" stroke="white" strokeWidth="1" opacity="0.7" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

function Portlet({
  title,
  toolbar,
  className,
  children,
}: {
  title: string;
  toolbar?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-h-0 flex-col rounded-none border border-[#d7dce1] bg-white dark:border-border dark:bg-card", className)}>
      <header className="flex h-8 shrink-0 items-center justify-between gap-2 px-3">
        <button type="button" className="inline-flex min-w-0 items-center gap-0.5 text-left">
          <h2 className="truncate text-[13px] font-semibold text-[#333] dark:text-foreground">{title}</h2>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        </button>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`${title} settings`}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </header>
      {toolbar ? (
        <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-t border-[#edf0f3] px-3 dark:border-border">
          {toolbar}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 border-t border-[#edf0f3] dark:border-border">{children}</div>
    </section>
  );
}

function PeriodSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-[22px] rounded-none border border-[#c5ccd3] bg-white px-1.5 text-[11px] text-[#333] outline-none dark:border-border dark:bg-background dark:text-foreground"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function ChartTypeIcon({ kind, active }: { kind: ChartKind; active: boolean }) {
  const stroke = active ? "#125ab2" : "#6b7280";
  if (kind === "line") {
    return (
      <svg viewBox="0 0 16 12" className="h-3 w-4" aria-hidden>
        <path d="M1 10 L5 6 L9 8 L15 2" fill="none" stroke={stroke} strokeWidth="1.4" />
      </svg>
    );
  }
  if (kind === "area" || kind === "stacked-area") {
    return (
      <svg viewBox="0 0 16 12" className="h-3 w-4" aria-hidden>
        <path d="M1 10 L5 5 L9 7 L15 2 L15 11 L1 11 Z" fill={stroke} fillOpacity={kind === "stacked-area" ? 0.45 : 0.35} stroke={stroke} strokeWidth="1" />
        {kind === "stacked-area" ? <path d="M1 10 L5 7 L9 8.5 L15 6 L15 11 L1 11 Z" fill={stroke} fillOpacity="0.7" /> : null}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 12" className="h-3 w-4" aria-hidden>
      <rect x="1" y="6" width="3" height="5" fill={stroke} />
      <rect x="6" y="3" width="3" height="8" fill={stroke} />
      <rect x="11" y="5" width="3" height="6" fill={stroke} />
      {kind === "stacked-bar" ? (
        <>
          <rect x="1" y="4" width="3" height="2" fill={stroke} opacity="0.45" />
          <rect x="6" y="1" width="3" height="2" fill={stroke} opacity="0.45" />
          <rect x="11" y="3" width="3" height="2" fill={stroke} opacity="0.45" />
        </>
      ) : null}
    </svg>
  );
}

function ChartTypeToggle({ value, onChange }: { value: ChartKind; onChange: (v: ChartKind) => void }) {
  return (
    <div className="inline-flex items-center gap-px">
      {CHART_TYPES.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.label}
          aria-label={item.label}
          className={cn(
            "inline-flex h-[22px] w-[22px] items-center justify-center rounded-none border border-transparent hover:bg-[#eef2f6] dark:hover:bg-muted",
            value === item.id && "border-[#c5ccd3] bg-[#e8eef4] dark:border-border dark:bg-muted",
          )}
          onClick={() => onChange(item.id)}
        >
          <ChartTypeIcon kind={item.id} active={value === item.id} />
        </button>
      ))}
    </div>
  );
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const w = 92;
  const h = 32;
  const d = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * w;
      const y = h - 2 - ((p - min) / (max - min || 1)) * (h - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-[92px] shrink-0" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.7" />
    </svg>
  );
}

function ChangeCell({
  row,
  large,
}: {
  row: Pick<AccountingKpiRow, "changePct" | "direction" | "tone">;
  large?: boolean;
}) {
  const Arrow = row.direction === "up" ? ArrowUp : ArrowDown;
  const color =
    row.tone === "good"
      ? "text-[#2d8a2d] dark:text-emerald-400"
      : row.tone === "bad"
        ? "text-[#d64545] dark:text-red-400"
        : "text-foreground";
  return (
    <span className={cn("inline-flex items-center gap-0.5 tabular-nums", color, large && "text-[18px] font-semibold leading-none")}>
      <Arrow className={large ? "h-4 w-4" : "h-3 w-3"} aria-hidden />
      {row.changePct.toFixed(1)}%
    </span>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  asCount,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
  asCount?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-none border border-border bg-background px-2.5 py-2 text-xs shadow-md">
      {label ? <p className="mb-1 font-semibold">{label}</p> : null}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-none" style={{ background: p.color ?? "var(--foreground)" }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium tabular-nums">
            {asCount ? axisCount(p.value) : money(chartValueAsNumber(p.value))}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatPeriodTick(value: unknown) {
  const raw = String(value ?? "");
  const m = raw.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  return m ? `${m[1]} '${m[2].slice(2)}` : raw;
}

function TrendChart({
  kind,
  dataKey,
  color,
  showAverage,
  height,
  yMax,
  asCount,
  stackedKey,
  stackedColor,
}: {
  kind: ChartKind;
  dataKey: "income" | "revenue" | "newBusiness";
  color: string;
  showAverage?: boolean;
  height: number;
  yMax: number;
  asCount?: boolean;
  stackedKey?: "newBusinessRepeat";
  stackedColor?: string;
}) {
  const isDark = useIsDark();
  const tick = isDark ? "#ffffff" : "#607080";
  const grid = isDark ? "hsla(0,0%,100%,0.16)" : "#e6eaee";
  const label = dataKey === "income" ? "Income" : dataKey === "revenue" ? "Revenue" : "New business";
  const maStroke = isDark ? "#e2e8f0" : "#7a8794";
  const stacked = kind === "stacked-bar" || kind === "stacked-area";
  const useBar = kind === "bar" || kind === "stacked-bar";
  const useLine = kind === "line";
  const useArea = kind === "area" || kind === "stacked-area";
  const legendItems = [
    { name: label, color, dashed: false },
    ...(showAverage ? [{ name: "Moving Average", color: maStroke, dashed: true }] : []),
    ...(stacked && stackedKey ? [{ name: "Repeat", color: stackedColor ?? "#8fb8c9", dashed: false }] : []),
  ];

  return (
    <div
      className={cn(
        isDark && "[&_.recharts-cartesian-axis-tick_text]:fill-white [&_.recharts-text]:fill-white",
      )}
    >
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={ACCOUNTING_PERIOD_TREND} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
            <CartesianGrid stroke={grid} strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 10, fill: tick }}
              tickLine={false}
              axisLine={{ stroke: grid }}
              interval="preserveStartEnd"
              minTickGap={28}
              tickFormatter={formatPeriodTick}
              height={22}
            />
            <YAxis
              domain={[0, yMax]}
              tick={{ fontSize: 10, fill: tick }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={asCount ? axisCount : axisK}
            />
            <Tooltip content={<ChartTooltip asCount={asCount} />} />
            {useBar ? (
              <Bar dataKey={dataKey} name={label} fill={color} radius={0} maxBarSize={26} stackId={stacked ? "s" : undefined} />
            ) : null}
            {useBar && stacked && stackedKey ? (
              <Bar dataKey={stackedKey} name="Repeat" fill={stackedColor ?? "#9ec6d8"} radius={0} maxBarSize={26} stackId="s" />
            ) : null}
            {useLine ? (
              <Line type="monotone" dataKey={dataKey} name={label} stroke={color} strokeWidth={2} dot={false} />
            ) : null}
            {useArea ? (
              <Area
                type="monotone"
                dataKey={dataKey}
                name={label}
                stroke={color}
                fill={color}
                fillOpacity={0.45}
                strokeWidth={1.5}
                stackId={stacked ? "a" : undefined}
              />
            ) : null}
            {useArea && stacked && stackedKey ? (
              <Area
                type="monotone"
                dataKey={stackedKey}
                name="Repeat"
                stroke={stackedColor ?? "#8fb8c9"}
                fill={stackedColor ?? "#8fb8c9"}
                fillOpacity={0.55}
                strokeWidth={1}
                stackId="a"
              />
            ) : null}
            {showAverage ? (
              <Line
                type="monotone"
                dataKey="movingAverage"
                name="Moving Average"
                stroke={maStroke}
                strokeDasharray="5 4"
                strokeWidth={1.4}
                dot={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {legendItems.length > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-2 pb-2 pt-1 text-[11px] text-foreground">
          {legendItems.map((item) => (
            <span key={item.name} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {item.dashed ? (
                <span className="inline-block w-4 border-t border-dashed" style={{ borderColor: item.color }} />
              ) : (
                <span className="inline-block h-2 w-2 shrink-0 rounded-none" style={{ backgroundColor: item.color }} />
              )}
              {item.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChartToolbar({
  period,
  onPeriod,
  options,
  kind,
  onKind,
}: {
  period: string;
  onPeriod: (v: string) => void;
  options: string[];
  kind: ChartKind;
  onKind: (v: ChartKind) => void;
}) {
  return (
    <>
      <PeriodSelect value={period} onChange={onPeriod} options={options} />
      <ChartTypeToggle value={kind} onChange={onKind} />
    </>
  );
}

export function AccountingDashboard() {
  const [incomePeriod, setIncomePeriod] = useState("By Period");
  const [revenuePeriod, setRevenuePeriod] = useState("By Period");
  const [newBizPeriod, setNewBizPeriod] = useState("Monthly");
  const [incomeKind, setIncomeKind] = useState<ChartKind>("area");
  const [revenueKind, setRevenueKind] = useState<ChartKind>("area");
  const [newBizKind, setNewBizKind] = useState<ChartKind>("stacked-area");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#f0f2f5] p-3 text-foreground dark:bg-background">
      <HomeBar />
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(200px,18%)_minmax(0,1fr)_minmax(260px,24%)]">
        <div className="flex flex-col gap-2.5">
          <Portlet title="Reminders">
            <ul>
              {ACCOUNTING_REMINDERS.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 py-2 pr-3 text-left hover:bg-[#f7f9fb] dark:hover:bg-muted/40"
                    style={{ borderLeft: `6px solid ${REMINDER_BAR[item.tone]}`, paddingLeft: 10 }}
                  >
                    <span className="text-[15px] font-bold tabular-nums text-[#333] dark:text-foreground">{item.count}</span>
                    <span className={cn("text-[13px]", LINK)}>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Portlet>

          <Portlet title="Navigation Shortcut Group" className="flex-1">
            <div className="px-3 pb-3 pt-2">
              <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#333] dark:text-foreground">
                <Folder className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                Executive Management
              </p>
              <div className="space-y-2">
                {ACCOUNTING_SHORTCUTS.map((group) => {
                  const Icon = SHORTCUT_ICONS[group.icon];
                  return (
                    <div key={group.id} className="pl-1">
                      <p className="mb-0.5 flex items-center gap-1.5 text-[12px] font-semibold text-[#333] dark:text-foreground">
                        <Icon className="h-3.5 w-3.5 text-[#607080]" aria-hidden />
                        {group.label}
                      </p>
                      <ul className="ml-[22px]">
                        {group.links.map((link) => (
                          <li key={link.id}>
                            <button type="button" className={cn("py-0.5 text-left text-[12px]", LINK)}>
                              {link.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </Portlet>
        </div>

        <div className="flex min-w-0 flex-col gap-2.5">
          <Portlet title="Tiles">
            <div className="grid grid-cols-2 gap-2 p-2 lg:grid-cols-4">
              {TILES.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  className="relative flex h-[108px] flex-col items-center justify-center gap-2 overflow-hidden rounded-none text-[13px] font-semibold text-white"
                  style={{ backgroundColor: tile.color }}
                >
                  <TileTexture />
                  <tile.Icon className="relative h-9 w-9" strokeWidth={1.4} />
                  <span className="relative">{tile.label}</span>
                </button>
              ))}
            </div>
          </Portlet>

          <Portlet title="Key Performance Indicators">
            <div className="grid grid-cols-2 lg:grid-cols-4">
              {ACCOUNTING_KPI_CARDS.map((card, i) => (
                <div
                  key={card.id}
                  className={cn(
                    "px-3 py-2.5",
                    i > 0 && "lg:border-l lg:border-[#edf0f3] dark:lg:border-border",
                    i % 2 === 1 && "border-l border-[#edf0f3] lg:border-l dark:border-border",
                  )}
                >
                  <p className="text-[12px] text-[#555] dark:text-muted-foreground">{card.label}</p>
                  <div className="mt-1.5 flex items-end justify-between gap-2">
                    <ChangeCell row={card} large />
                    <Sparkline
                      points={card.sparkline}
                      color={card.tone === "bad" ? "#d64545" : "#2d8a2d"}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto border-t border-[#edf0f3] dark:border-border">
              <table className="w-full min-w-[680px] text-left text-[12px]">
                <thead className="bg-[#f7f8fa] text-[11px] text-[#607080] dark:bg-muted/40 dark:text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-semibold">Indicator</th>
                    <th className="px-3 py-1.5 font-semibold">Period</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Current</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Previous</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {ACCOUNTING_KPI_ROWS.map((row, i) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-t border-[#edf0f3] dark:border-border",
                        i % 2 === 1 && "bg-[#f7f9fb] dark:bg-muted/20",
                      )}
                    >
                      <td className="px-3 py-1.5 text-[#333] dark:text-foreground">
                        <span className="inline-flex items-center gap-1">
                          <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden />
                          {row.indicator}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <button type="button" className={cn("text-left", LINK)}>
                          {row.period}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(row.current)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[#555] dark:text-muted-foreground">
                        {money(row.previous)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <ChangeCell row={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Portlet>

          <Portlet
            title="Income By Period Trend"
            toolbar={
              <ChartToolbar
                period={incomePeriod}
                onPeriod={setIncomePeriod}
                options={["By Period", "By Quarter", "By Year"]}
                kind={incomeKind}
                onKind={setIncomeKind}
              />
            }
          >
            <div className="px-1 pb-2 pt-1">
              <TrendChart kind={incomeKind} dataKey="income" color="#4f81bd" height={210} yMax={2_000_000} />
            </div>
          </Portlet>
        </div>

        <div className="flex flex-col gap-2.5">
          <Portlet
            title="Revenue By Period Trend"
            toolbar={
              <ChartToolbar
                period={revenuePeriod}
                onPeriod={setRevenuePeriod}
                options={["By Period", "By Quarter", "By Year"]}
                kind={revenueKind}
                onKind={setRevenueKind}
              />
            }
          >
            <div className="px-1 pb-2 pt-1">
              <TrendChart
                kind={revenueKind}
                dataKey="revenue"
                color="#4f81bd"
                showAverage
                height={250}
                yMax={2_000_000}
              />
            </div>
          </Portlet>

          <Portlet
            title="Monthly New Business Trend"
            toolbar={
              <ChartToolbar
                period={newBizPeriod}
                onPeriod={setNewBizPeriod}
                options={["Monthly", "Quarterly"]}
                kind={newBizKind}
                onKind={setNewBizKind}
              />
            }
            className="flex-1"
          >
            <div className="px-1 pb-2 pt-1">
              <TrendChart
                kind={newBizKind}
                dataKey="newBusiness"
                color="#5b9bd5"
                stackedKey="newBusinessRepeat"
                stackedColor="#a9cce3"
                height={230}
                yMax={500_000}
                asCount
              />
            </div>
          </Portlet>
        </div>
      </div>
    </div>
  );
}
