"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { listHrmCalendarEvents } from "@/lib/api/hrm-calendar";
import {
  HRM_CALENDAR_COLORS,
  type HrmCalendarEvent,
  type HrmCalendarEventKind,
} from "@/lib/mock-data/hrm-org";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type CalView = "month" | "week" | "day" | "list";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const KIND_LABEL: Record<HrmCalendarEventKind, string> = {
  meeting: "Meetings",
  holiday: "Holidays",
  leave: "Leaves",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function eventOnDate(ev: HrmCalendarEvent, day: Date) {
  const t = toYmd(day);
  return t >= ev.startDate && t <= ev.endDate;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function dayLabel(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function weekRangeLabel(start: Date) {
  const end = addDays(start, 6);
  const a = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const b = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${a} – ${b}`;
}

function EventChip({
  ev,
  compact,
  onClick,
}: {
  ev: HrmCalendarEvent;
  compact?: boolean;
  onClick: () => void;
}) {
  const color = HRM_CALENDAR_COLORS[ev.kind];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "w-full truncate rounded-none border-l-2 px-1 text-left text-[10px] leading-tight hover:opacity-90",
        compact ? "py-0.5" : "py-1",
      )}
      style={{
        borderLeftColor: color,
        backgroundColor: `${color}22`,
        color: "var(--foreground)",
      }}
      title={ev.title}
    >
      {!ev.allDay && ev.startTime ? (
        <span className="mr-1 tabular-nums opacity-70">{ev.startTime}</span>
      ) : null}
      {ev.title}
    </button>
  );
}

export function HrmCalendar() {
  const [loading, setLoading] = useState(true);
  const [allEvents, setAllEvents] = useState<HrmCalendarEvent[]>([]);
  const today = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const events = await listHrmCalendarEvents();
      setAllEvents(events);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load calendar events");
      setAllEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const [cursor, setCursor] = useState(() => new Date(today));
  const [view, setView] = useState<CalView>("month");
  const [search, setSearch] = useState("");
  const [kinds, setKinds] = useState<Record<HrmCalendarEventKind, boolean>>({
    meeting: true,
    holiday: true,
    leave: true,
  });
  const [selected, setSelected] = useState<HrmCalendarEvent | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEvents.filter((ev) => {
      if (!kinds[ev.kind]) return false;
      if (!q) return true;
      return (
        ev.title.toLowerCase().includes(q) ||
        (ev.subtitle ?? "").toLowerCase().includes(q) ||
        Object.values(ev.meta ?? {}).some((v) => v.toLowerCase().includes(q))
      );
    });
  }, [allEvents, kinds, search]);

  const monthCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const weekStart = useMemo(() => startOfWeek(cursor), [cursor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 8), []); // 08–19

  function eventsFor(day: Date) {
    return filtered
      .filter((ev) => eventOnDate(ev, day))
      .sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return (a.startTime ?? "").localeCompare(b.startTime ?? "");
      });
  }

  function goPrev() {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
    else if (view === "week") setCursor(addDays(cursor, -7));
    else setCursor(addDays(cursor, -1));
  }

  function goNext() {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    else if (view === "week") setCursor(addDays(cursor, 7));
    else setCursor(addDays(cursor, 1));
  }

  function goToday() {
    setCursor(new Date(today));
  }

  const headerTitle =
    view === "month"
      ? monthLabel(cursor)
      : view === "week"
        ? weekRangeLabel(weekStart)
        : dayLabel(cursor);

  const listEvents = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
      return (a.startTime ?? "").localeCompare(b.startTime ?? "");
    });
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4" data-page="hrm-calendar">
        <ContentDataSkeleton rows={10} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4" data-page="hrm-calendar">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="page-subtitle">AgainERP › HRM</p>
          <h1 className="page-title">Calendar</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Meetings, holidays & approved leaves — Workdo-style integrated calendar
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(KIND_LABEL) as HrmCalendarEventKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKinds((prev) => ({ ...prev, [k]: !prev[k] }))}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-none border px-2 py-1 text-[11px]",
                kinds[k] ? "border-border bg-card" : "border-border/50 text-muted-foreground opacity-60",
              )}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-none"
                style={{ backgroundColor: HRM_CALENDAR_COLORS[k] }}
              />
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-none px-2" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-none" onClick={goToday}>
            Today
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-none px-2" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="min-w-[160px] text-sm font-semibold">{headerTitle}</p>
        <div className="flex rounded-none border border-border">
          {(["month", "week", "day", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "px-2.5 py-1.5 text-xs capitalize",
                view === v ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events…"
            className="h-8 rounded-none pl-7 text-xs"
          />
        </div>
      </div>

      {view === "month" ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthCells.map((day) => {
              const inMonth = day.getMonth() === cursor.getMonth();
              const isToday = sameDay(day, today);
              const dayEvents = eventsFor(day);
              const shown = dayEvents.slice(0, 3);
              const more = dayEvents.length - shown.length;
              return (
                <button
                  key={toYmd(day)}
                  type="button"
                  onClick={() => {
                    setCursor(day);
                    setView("day");
                  }}
                  className={cn(
                    "min-h-[96px] border-b border-r border-border p-1 text-left align-top hover:bg-muted/30",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "mb-1 inline-flex h-6 w-6 items-center justify-center text-xs tabular-nums",
                      isToday && "bg-foreground font-semibold text-background",
                    )}
                  >
                    {day.getDate()}
                  </span>
                  <div className="space-y-0.5">
                    {shown.map((ev) => (
                      <EventChip key={ev.id} ev={ev} compact onClick={() => setSelected(ev)} />
                    ))}
                    {more > 0 ? (
                      <p className="px-1 text-[10px] text-muted-foreground">+{more} more</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "week" || view === "day" ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
          <div
            className="grid border-b border-border bg-muted/40"
            style={{ gridTemplateColumns: view === "day" ? "64px 1fr" : "64px repeat(7, 1fr)" }}
          >
            <div />
            {(view === "day" ? [cursor] : weekDays).map((day) => {
              const isToday = sameDay(day, today);
              return (
                <div key={toYmd(day)} className="px-2 py-1.5 text-center">
                  <p className="text-[10px] uppercase text-muted-foreground">
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </p>
                  <p
                    className={cn(
                      "mx-auto mt-0.5 inline-flex h-7 w-7 items-center justify-center text-sm tabular-nums",
                      isToday && "bg-foreground font-semibold text-background",
                    )}
                  >
                    {day.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* All-day row */}
          <div
            className="grid border-b border-border"
            style={{ gridTemplateColumns: view === "day" ? "64px 1fr" : "64px repeat(7, 1fr)" }}
          >
            <div className="px-1 py-2 text-[10px] text-muted-foreground">All day</div>
            {(view === "day" ? [cursor] : weekDays).map((day) => (
              <div key={`all-${toYmd(day)}`} className="space-y-0.5 border-l border-border p-1">
                {eventsFor(day)
                  .filter((e) => e.allDay)
                  .map((ev) => (
                    <EventChip key={ev.id} ev={ev} compact onClick={() => setSelected(ev)} />
                  ))}
              </div>
            ))}
          </div>

          {/* Timed slots */}
          <div
            className="grid"
            style={{ gridTemplateColumns: view === "day" ? "64px 1fr" : "64px repeat(7, 1fr)" }}
          >
            {hours.map((h) => (
              <div key={`row-${h}`} className="contents">
                <div className="border-b border-border px-1 py-3 text-[10px] tabular-nums text-muted-foreground">
                  {pad(h)}:00
                </div>
                {(view === "day" ? [cursor] : weekDays).map((day) => {
                  const slotEvents = eventsFor(day).filter((e) => {
                    if (e.allDay || !e.startTime) return false;
                    const hour = Number(e.startTime.split(":")[0]);
                    return hour === h;
                  });
                  return (
                    <div
                      key={`${toYmd(day)}-${h}`}
                      className="min-h-[48px] space-y-0.5 border-b border-l border-border p-0.5"
                    >
                      {slotEvents.map((ev) => (
                        <EventChip key={ev.id} ev={ev} onClick={() => setSelected(ev)} />
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {view === "list" ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
          {listEvents.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No events match your filters.</p>
          ) : (
            <div className="divide-y divide-border">
              {listEvents.map((ev) => (
                <button
                  key={`${ev.kind}-${ev.id}`}
                  type="button"
                  onClick={() => setSelected(ev)}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
                >
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-none"
                    style={{ backgroundColor: HRM_CALENDAR_COLORS[ev.kind] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{ev.title}</p>
                      <Badge variant="outline" className="rounded-none text-[10px] font-normal capitalize">
                        {ev.kind}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ev.startDate === ev.endDate ? ev.startDate : `${ev.startDate} → ${ev.endDate}`}
                      {!ev.allDay && ev.startTime ? ` · ${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ""}` : " · All day"}
                      {ev.subtitle ? ` · ${ev.subtitle}` : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          title="Event details"
          className="w-[420px] min-w-[160px] max-w-[720px] rounded-none p-0"
        >
          {selected ? (
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-border px-4 py-3 text-left">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-none"
                    style={{ backgroundColor: HRM_CALENDAR_COLORS[selected.kind] }}
                  />
                  <Badge variant="outline" className="rounded-none text-[10px] font-normal capitalize">
                    {selected.kind}
                  </Badge>
                </div>
                <SheetTitle className="text-base">{selected.title}</SheetTitle>
                {selected.subtitle ? (
                  <SheetDescription>{selected.subtitle}</SheetDescription>
                ) : (
                  <SheetDescription className="sr-only">Calendar event details</SheetDescription>
                )}
              </SheetHeader>
              <div className="flex-1 space-y-2 overflow-auto p-4">
                {Object.entries(selected.meta ?? {}).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[110px_1fr] gap-2 border-b border-border py-2 text-sm">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
