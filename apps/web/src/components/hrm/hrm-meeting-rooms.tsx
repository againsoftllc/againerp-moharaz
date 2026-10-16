"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DoorOpen,
  Eye,
  Filter,
  Hash,
  Lock,
  MapPin,
  Monitor,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
  Users,
  Wrench,
} from "lucide-react";
import {
  MEETING_ROOM_KIND_LABEL,
  MEETING_ROOM_KIND_OPTIONS,
  MEETING_ROOM_STATUS_LABEL,
  MEETING_ROOM_STATUS_OPTIONS,
  parseEquipment,
  type MeetingRoom,
  type MeetingRoomKind,
  type MeetingRoomStatus,
} from "@/lib/mock-data/hrm-meeting-rooms";
import {
  createMeetingRoomView,
  deleteMeetingRoomView,
  listMeetingRoomsView,
  updateMeetingRoomView,
} from "@/lib/api/hrm-meetings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

type SortKey = "name" | "kind" | "capacity" | "meetingsCount" | "status";
type SortDir = "asc" | "desc";

type FormState = {
  name: string;
  kind: MeetingRoomKind;
  location: string;
  joinLink: string;
  capacity: string;
  equipment: string;
  description: string;
  status: MeetingRoomStatus;
};

function emptyForm(): FormState {
  return {
    name: "",
    kind: "physical",
    location: "",
    joinLink: "",
    capacity: "10",
    equipment: "",
    description: "",
    status: "active",
  };
}

function formFromRow(row: MeetingRoom): FormState {
  return {
    name: row.name,
    kind: row.kind,
    location: row.location,
    joinLink: row.joinLink,
    capacity: String(row.capacity),
    equipment: row.equipment.join(", "),
    description: row.description,
    status: row.status,
  };
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-none border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      </div>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-none border border-border bg-muted/40 text-muted-foreground">
        {icon}
      </div>
    </div>
  );
}

function kindBadgeClass(kind: MeetingRoomKind) {
  return kind === "virtual"
    ? "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300"
    : "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
}

function statusBadgeClass(status: MeetingRoomStatus) {
  return status === "active"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/40 text-muted-foreground";
}

function DetailField({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="text-muted-foreground/80">{icon}</span>
        {label}
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function MeetingRoomDetails({
  row,
  canWrite,
  onEdit,
}: {
  row: MeetingRoom;
  canWrite: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border bg-emerald-500/10 px-4 py-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center border",
              row.kind === "virtual"
                ? "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300"
                : "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {row.kind === "virtual" ? (
              <Monitor className="size-5" />
            ) : (
              <MapPin className="size-5" />
            )}
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{row.name}</h2>
            <Badge
              variant="outline"
              className={cn("mt-1.5 rounded-none text-[10px]", kindBadgeClass(row.kind))}
            >
              {MEETING_ROOM_KIND_LABEL[row.kind]}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-auto p-4">
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Basic Info</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField icon={<Lock className="size-3.5" />} label="Status">
              <Badge
                variant="outline"
                className={cn("rounded-none text-[10px]", statusBadgeClass(row.status))}
              >
                {MEETING_ROOM_STATUS_LABEL[row.status]}
              </Badge>
            </DetailField>
            <DetailField icon={<Users className="size-3.5" />} label="Capacity">
              <span className="font-semibold tabular-nums">{row.capacity}</span>
            </DetailField>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Room Details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField
              icon={
                row.kind === "virtual" ? (
                  <Monitor className="size-3.5" />
                ) : (
                  <MapPin className="size-3.5" />
                )
              }
              label={row.kind === "virtual" ? "Join Link" : "Location"}
            >
              <span className="break-all">
                {row.kind === "virtual" ? row.joinLink || "—" : row.location || "—"}
              </span>
            </DetailField>
            <DetailField icon={<Hash className="size-3.5" />} label="Meetings">
              <span className="inline-flex min-w-7 items-center justify-center border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium tabular-nums">
                {row.meetingsCount}
              </span>
            </DetailField>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Equipment</h3>
          {row.equipment.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {row.equipment.map((item) => (
                <span
                  key={item}
                  className="border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-xs text-sky-800 dark:text-sky-300"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Description</h3>
          <p className="text-sm text-foreground">{row.description || "—"}</p>
        </section>

        {canWrite ? (
          <Button type="button" size="sm" className={cn("h-9", GREEN_BTN)} onClick={onEdit}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function HrmMeetingRooms() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<MeetingRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | MeetingRoomStatus>("all");
  const [draftKind, setDraftKind] = useState<"all" | MeetingRoomKind>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | MeetingRoomStatus>("all");
  const [kindFilter, setKindFilter] = useState<"all" | MeetingRoomKind>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [viewRow, setViewRow] = useState<MeetingRoom | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await listMeetingRoomsView();
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load meeting rooms");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((r) => r.status === "active").length,
      physical: rows.filter((r) => r.kind === "physical").length,
      virtual: rows.filter((r) => r.kind === "virtual").length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (kindFilter !== "all") list = list.filter((r) => r.kind === kindFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q) ||
          r.joinLink.toLowerCase().includes(q) ||
          r.equipment.some((e) => e.toLowerCase().includes(q)),
      );
    }
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sortDir === "asc" ? -1 : 1;
      if (as > bs) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rows, search, statusFilter, kindFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(row: MeetingRoom) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    const name = form.name.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    const capacity = Number(form.capacity);
    if (!Number.isFinite(capacity) || capacity < 1) {
      toast.error("Capacity must be at least 1");
      return;
    }
    if (form.kind === "physical" && !form.location.trim()) {
      toast.error("Location is required for physical rooms");
      return;
    }
    if (form.kind === "virtual" && !form.joinLink.trim()) {
      toast.error("Join link is required for virtual rooms");
      return;
    }

    const equipment = parseEquipment(form.equipment);
    const payload: Omit<MeetingRoom, "id" | "meetingsCount"> & { meetingsCount?: number } = {
      name,
      kind: form.kind,
      location: form.kind === "physical" ? form.location.trim() : "",
      joinLink: form.kind === "virtual" ? form.joinLink.trim() : "",
      capacity,
      equipment,
      description: form.description.trim(),
      status: form.status,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const existing = rows.find((r) => r.id === editId);
        const updated = await updateMeetingRoomView(editId, payload);
        updated.meetingsCount = existing?.meetingsCount ?? 0;
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Meeting room updated");
      } else {
        const created = await createMeetingRoomView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Meeting room added");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: MeetingRoom) {
    if (row.meetingsCount > 0) {
      toast.error("Cannot delete a room with scheduled meetings");
      return;
    }
    if (!window.confirm(`Delete meeting room “${row.name}”?`)) return;
    try {
      await deleteMeetingRoomView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Meeting room deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function toggleStatus(row: MeetingRoom) {
    if (!canWrite) return;
    const next: MeetingRoomStatus = row.status === "active" ? "inactive" : "active";
    try {
      const updated = await updateMeetingRoomView(row.id, {
        ...row,
        status: next,
      });
      updated.meetingsCount = row.meetingsCount;
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      setViewRow((v) => (v?.id === row.id ? updated : v));
      toast.success(next === "active" ? "Room activated" : "Room deactivated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Meeting Rooms</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Meeting Room
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Rooms"
          value={stats.total}
          icon={<DoorOpen className="size-5 text-sky-500" />}
        />
        <StatCard
          label="Active Rooms"
          value={stats.active}
          icon={<DoorOpen className="size-5 text-emerald-500" />}
        />
        <StatCard
          label="Physical Rooms"
          value={stats.physical}
          icon={<MapPin className="size-5 text-emerald-500" />}
        />
        <StatCard
          label="Virtual Rooms"
          value={stats.virtual}
          icon={<Monitor className="size-5 text-sky-500" />}
        />
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
        <div className="rounded-none border border-border bg-card p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as "all" | MeetingRoomStatus)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {MEETING_ROOM_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Type
              <select
                value={draftKind}
                onChange={(e) => setDraftKind(e.target.value as "all" | MeetingRoomKind)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {MEETING_ROOM_KIND_OPTIONS.map((s) => (
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
                  setStatusFilter(draftStatus);
                  setKindFilter(draftKind);
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
                  setDraftStatus("all");
                  setDraftKind("all");
                  setStatusFilter("all");
                  setKindFilter("all");
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

      <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Name" col="name" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Location
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Capacity" col="capacity" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Equipment
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Meetings" col="meetingsCount" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading meeting rooms...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No meeting rooms found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-none border border-border",
                          row.kind === "virtual"
                            ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {row.kind === "virtual" ? (
                          <Monitor className="size-3.5" />
                        ) : (
                          <MapPin className="size-3.5" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{row.name}</div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "mt-1 rounded-none text-[10px] font-normal",
                            kindBadgeClass(row.kind),
                          )}
                        >
                          {MEETING_ROOM_KIND_LABEL[row.kind]}
                        </Badge>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.kind === "virtual" && row.joinLink ? (
                      <a
                        href={row.joinLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-600 hover:underline dark:text-sky-400"
                      >
                        Join Link
                      </a>
                    ) : (
                      <span className="text-foreground">{row.location || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 tabular-nums text-foreground">
                      <User className="size-3.5 shrink-0 text-muted-foreground" />
                      {row.capacity}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className="rounded-none border-border bg-muted/40 text-[10px] font-normal text-muted-foreground"
                    >
                      <Wrench className="mr-1 size-3" />
                      {row.equipment.length} {row.equipment.length === 1 ? "item" : "items"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex size-7 items-center justify-center rounded-none border border-border text-xs tabular-nums text-foreground">
                      {row.meetingsCount}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={row.status === "active"}
                        disabled={!canWrite}
                        onClick={() => toggleStatus(row)}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-none border transition-colors",
                          row.status === "active"
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-border bg-muted",
                          !canWrite && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute size-3.5 rounded-none bg-white shadow transition-all",
                            row.status === "active" ? "left-[18px]" : "left-0.5",
                          )}
                        />
                      </button>
                      <span className="text-sm text-foreground">
                        {MEETING_ROOM_STATUS_LABEL[row.status]}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none text-sky-600 dark:text-sky-400"
                        onClick={() => setViewRow(row)}
                        aria-label="View"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {canWrite ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-amber-600 dark:text-amber-400"
                            onClick={() => openEdit(row)}
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-red-600 dark:text-red-400"
                            onClick={() => remove(row)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
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

      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[440px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Meeting room details"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Meeting Room Details</SheetTitle>
            <SheetDescription>View meeting room</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <MeetingRoomDetails
              row={viewRow}
              canWrite={canWrite}
              onEdit={() => {
                openEdit(viewRow);
                setViewRow(null);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[460px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Meeting Room" : "Add Meeting Room"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Meeting Room" : "Add Meeting Room"}
            </SheetTitle>
            <SheetDescription className="sr-only">Meeting room form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Name *
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g. Conference Room A"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Type *
              <select
                value={form.kind}
                onChange={(e) =>
                  setForm((f) => ({ ...f, kind: e.target.value as MeetingRoomKind }))
                }
                className={fieldClass}
              >
                {MEETING_ROOM_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {form.kind === "physical" ? (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Location *
                <Input
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  className="h-9 rounded-none"
                  placeholder="e.g. First Floor, Open Area"
                />
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Join Link *
                <Input
                  value={form.joinLink}
                  onChange={(e) => setForm((f) => ({ ...f, joinLink: e.target.value }))}
                  className="h-9 rounded-none"
                  placeholder="https://..."
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Capacity *
              <Input
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                className="h-9 rounded-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Equipment
              <Textarea
                value={form.equipment}
                onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))}
                className="min-h-[80px] rounded-none"
                placeholder="Comma-separated, e.g. Projector, Whiteboard, HDMI"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Description
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="min-h-[72px] rounded-none"
                placeholder="Short description of the room"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Status *
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as MeetingRoomStatus }))
                }
                className={fieldClass}
              >
                {MEETING_ROOM_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              onClick={() => void saveForm()}
              disabled={saving}
            >
              {formMode === "edit" ? "Save Changes" : "Create Room"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-none"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
