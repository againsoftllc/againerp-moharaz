"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock3,
  Filter,
  Info,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { employeeAvatarUrl } from "@/lib/mock-data/employees";
import type {
  EmployeeLeaveBalanceCard,
  LeaveBalanceLine,
  SyncHistoryEntry,
} from "@/lib/mock-data/hrm-leave-balances";
import { leaveTypeVisual } from "@/lib/mock-data/hrm-leave-applications";
import {
  apiBalanceToLine,
  groupBalancesIntoCards,
  listHrmLeaveBalances,
  updateHrmLeaveBalance,
  type LeaveBalanceLookups,
} from "@/lib/api/hrm-leave-balances";
import { listHrmEmployees } from "@/lib/api/hrm-employees";
import { listHrmLeaveTypes } from "@/lib/api/hrm-leave-types";
import { listHrmLeavePolicies } from "@/lib/api/hrm-leave-policies";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

const YEAR = String(new Date().getFullYear());

function formatNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type EditForm = {
  allocatedDays: string;
  usedDays: string;
  manualAdjustment: string;
  adjustmentReason: string;
};

function editFormFromLine(line: LeaveBalanceLine): EditForm {
  return {
    allocatedDays: String(line.allocatedDays),
    usedDays: String(line.usedDays),
    manualAdjustment: String(line.manualAdjustment),
    adjustmentReason: line.adjustmentReason,
  };
}

function LeaveTypeChip({ name }: { name: string }) {
  const visual = leaveTypeVisual(name);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-none border px-1.5 py-0.5 text-[11px] font-medium",
        visual.bg,
        visual.color,
        visual.border,
      )}
    >
      {name}
    </span>
  );
}

export function HrmLeaveBalances() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [resyncing, setResyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [cards, setCards] = useState<EmployeeLeaveBalanceCard[]>([]);
  const [lookups, setLookups] = useState<LeaveBalanceLookups | null>(null);

  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>([]);
  const [lastSynced, setLastSynced] = useState("—");
  const [noteOpen, setNoteOpen] = useState(true);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftEmployeeId, setDraftEmployeeId] = useState("all");
  const [employeeId, setEmployeeId] = useState("all");
  const [perPage, setPerPage] = useState(9);
  const [page, setPage] = useState(1);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [detail, setDetail] = useState<{
    card: EmployeeLeaveBalanceCard;
    line: LeaveBalanceLine;
  } | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);

  const fetchData = useCallback(async () => {
    const [empRes, leaveTypes, leavePolicies] = await Promise.all([
      listHrmEmployees({ page: 1, per_page: 200 }),
      listHrmLeaveTypes(),
      listHrmLeavePolicies(),
    ]);
    const empMap = new Map(empRes.rows.map((e) => [e.id, e]));
    const typeMap = new Map(leaveTypes.map((t) => [t.id, t.name]));
    const policyMap = new Map(leavePolicies.map((p) => [p.id, p.name]));
    const nextLookups: LeaveBalanceLookups = {
      employeeName: (id) => (id ? (empMap.get(id)?.name ?? "—") : "—"),
      employeeCode: (id) => (id ? (empMap.get(id)?.employee_code ?? "—") : "—"),
      leaveTypeName: (id) => (id ? (typeMap.get(id) ?? "—") : "—"),
      leavePolicyName: (id) => (id ? (policyMap.get(id) ?? "—") : "—"),
    };
    const balanceRows = await listHrmLeaveBalances({ year: YEAR });
    const nextCards = groupBalancesIntoCards(balanceRows, nextLookups, Number(YEAR));

    setLookups(nextLookups);
    setCards(nextCards);
    setLastSynced(formatNow());
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await fetchData();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load leave balances");
        setCards([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchData]);

  async function resync() {
    setResyncing(true);
    try {
      await fetchData();
      const at = formatNow();
      setSyncHistory((prev) => [
        {
          id: `sync_${Date.now()}`,
          at,
          action: "Re-sync",
          detail: `Re-synced balances for year ${YEAR}.`,
        },
        ...prev,
      ]);
      toast.success(`Re-synced ${YEAR} leave balances`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-sync failed");
    } finally {
      setResyncing(false);
    }
  }

  function openDetail(card: EmployeeLeaveBalanceCard, line: LeaveBalanceLine) {
    setDetail({ card, line });
    setEditForm(editFormFromLine(line));
  }

  function closeDetail(open: boolean) {
    if (!open) {
      setDetail(null);
      setEditForm(null);
    }
  }

  async function saveDetail() {
    if (!detail || !editForm || !lookups) return;
    setSaving(true);
    try {
      const row = await updateHrmLeaveBalance(detail.line.id, {
        allocatedDays: Math.max(0, Number(editForm.allocatedDays) || 0),
        usedDays: Math.max(0, Number(editForm.usedDays) || 0),
        manualAdjustment: Number(editForm.manualAdjustment) || 0,
        adjustmentReason: editForm.adjustmentReason.trim(),
      });
      const nextLine = apiBalanceToLine(row, lookups);
      setCards((prev) =>
        prev.map((c) =>
          c.employeeId === detail.card.employeeId
            ? { ...c, lines: c.lines.map((l) => (l.id === nextLine.id ? nextLine : l)) }
            : c,
        ),
      );
      setDetail((d) =>
        d
          ? {
              card: {
                ...d.card,
                lines: d.card.lines.map((l) => (l.id === nextLine.id ? nextLine : l)),
              },
              line: nextLine,
            }
          : d,
      );
      setEditForm(editFormFromLine(nextLine));
      toast.success("Leave balance updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    let list = cards;
    if (employeeId !== "all") list = list.filter((c) => c.employeeId === employeeId);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.employeeName.toLowerCase().includes(q) ||
          c.employeeCode.toLowerCase().includes(q),
      );
    }
    return list;
  }, [cards, employeeId, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageCards = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  if (loading) {
    return <ContentDataSkeleton label="Loading leave balances…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Leave Balances</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-none border-sky-500/50 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300"
            onClick={() => setHistoryOpen(true)}
          >
            <Clock3 className="size-3.5" />
            Sync History
          </Button>
          {canWrite ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-none border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
              onClick={() => void resync()}
              disabled={resyncing}
            >
              <RefreshCw className={cn("size-3.5", resyncing && "animate-spin")} />
              {resyncing ? "Syncing…" : `Re-sync ${YEAR}`}
            </Button>
          ) : null}
        </div>
      </div>

      {noteOpen ? (
        <div className="flex items-start gap-2 rounded-none border border-amber-500/40 bg-amber-500/15 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
          <p className="min-w-0 flex-1 text-xs leading-relaxed sm:text-sm">
            <span className="font-semibold">Note:</span> If you add a new Employee, Leave Type, or
            Leave Policy, you must click the <span className="font-semibold">Sync Balances</span> or{" "}
            <span className="font-semibold">Re-sync</span> button to apply the changes for the
            current year.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 rounded-none"
            onClick={() => setNoteOpen(false)}
            aria-label="Dismiss note"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
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
            {[6, 9, 12, 18].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-xs text-muted-foreground">Last synced: {lastSynced}</p>

      {filtersOpen ? (
        <div className="rounded-none border border-border bg-card p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-muted-foreground">
              Employee
              <select
                value={draftEmployeeId}
                onChange={(e) => setDraftEmployeeId(e.target.value)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All Employees</option>
                {cards.map((c) => (
                  <option key={c.employeeId} value={c.employeeId}>
                    {c.employeeName}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              onClick={() => {
                setEmployeeId(draftEmployeeId);
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
                setDraftEmployeeId("all");
                setEmployeeId("all");
                setSearch("");
                setPage(1);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {pageCards.length === 0 ? (
          <div className="rounded-none border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
            No leave balances found.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pageCards.map((card) => (
              <article
                key={card.employeeId}
                className="flex flex-col rounded-none border border-border bg-card"
              >
                <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={employeeAvatarUrl(card.employeeId)}
                    alt=""
                    className="size-9 shrink-0 rounded-none border border-border object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {card.employeeName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{card.employeeCode}</p>
                  </div>
                </div>

                <div className="overflow-x-auto px-1 py-1">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-1.5 font-semibold">Leave Type</th>
                        <th className="px-2 py-1.5 font-semibold">Total</th>
                        <th className="px-2 py-1.5 font-semibold">Used</th>
                        <th className="px-2 py-1.5 font-semibold">Available</th>
                        <th className="w-8 px-1 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {card.lines.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">
                            No leave types allocated.
                          </td>
                        </tr>
                      ) : (
                        card.lines.map((line) => (
                          <tr key={line.id} className="border-b border-border/60 last:border-b-0">
                            <td className="px-2 py-1.5">
                              <LeaveTypeChip name={line.leaveTypeName} />
                            </td>
                            <td className="px-2 py-1.5 tabular-nums text-foreground">
                              {line.allocatedDays}
                            </td>
                            <td className="px-2 py-1.5 tabular-nums font-medium text-red-600 dark:text-red-400">
                              {line.usedDays}
                            </td>
                            <td className="px-2 py-1.5 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                              {line.remainingDays}
                            </td>
                            <td className="px-1 py-1.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-none text-amber-600"
                                onClick={() => openDetail(card, line)}
                                aria-label="Balance details"
                              >
                                <Info className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {(pageSafe - 1) * perPage + 1}–
            {Math.min(pageSafe * perPage, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
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
            <span>
              Page {pageSafe}/{totalPages}
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
      ) : null}

      {/* Line detail */}
      <Sheet open={!!detail} onOpenChange={closeDetail}>
        <SheetContent
          side="right"
          title={detail ? `Balance — ${detail.card.employeeName}` : "Balance"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {detail && editForm ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border px-4 py-3 pr-10">
                <p className="text-base font-semibold">{detail.card.employeeName}</p>
                <p className="text-xs text-muted-foreground">
                  {detail.card.employeeCode} · Year {detail.card.year}
                </p>
                <div className="mt-1.5">
                  <LeaveTypeChip name={detail.line.leaveTypeName} />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Leave Policy
                      <Input
                        value={detail.line.leavePolicy || "—"}
                        disabled
                        className="h-9 rounded-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Carried Forward
                      <Input
                        value={String(detail.line.carriedForward)}
                        disabled
                        className="h-9 rounded-none"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Allocated (Total)
                      <Input
                        type="number"
                        min={0}
                        value={editForm.allocatedDays}
                        disabled={!canWrite}
                        onChange={(e) =>
                          setEditForm((f) => (f ? { ...f, allocatedDays: e.target.value } : f))
                        }
                        className="h-9 rounded-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Used
                      <Input
                        type="number"
                        min={0}
                        value={editForm.usedDays}
                        disabled={!canWrite}
                        onChange={(e) =>
                          setEditForm((f) => (f ? { ...f, usedDays: e.target.value } : f))
                        }
                        className="h-9 rounded-none"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Available
                      <Input
                        value={String(detail.line.remainingDays)}
                        disabled
                        className="h-9 rounded-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Manual Adjustment
                      <Input
                        type="number"
                        value={editForm.manualAdjustment}
                        disabled={!canWrite}
                        onChange={(e) =>
                          setEditForm((f) => (f ? { ...f, manualAdjustment: e.target.value } : f))
                        }
                        className="h-9 rounded-none"
                      />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Adjustment Reason
                    <Input
                      value={editForm.adjustmentReason}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setEditForm((f) => (f ? { ...f, adjustmentReason: e.target.value } : f))
                      }
                      className="h-9 rounded-none"
                      placeholder="Reason for manual adjustment"
                    />
                  </label>
                </div>
              </div>
              {canWrite ? (
                <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
                  <Button
                    type="button"
                    size="sm"
                    className={cn("h-9", GREEN_BTN)}
                    onClick={() => void saveDetail()}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-none"
                    onClick={() => closeDetail(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Sync history */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent
          side="right"
          title="Sync History"
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">Sync History</SheetTitle>
              <SheetDescription className="text-xs">
                Log of balance sync / re-sync operations (this session).
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {syncHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sync operations recorded yet this session.
                </p>
              ) : (
                syncHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-none border border-border px-3 py-2.5 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{entry.action}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{entry.at}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.detail}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
