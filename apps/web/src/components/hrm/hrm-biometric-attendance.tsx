"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  RefreshCw,
  Search,
} from "lucide-react";
import { employeeAvatarUrl } from "@/lib/mock-data/employees";
import {
  addDays,
  monthLabel,
  parseYmd,
  startOfWeekMonday,
  toYmd,
  weekDays,
  weekdayShortUpper,
  type BiometricDayRecord,
  type BiometricPunch,
  type BiometricSyncStatus,
} from "@/lib/mock-data/hrm-biometric";
import {
  listHrmBiometricDayRecords,
  syncHrmBiometric,
} from "@/lib/api/hrm-biometric";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

function syncBadgeClass(status: BiometricSyncStatus) {
  switch (status) {
    case "synced":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "failed":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

function PunchTimeline({
  punches,
  clockIn,
  clockOut,
  totalEntries,
}: BiometricDayRecord) {
  const mid = punches.slice(1, -1);

  return (
    <div className="flex min-w-[280px] max-w-[420px] items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs tabular-nums text-foreground">
        <span className="size-2 shrink-0 rounded-none bg-emerald-500" />
        <span>{clockIn || "—"}</span>
      </div>

      <div className="relative mx-1 flex h-3 min-w-[72px] flex-1 items-center">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        {mid.map((p) => (
          <span
            key={p.id}
            className={cn(
              "absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-none",
              p.status === "Clock In" ? "bg-emerald-500" : "bg-red-500",
            )}
            style={{
              left: `${20 + (hashOffset(p.id) % 60)}%`,
            }}
            title={`${p.status} ${p.time}`}
          />
        ))}
      </div>

      <div className="flex items-center gap-1.5 text-xs tabular-nums text-foreground">
        <span className="size-2 shrink-0 rounded-none bg-red-500" />
        <span>{clockOut || "—"}</span>
      </div>

      <span className="shrink-0 rounded-none border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        {totalEntries}x
      </span>
    </div>
  );
}

function hashOffset(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function PunchList({ punches }: { punches: BiometricPunch[] }) {
  return (
    <ol className="space-y-2">
      {punches.map((p) => (
        <li
          key={p.id}
          className="flex items-start justify-between gap-3 rounded-none border border-border px-3 py-2 text-sm"
        >
          <div className="flex items-start gap-2">
            <span
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-none",
                p.status === "Clock In" ? "bg-emerald-500" : "bg-red-500",
              )}
            />
            <div>
              <p className="font-medium text-foreground">{p.status}</p>
              <p className="text-xs text-muted-foreground">
                {p.verifyType} · {p.terminal}
              </p>
            </div>
          </div>
          <span className="shrink-0 font-mono text-sm tabular-nums">{p.time}</span>
        </li>
      ))}
    </ol>
  );
}

export function HrmBiometricAttendance() {
  const canWrite = useAdminCanWrite();
  const initial = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(() => toYmd(initial));
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(initial));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dayRows, setDayRows] = useState<BiometricDayRecord[]>([]);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftDesignation, setDraftDesignation] = useState("all");
  const [draftStatus, setDraftStatus] = useState<"all" | BiometricSyncStatus>("all");
  const [designation, setDesignation] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | BiometricSyncStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);

  const [viewRow, setViewRow] = useState<BiometricDayRecord | null>(null);

  const loadDay = useCallback(async (ymd: string) => {
    setLoading(true);
    try {
      const { rows } = await listHrmBiometricDayRecords({ date: ymd });
      setDayRows(rows);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load biometric punches",
      );
      setDayRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDay(selectedDate);
  }, [selectedDate, loadDay]);

  const designations = useMemo(() => {
    const set = new Set(
      dayRows.map((r) => r.designation).filter((d) => d && d !== "—"),
    );
    return [...set].sort();
  }, [dayRows]);

  const filtered = useMemo(() => {
    let list = dayRows;
    if (designation !== "all") list = list.filter((r) => r.designation === designation);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.employeeCode.toLowerCase().includes(q) ||
          r.designation.toLowerCase().includes(q) ||
          r.terminal.toLowerCase().includes(q),
      );
    }
    return list;
  }, [dayRows, designation, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const days = weekDays(weekStart);
  const selected = parseYmd(selectedDate);

  function selectDay(d: Date) {
    setSelectedDate(toYmd(d));
    setPage(1);
  }

  function shiftWeek(delta: number) {
    const next = addDays(weekStart, delta * 7);
    setWeekStart(next);
    const idx = days.findIndex((d) => toYmd(d) === selectedDate);
    const target = addDays(next, idx >= 0 ? idx : 0);
    setSelectedDate(toYmd(target));
    setPage(1);
  }

  async function syncOne(row: BiometricDayRecord) {
    if (!row.employeeId) {
      toast.error("Unmatched device code — set Employee biometric code first");
      return;
    }
    setSaving(true);
    try {
      const result = await syncHrmBiometric({
        date: selectedDate,
        employeeId: row.employeeId,
      });
      toast.success(
        `Synced ${row.employeeName} (${result.synced} record${result.synced === 1 ? "" : "s"})`,
      );
      await loadDay(selectedDate);
      setViewRow(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSaving(false);
    }
  }

  async function syncAllVisible() {
    setSaving(true);
    try {
      const result = await syncHrmBiometric({ date: selectedDate });
      toast.success(
        `Synced ${result.synced} · unmatched ${result.unmatched} · skipped ${result.skipped}`,
      );
      await loadDay(selectedDate);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Biometric Attendance
          </h1>
          <p className="text-xs text-muted-foreground">
            Live punches from ZKTeco plugin — match via employee biometric code
          </p>
        </div>
        {canWrite ? (
          <Button
            type="button"
            size="sm"
            className={GREEN_BTN}
            disabled={saving || loading}
            onClick={() => void syncAllVisible()}
          >
            <RefreshCw className={cn("size-3.5", saving && "animate-spin")} />
            Sync Attendance
          </Button>
        ) : null}
      </div>

      <div className="rounded-none border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-none"
            onClick={() => shiftWeek(-1)}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="font-semibold text-foreground">{monthLabel(selected)}</span>
            <span className="text-muted-foreground">Showing: {selectedDate}</span>
            <Badge
              variant="outline"
              className="rounded-none border-emerald-500/40 bg-emerald-500/15 text-[10px] font-normal text-emerald-700 dark:text-emerald-300"
            >
              {filtered.length} records
            </Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-none"
            onClick={() => shiftWeek(1)}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 p-2">
          {days.map((d) => {
            const ymd = toYmd(d);
            const active = ymd === selectedDate;
            return (
              <button
                key={ymd}
                type="button"
                onClick={() => selectDay(d)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-none border px-1 py-2 text-center transition-colors",
                  active
                    ? "border-[#4caf50] bg-[#4caf50] text-white"
                    : "border-transparent text-foreground hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    active ? "text-white/90" : "text-muted-foreground",
                  )}
                >
                  {weekdayShortUpper(d)}
                </span>
                <span className="text-sm font-semibold tabular-nums">{d.getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        <Button
          type="button"
          size="sm"
          className={cn("h-9", GREEN_BTN)}
          onClick={() => setFiltersOpen(true)}
        >
          <Filter className="size-3.5" />
          Filters
        </Button>
      </div>

      {loading ? (
        <ContentDataSkeleton label="Loading biometric punches…" />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 z-[1] bg-muted/80 backdrop-blur">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Timeline</th>
                <th className="px-3 py-2 font-medium">Terminal</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                    No ZKTeco punches for this day. Point the device ADMS to the API{" "}
                    <code className="text-xs">/iclock</code> and set employee biometric
                    codes.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id} className="border-b border-border/70 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 items-center justify-center overflow-hidden rounded-none border border-border bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={employeeAvatarUrl(row.employeeId || row.employeeCode)}
                            alt=""
                            className="size-8 object-cover"
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.employeeName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.employeeCode} · {row.designation}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <PunchTimeline {...row} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{row.terminal}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={cn("rounded-none capitalize", syncBadgeClass(row.status))}
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-none"
                          onClick={() => setViewRow(row)}
                          aria-label="View"
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        {canWrite && row.employeeId ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none"
                            disabled={saving || row.status === "synced"}
                            onClick={() => void syncOne(row)}
                            aria-label="Sync"
                            title="Sync to Attendance Records"
                          >
                            <RefreshCw className="size-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Page {pageSafe} / {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <select
            className="h-8 rounded-none border border-border bg-background px-2"
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
          >
            {[50, 100, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
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

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[320px] min-w-[160px] max-w-[720px] flex-col gap-4 p-4"
        >
          <h2 className="text-base font-semibold">Filters</h2>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Designation</span>
            <select
              className="h-9 w-full rounded-none border border-border bg-background px-2"
              value={draftDesignation}
              onChange={(e) => setDraftDesignation(e.target.value)}
            >
              <option value="all">All</option>
              {designations.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Sync status</span>
            <select
              className="h-9 w-full rounded-none border border-border bg-background px-2"
              value={draftStatus}
              onChange={(e) =>
                setDraftStatus(e.target.value as "all" | BiometricSyncStatus)
              }
            >
              <option value="all">All</option>
              <option value="synced">Synced</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <Button
            type="button"
            className={cn("mt-auto", GREEN_BTN)}
            onClick={() => {
              setDesignation(draftDesignation);
              setStatusFilter(draftStatus);
              setPage(1);
              setFiltersOpen(false);
            }}
          >
            Apply
          </Button>
        </SheetContent>
      </Sheet>

      <Sheet open={!!viewRow} onOpenChange={(open) => !open && setViewRow(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[400px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
        >
          {viewRow ? (
            <>
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-base font-semibold">{viewRow.employeeName}</h2>
                <p className="text-xs text-muted-foreground">
                  {viewRow.employeeCode} · {viewRow.date}
                </p>
              </div>
              <div className="space-y-4 overflow-y-auto px-4 py-4">
                <PunchList punches={viewRow.punches} />
                <dl className="grid grid-cols-[120px_1fr] gap-x-2 gap-y-2 text-sm">
                  {(
                    [
                      ["Designation", viewRow.designation],
                      ["Clock in", viewRow.clockIn || "—"],
                      ["Clock out", viewRow.clockOut || "—"],
                      ["Entries", String(viewRow.totalEntries)],
                      ["Terminal", viewRow.terminal],
                      ["Sync Status", viewRow.status],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-medium capitalize">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {canWrite && viewRow.employeeId ? (
                <div className="mt-auto border-t border-border p-3">
                  <Button
                    type="button"
                    className={cn("w-full", GREEN_BTN)}
                    disabled={saving}
                    onClick={() => void syncOne(viewRow)}
                  >
                    Sync to Attendance Records
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
