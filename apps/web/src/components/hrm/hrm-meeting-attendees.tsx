"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Filter,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  User,
  UserCheck,
  Users,
} from "lucide-react";
import {
  ATTENDANCE_LABEL,
  ATTENDANCE_OPTIONS,
  ATTENDANCE_TYPE_LABEL,
  ATTENDANCE_TYPE_OPTIONS,
  ROLE_LABEL,
  ROLE_OPTIONS,
  RSVP_LABEL,
  RSVP_OPTIONS,
  attendeeAvatar,
  type AttendanceType,
  type AttendeeAttendance,
  type AttendeeRole,
  type AttendeeRsvp,
  type MeetingAttendee,
} from "@/lib/mock-data/hrm-meeting-attendees";
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
import {
  createMeetingAttendeeView,
  deleteMeetingAttendeeView,
  listMeetingAttendeesView,
  listMeetingAttendeeFormOptions,
  updateMeetingAttendeeView,
} from "@/lib/api/hrm-meetings";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type SortKey = "employeeName" | "meetingTitle" | "rsvp" | "attendance" | "rsvpDate";
type SortDir = "asc" | "desc";

type FormState = {
  employeeId: string;
  meetingKey: string;
  role: AttendeeRole;
  attendanceType: AttendanceType;
  rsvp: AttendeeRsvp;
  attendance: AttendeeAttendance;
  rsvpDate: string;
  declineReason: string;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function meetingKey(title: string, date: string) {
  return `${title}||${date}`;
}

function parseMeetingKey(key: string) {
  const [title, date] = key.split("||");
  return { title: title ?? "", date: date ?? "" };
}

type FormOptions = {
  attendees: { id: string; name: string }[];
  meetings: { title: string; date: string }[];
};

function emptyForm(opts?: FormOptions): FormState {
  const m = opts?.meetings?.[0];
  const a = opts?.attendees?.[0];
  return {
    employeeId: a?.id ?? "",
    meetingKey: m ? meetingKey(m.title, m.date) : "",
    role: "attendee",
    attendanceType: "required",
    rsvp: "invited",
    attendance: "pending",
    rsvpDate: "",
    declineReason: "",
  };
}

function formFromRow(row: MeetingAttendee): FormState {
  return {
    employeeId: row.employeeId,
    meetingKey: meetingKey(row.meetingTitle, row.meetingDate),
    role: row.role,
    attendanceType: row.attendanceType,
    rsvp: row.rsvp,
    attendance: row.attendance,
    rsvpDate: row.rsvpDate ?? "",
    declineReason: row.declineReason ?? "",
  };
}

function rsvpBadgeClass(rsvp: AttendeeRsvp) {
  switch (rsvp) {
    case "accepted":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "declined":
      return "border-rose-500/30 bg-rose-500/15 text-rose-800 dark:text-rose-300";
    case "tentative":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  }
}

function attendanceBadgeClass(attendance: AttendeeAttendance) {
  switch (attendance) {
    case "attended":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "not_attended":
      return "border-rose-500/30 bg-rose-500/15 text-rose-800 dark:text-rose-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function attendanceTypeBadgeClass(type: AttendanceType) {
  return type === "required"
    ? "border-rose-500/30 bg-rose-500/15 text-rose-800 dark:text-rose-300"
    : "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
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

function MeetingAttendeeDetails({ row }: { row: MeetingAttendee }) {
  return (
    <div className="flex-1 space-y-5 overflow-auto p-4">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <DetailField icon={<User className="size-3.5" />} label="Attendee">
          <span className="font-medium">{row.employeeName}</span>
        </DetailField>
        <DetailField icon={<FileText className="size-3.5" />} label="Attendance Type">
          <Badge
            variant="outline"
            className={cn(
              "rounded-none text-[10px]",
              attendanceTypeBadgeClass(row.attendanceType),
            )}
          >
            {ATTENDANCE_TYPE_LABEL[row.attendanceType]}
          </Badge>
        </DetailField>
        <DetailField icon={<Calendar className="size-3.5" />} label="Meeting">
          <div>
            <div className="font-medium">{row.meetingTitle}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{row.meetingDate}</div>
          </div>
        </DetailField>
        <DetailField icon={<Clock className="size-3.5" />} label="RSVP Date">
          {row.rsvpDate || "—"}
        </DetailField>
        <DetailField icon={<CheckCircle2 className="size-3.5" />} label="RSVP Status">
          <Badge
            variant="outline"
            className={cn("rounded-none text-[10px]", rsvpBadgeClass(row.rsvp))}
          >
            {RSVP_LABEL[row.rsvp]}
          </Badge>
        </DetailField>
        <DetailField icon={<Users className="size-3.5" />} label="Attendance">
          <Badge
            variant="outline"
            className={cn("rounded-none text-[10px]", attendanceBadgeClass(row.attendance))}
          >
            {ATTENDANCE_LABEL[row.attendance]}
          </Badge>
        </DetailField>
        {row.rsvp === "declined" || row.declineReason ? (
          <DetailField icon={<FileText className="size-3.5" />} label="Decline Reason">
            {row.declineReason || "—"}
          </DetailField>
        ) : null}
      </div>
    </div>
  );
}

export function HrmMeetingAttendees() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<MeetingAttendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOptions, setFormOptions] = useState<FormOptions | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftRsvp, setDraftRsvp] = useState<"all" | AttendeeRsvp>("all");
  const [draftAttendance, setDraftAttendance] = useState<"all" | AttendeeAttendance>("all");
  const [rsvpFilter, setRsvpFilter] = useState<"all" | AttendeeRsvp>("all");
  const [attendanceFilter, setAttendanceFilter] = useState<"all" | AttendeeAttendance>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("employeeName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [viewRow, setViewRow] = useState<MeetingAttendee | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [opts, data] = await Promise.all([
          listMeetingAttendeeFormOptions(),
          listMeetingAttendeesView(),
        ]);
        if (cancelled) return;
        setFormOptions(opts);
        setRows(data);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load meeting attendees");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (rsvpFilter !== "all") list = list.filter((r) => r.rsvp === rsvpFilter);
    if (attendanceFilter !== "all") {
      list = list.filter((r) => r.attendance === attendanceFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.meetingTitle.toLowerCase().includes(q) ||
          (r.declineReason?.toLowerCase().includes(q) ?? false),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, rsvpFilter, attendanceFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function openAdd() {
    if (!formOptions) return;
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(formOptions));
    setFormOpen(true);
  }

  function openEdit(row: MeetingAttendee) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function markAttendance(row: MeetingAttendee) {
    const next: AttendeeAttendance =
      row.attendance === "attended" ? "not_attended" : "attended";
    try {
      setSaving(true);
      const updated = await updateMeetingAttendeeView(row.id, { ...row, attendance: next });
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      setViewRow((v) => (v?.id === row.id ? updated : v));
      toast.success(`Marked as ${ATTENDANCE_LABEL[next]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update attendance");
    } finally {
      setSaving(false);
    }
  }

  function messageAttendee(row: MeetingAttendee) {
    toast.message(`Message: ${row.employeeName}`, {
      description: `Re: ${row.meetingTitle}`,
    });
  }

  async function saveForm() {
    if (!formOptions) return;
    const emp = formOptions.attendees.find((e) => e.id === form.employeeId);
    if (!emp) {
      toast.error("Select an attendee");
      return;
    }
    const meeting = parseMeetingKey(form.meetingKey);
    if (!meeting.title) {
      toast.error("Select a meeting");
      return;
    }

    const payload: Omit<MeetingAttendee, "id"> = {
      employeeId: emp.id,
      employeeName: emp.name,
      meetingTitle: meeting.title,
      meetingDate: meeting.date,
      role: form.role,
      attendanceType: form.attendanceType,
      rsvp: form.rsvp,
      attendance: form.attendance,
      rsvpDate: form.rsvpDate || (form.rsvp === "invited" ? null : todayYmd()),
      declineReason:
        form.rsvp === "declined" ? form.declineReason.trim() || null : null,
    };
    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateMeetingAttendeeView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Attendee updated");
      } else {
        const created = await createMeetingAttendeeView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Attendee added");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Meeting Attendees
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Attendee
          </Button>
        ) : null}
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
              RSVP
              <select
                value={draftRsvp}
                onChange={(e) => setDraftRsvp(e.target.value as "all" | AttendeeRsvp)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {RSVP_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
              Attendance
              <select
                value={draftAttendance}
                onChange={(e) =>
                  setDraftAttendance(e.target.value as "all" | AttendeeAttendance)
                }
                className={fieldClass}
              >
                <option value="all">All</option>
                {ATTENDANCE_OPTIONS.map((s) => (
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
                  setRsvpFilter(draftRsvp);
                  setAttendanceFilter(draftAttendance);
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
                  setDraftRsvp("all");
                  setDraftAttendance("all");
                  setRsvpFilter("all");
                  setAttendanceFilter("all");
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
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Attendee" col="employeeName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Meeting" col="meetingTitle" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="RSVP" col="rsvp" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Attendance" col="attendance" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="RSVP Date" col="rsvpDate" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Decline Reason
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
                  Loading meeting attendees...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No meeting attendees found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={attendeeAvatar(row.employeeId)}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-none border border-border object-cover"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">
                          {ROLE_LABEL[row.role]}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{row.meetingTitle}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="size-3 shrink-0" />
                      <span className="tabular-nums">{row.meetingDate}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        rsvpBadgeClass(row.rsvp),
                      )}
                    >
                      {RSVP_LABEL[row.rsvp]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        attendanceBadgeClass(row.attendance),
                      )}
                    >
                      {ATTENDANCE_LABEL[row.attendance]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.rsvpDate || "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {row.declineReason || "—"}
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
                            className="h-7 w-7 rounded-none text-emerald-600 dark:text-emerald-400"
                            onClick={() => messageAttendee(row)}
                            aria-label="Message"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-violet-600 dark:text-violet-400"
                            onClick={() => markAttendance(row)}
                            aria-label="Mark attendance"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
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
          title="Meeting attendee details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <Users className="size-4" />
              </div>
              <div>
                <SheetTitle className="text-base">Meeting Attendee Details</SheetTitle>
                <SheetDescription className="sr-only">View meeting attendee</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          {viewRow ? <MeetingAttendeeDetails row={viewRow} /> : null}
        </SheetContent>
      </Sheet>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[440px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Attendee" : "Add Attendee"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Attendee" : "Add Attendee"}
            </SheetTitle>
            <SheetDescription className="sr-only">Meeting attendee form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Attendee *
              <select
                value={form.employeeId}
                onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
                className={fieldClass}
              >
                {formOptions?.attendees?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Meeting *
              <select
                value={form.meetingKey}
                onChange={(e) => setForm((f) => ({ ...f, meetingKey: e.target.value }))}
                className={fieldClass}
              >
                {formOptions?.meetings?.map((m) => {
                  const key = meetingKey(m.title, m.date);
                  return (
                    <option key={key} value={key}>
                      {m.title} ({m.date})
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Role
              <select
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value as AttendeeRole }))
                }
                className={fieldClass}
              >
                {ROLE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Attendance Type
              <select
                value={form.attendanceType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    attendanceType: e.target.value as AttendanceType,
                  }))
                }
                className={fieldClass}
              >
                {ATTENDANCE_TYPE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                RSVP
                <select
                  value={form.rsvp}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, rsvp: e.target.value as AttendeeRsvp }))
                  }
                  className={fieldClass}
                >
                  {RSVP_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Attendance
                <select
                  value={form.attendance}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      attendance: e.target.value as AttendeeAttendance,
                    }))
                  }
                  className={fieldClass}
                >
                  {ATTENDANCE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              RSVP Date
              <Input
                type="date"
                value={form.rsvpDate}
                onChange={(e) => setForm((f) => ({ ...f, rsvpDate: e.target.value }))}
                className="h-9 rounded-none"
              />
            </label>
            {form.rsvp === "declined" ? (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Decline Reason
                <Textarea
                  value={form.declineReason}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, declineReason: e.target.value }))
                  }
                  className="min-h-[72px] rounded-none"
                  placeholder="e.g. Conflicting meeting schedule"
                />
              </label>
            ) : null}
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              onClick={() => void saveForm()}
              disabled={saving}
            >
              {formMode === "edit" ? "Save Changes" : "Add Attendee"}
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
