"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/native-select";
import { cn, formatDate } from "@/lib/utils";
import { getCompanyFormat } from "@/lib/store/company-format-store";
import { fiscalYearStartIso, zonedTodayIso } from "@/lib/localisation/company-format";

export type DateRangeValue = { dateFrom: string; dateTo: string };

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}
/** Last day of month `m` (1-based) in year `y` — `new Date(y, m, 0)` rolls back one day
 * from the 1st of the next month, which lands on the last day of month `m`. */
function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}
function addMonths(y: number, m: number, delta: number) {
  const total = (y * 12 + (m - 1)) + delta;
  return { y: Math.floor(total / 12), m: (((total % 12) + 12) % 12) + 1 };
}
function addYears(iso: string, years: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const y = p.y + years;
  const lastDay = Math.min(p.d, daysInMonth(y, p.m));
  return ymd(y, p.m, lastDay);
}
function addDays(iso: string, delta: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d));
  d.setUTCDate(d.getUTCDate() + delta);
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

type Preset = {
  label: string;
  range: () => DateRangeValue;
};

function buildPresets(): Preset[] {
  const today = zonedTodayIso(getCompanyFormat());
  const t = parseIso(today)!;
  const monthRange = (y: number, m: number): DateRangeValue => ({
    dateFrom: ymd(y, m, 1),
    dateTo: ymd(y, m, daysInMonth(y, m)),
  });
  const fiscalYearRange = (offsetYears: number): DateRangeValue => {
    const start = addYears(fiscalYearStartIso(getCompanyFormat(), today), offsetYears);
    const end = addDays(addYears(start, 1), -1);
    return { dateFrom: start, dateTo: end };
  };
  const lastMonth = addMonths(t.y, t.m, -1);
  return [
    { label: "Today", range: () => ({ dateFrom: today, dateTo: today }) },
    { label: "Yesterday", range: () => { const y = addDays(today, -1); return { dateFrom: y, dateTo: y }; } },
    { label: "Last 7 Days", range: () => ({ dateFrom: addDays(today, -6), dateTo: today }) },
    { label: "Last 30 Days", range: () => ({ dateFrom: addDays(today, -29), dateTo: today }) },
    { label: "This Month", range: () => monthRange(t.y, t.m) },
    { label: "Last Month", range: () => monthRange(lastMonth.y, lastMonth.m) },
    { label: "This month last year", range: () => monthRange(t.y - 1, t.m) },
    { label: "This Year", range: () => ({ dateFrom: ymd(t.y, 1, 1), dateTo: ymd(t.y, 12, 31) }) },
    { label: "Last Year", range: () => ({ dateFrom: ymd(t.y - 1, 1, 1), dateTo: ymd(t.y - 1, 12, 31) }) },
    { label: "Current financial year", range: () => fiscalYearRange(0) },
    { label: "Last financial year", range: () => fiscalYearRange(-1) },
  ];
}

/** Which preset (if any) exactly matches the current value — so re-opening the
 * picker highlights the right row instead of always falling back to Custom Range. */
function matchingPresetLabel(value: DateRangeValue, presets: Preset[]): string | null {
  if (!value.dateFrom || !value.dateTo) return null;
  for (const p of presets) {
    const r = p.range();
    if (r.dateFrom === value.dateFrom && r.dateTo === value.dateTo) return p.label;
  }
  return null;
}

function MiniCalendar({
  year,
  month,
  onYear,
  onMonth,
  onPrev,
  onNext,
  from,
  to,
  hoverEnd,
  onPick,
}: {
  year: number;
  month: number;
  onYear: (y: number) => void;
  onMonth: (m: number) => void;
  onPrev: () => void;
  onNext: () => void;
  from: string;
  to: string;
  hoverEnd: string | null;
  onPick: (iso: string) => void;
}) {
  const years = useMemo(() => {
    const nowY = new Date().getFullYear();
    const out: number[] = [];
    for (let y = nowY - 6; y <= nowY + 1; y++) out.push(y);
    return out;
  }, []);
  const first = new Date(year, month - 1, 1);
  const startWeekday = first.getDay();
  const total = daysInMonth(year, month);
  const prevMonth = addMonths(year, month, -1);
  const prevTotal = daysInMonth(prevMonth.y, prevMonth.m);
  const cells: { iso: string; day: number; muted: boolean }[] = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    const { y, m } = addMonths(year, month, -1);
    cells.push({ iso: ymd(y, m, prevTotal - i), day: prevTotal - i, muted: true });
  }
  for (let d = 1; d <= total; d++) cells.push({ iso: ymd(year, month, d), day: d, muted: false });
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const { y, m } = addMonths(year, month, 1);
    const day = cells.length - (startWeekday + total) + 1;
    cells.push({ iso: ymd(y, m, day), day, muted: true });
    if (cells.length >= 42) break;
  }
  const rangeEnd = hoverEnd ?? to;
  const lo = from && rangeEnd && from <= rangeEnd ? from : rangeEnd;
  const hi = from && rangeEnd && from <= rangeEnd ? rangeEnd : from;

  return (
    <div className="w-[248px] shrink-0">
      <div className="mb-2 flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label="Previous month"
          className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={onPrev}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Select
            aria-label="Month"
            className="h-7 flex-1 rounded-none px-1.5 py-0 text-[11px] leading-7"
            value={month}
            onChange={(e) => onMonth(Number(e.target.value))}
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx + 1}>
                {name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Year"
            className="h-7 w-[72px] shrink-0 rounded-none px-1.5 py-0 text-[11px] leading-7"
            value={year}
            onChange={(e) => onYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          aria-label="Next month"
          className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={onNext}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center text-[11px]">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 font-medium text-muted-foreground">
            {w}
          </span>
        ))}
        {cells.map((c, idx) => {
          const inRange = !c.muted && lo && hi && c.iso >= lo && c.iso <= hi;
          const isEdge = !c.muted && (c.iso === from || c.iso === to);
          return (
            <button
              key={`${c.iso}-${idx}`}
              type="button"
              disabled={c.muted}
              onClick={() => onPick(c.iso)}
              className={cn(
                "flex h-7 w-7 items-center justify-center text-[11px] tabular-nums",
                c.muted && "text-muted-foreground/30",
                !c.muted && !inRange && "hover:bg-muted",
                inRange && !isEdge && "bg-primary/15",
                isEdge && "bg-primary font-semibold text-primary-foreground",
              )}
            >
              {c.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * "Filter by date" — a preset list (Today / Yesterday / Last 7 Days / … /
 * Current & Last financial year) plus a Custom Range dual-month calendar.
 * Drop-in replacement for a plain From/To date-input pair: same
 * `{dateFrom, dateTo}` value and `onChange`, so every report keeps working —
 * only the picker UI changes, once, here.
 */
export function DateRangePresetPicker({
  value,
  onChange,
  className,
  buttonClassName,
  placeholder = "Filter by date",
  clearable = true,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  className?: string;
  buttonClassName?: string;
  placeholder?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.dateFrom);
  const [draftTo, setDraftTo] = useState(value.dateTo);
  const [pickingSecond, setPickingSecond] = useState(false);
  const [leftMonth, setLeftMonth] = useState(() => {
    const p = parseIso(value.dateFrom) ?? parseIso(zonedTodayIso(getCompanyFormat()))!;
    return { y: p.y, m: p.m };
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Portal target + fixed-position coordinates, recomputed whenever the panel
  // opens (and on scroll/resize) — the same fix `again-search-dropdown.tsx`
  // uses, because this button lives inside toolbars with `overflow-x-auto`
  // (a plain `position: absolute` child gets clipped and looks like the click
  // "did nothing"). Portaling into the nearest dialog (when inside a Sheet)
  // rather than always `document.body` keeps it clickable under Radix's modal
  // pointer-events guard.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const presets = useMemo(() => buildPresets(), []);
  const activePreset = useMemo(() => matchingPresetLabel(value, presets), [value, presets]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setCustomOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dialog = containerRef.current?.closest('[role="dialog"]') as HTMLElement | null;
    setPortalTarget(dialog ?? document.body);
    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
    };
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, customOpen]);

  const openPicker = () => {
    setDraftFrom(value.dateFrom);
    setDraftTo(value.dateTo);
    setPickingSecond(false);
    // Always start on the plain preset list — Custom Range is one click away,
    // and this keeps a fresh open predictable instead of guessing intent.
    setCustomOpen(false);
    const p = parseIso(value.dateFrom) ?? parseIso(zonedTodayIso(getCompanyFormat()))!;
    setLeftMonth({ y: p.y, m: p.m });
    setOpen((v) => !v);
  };

  const rightMonth = addMonths(leftMonth.y, leftMonth.m, 1);

  const pick = (iso: string) => {
    if (!pickingSecond) {
      setDraftFrom(iso);
      setDraftTo(iso);
      setPickingSecond(true);
    } else {
      if (iso < draftFrom) {
        setDraftTo(draftFrom);
        setDraftFrom(iso);
      } else {
        setDraftTo(iso);
      }
      setPickingSecond(false);
    }
  };

  const applyPreset = (preset: Preset) => {
    onChange(preset.range());
    setOpen(false);
    setCustomOpen(false);
  };

  const applyCustom = () => {
    onChange({ dateFrom: draftFrom, dateTo: draftTo });
    setOpen(false);
    setCustomOpen(false);
  };

  const clear = () => {
    onChange({ dateFrom: "", dateTo: "" });
    setDraftFrom("");
    setDraftTo("");
    setOpen(false);
    setCustomOpen(false);
  };

  // Always show the resolved date range on the button (never the preset's
  // name) — the preset list only highlights which one produced it.
  const label =
    value.dateFrom && value.dateTo
      ? value.dateFrom === value.dateTo
        ? formatDate(value.dateFrom)
        : `${formatDate(value.dateFrom)} – ${formatDate(value.dateTo)}`
      : placeholder;

  return (
    <div className={cn("relative shrink-0", className)} ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-[26px] gap-1 rounded-none px-2 text-xs", buttonClassName)}
        onClick={openPicker}
        data-testid="date-range-trigger"
      >
        {label}
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </Button>
      {open && portalTarget
        ? createPortal(
            <div
              ref={panelRef}
              className="flex border border-border bg-popover shadow-md"
              style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 300 }}
              data-testid="date-range-panel"
              onMouseDown={(e) => e.stopPropagation()}
            >
          <div className="w-[168px] shrink-0 border-r border-border py-1">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-xs hover:bg-muted",
                  activePreset === p.label && !customOpen && "bg-primary text-primary-foreground hover:bg-primary",
                )}
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={cn(
                "block w-full px-3 py-1.5 text-left text-xs hover:bg-muted",
                customOpen && "bg-muted font-medium",
              )}
              onClick={() => setCustomOpen(true)}
              data-testid="date-range-custom"
            >
              Custom Range
            </button>
          </div>
          {customOpen ? (
            <div className="flex flex-col">
              <div className="flex gap-4 p-3">
                <MiniCalendar
                  year={leftMonth.y}
                  month={leftMonth.m}
                  onYear={(y) => setLeftMonth((cur) => ({ ...cur, y }))}
                  onMonth={(m) => setLeftMonth((cur) => ({ ...cur, m }))}
                  onPrev={() => setLeftMonth((cur) => addMonths(cur.y, cur.m, -1))}
                  onNext={() => setLeftMonth((cur) => addMonths(cur.y, cur.m, 1))}
                  from={draftFrom}
                  to={draftTo}
                  hoverEnd={null}
                  onPick={pick}
                />
                <MiniCalendar
                  year={rightMonth.y}
                  month={rightMonth.m}
                  onYear={(y) => setLeftMonth((cur) => addMonths(y, rightMonth.m, -1))}
                  onMonth={(m) => setLeftMonth((cur) => addMonths(rightMonth.y, m, -1))}
                  onPrev={() => setLeftMonth((cur) => addMonths(cur.y, cur.m, -1))}
                  onNext={() => setLeftMonth((cur) => addMonths(cur.y, cur.m, 1))}
                  from={draftFrom}
                  to={draftTo}
                  hoverEnd={null}
                  onPick={pick}
                />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {draftFrom ? formatDate(draftFrom) : "—"} - {draftTo ? formatDate(draftTo) : "—"}
                </span>
                <div className="flex shrink-0 gap-2">
                  {clearable ? (
                    <Button variant="outline" size="sm" className="h-7 rounded-none text-xs" onClick={clear}>
                      Clear
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    className="h-7 rounded-none text-xs"
                    disabled={!draftFrom || !draftTo}
                    onClick={applyCustom}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
