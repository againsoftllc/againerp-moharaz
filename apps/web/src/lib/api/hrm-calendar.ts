import { apiFetch } from "@/lib/api/client";
import { listHrmBranches } from "@/lib/api/hrm-branches";
import { listHrmHolidays } from "@/lib/api/hrm-holidays";
import { listHrmEmployees } from "@/lib/api/hrm-employees";
import {
  apiLeaveAppToRow,
  listHrmLeaveApplications,
  type LeaveAppLookups,
} from "@/lib/api/hrm-leave-applications";
import { listHrmLeaveTypes } from "@/lib/api/hrm-leave-types";
import { listMeetingsView } from "@/lib/api/hrm-meetings";
import type { HrmCalendarEvent } from "@/lib/mock-data/hrm-org";

type ApiMeetingAttendee = {
  id: string;
  meeting_id: string | null;
};

async function countMeetingAttendees(): Promise<Map<string, number>> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<{ data: ApiMeetingAttendee[] }>(
    `/api/v1/hrm/meeting-attendees?${qs.toString()}`,
    { cache: "no-store" },
  );
  const counts = new Map<string, number>();
  for (const row of res.data ?? []) {
    if (!row.meeting_id) continue;
    counts.set(row.meeting_id, (counts.get(row.meeting_id) ?? 0) + 1);
  }
  return counts;
}

function buildLeaveLookups(
  employees: Awaited<ReturnType<typeof listHrmEmployees>>["rows"],
  leaveTypes: Awaited<ReturnType<typeof listHrmLeaveTypes>>,
): LeaveAppLookups {
  const empById = new Map(employees.map((e) => [e.id, e]));
  const typeById = new Map(leaveTypes.map((t) => [String(t.id), String(t.name ?? "")]));
  return {
    employeeName: (id) => (id ? empById.get(id)?.name ?? "—" : "—"),
    employeeCode: (id) => (id ? empById.get(id)?.employee_code ?? "—" : "—"),
    employeeEmail: (id) => (id ? empById.get(id)?.email ?? "—" : "—"),
    employeeDesignation: () => "—",
    leaveTypeName: (id) => (id ? typeById.get(id) ?? "—" : "—"),
    leaveTypeIsPaid: () => false,
    leavePolicyName: () => "—",
  };
}

function holidayBranchLabel(
  branchIds: string[] | undefined,
  branchName: (id: string) => string,
): string {
  if (!branchIds?.length) return "All branches";
  const names = branchIds.map((id) => branchName(id)).filter(Boolean);
  return names.length ? names.join(", ") : "All branches";
}

export async function listHrmCalendarEvents(): Promise<HrmCalendarEvent[]> {
  const [meetings, holidays, leaveRes, employeesRes, leaveTypes, branches, attendeeCounts] =
    await Promise.all([
      listMeetingsView(),
      listHrmHolidays(),
      listHrmLeaveApplications({ status: "approved", per_page: 200 }),
      listHrmEmployees({ page: 1, per_page: 200 }),
      listHrmLeaveTypes(),
      listHrmBranches({ status: "active" }),
      countMeetingAttendees(),
    ]);

  const branchName = (id: string) =>
    branches.find((b) => String(b.id) === id)?.name?.toString() ?? id;
  const leaveLookups = buildLeaveLookups(employeesRes.rows, leaveTypes);

  const meetingEvents: HrmCalendarEvent[] = meetings.map((m) => ({
    id: m.id,
    kind: "meeting",
    title: m.title,
    startDate: m.meetingDate,
    endDate: m.meetingDate,
    startTime: m.startTime || undefined,
    endTime: m.endTime || undefined,
    allDay: false,
    subtitle: `${m.meetingType} · ${m.room || "—"}`,
    meta: {
      Type: m.meetingType,
      Time: m.startTime && m.endTime ? `${m.startTime} – ${m.endTime}` : "—",
      Location: m.room || "—",
      Attendees: String(attendeeCounts.get(m.id) ?? 0),
      Organizer: m.organizer || "—",
      Status: m.status,
      Description: m.description || "—",
    },
  }));

  const holidayEvents: HrmCalendarEvent[] = holidays.map((h) => {
    const startDate = h.start_date ?? "";
    const endDate = h.end_date ?? h.start_date ?? "";
    const branchesLabel = holidayBranchLabel(h.branch_ids, branchName);
    const category = h.category ?? "Company";
    return {
      id: h.id,
      kind: "holiday",
      title: h.name,
      startDate,
      endDate,
      allDay: true,
      subtitle: `${category}${h.is_half_day ? " · Half day" : ""}`,
      meta: {
        Category: category,
        Dates: startDate === endDate ? startDate : `${startDate} → ${endDate}`,
        Branches: branchesLabel,
        Paid: h.is_paid ? "Paid" : "Unpaid",
        "Half day": h.is_half_day ? "Yes" : "No",
        Description: h.description ?? "—",
      },
    };
  });

  const leaveEvents: HrmCalendarEvent[] = leaveRes.rows.map((row) => {
    const view = apiLeaveAppToRow(row, leaveLookups);
    return {
      id: view.id,
      kind: "leave",
      title: `${view.employeeName} — ${view.leaveTypeName}`,
      startDate: view.startDate,
      endDate: view.endDate,
      allDay: true,
      subtitle: `${view.totalDays} day(s) · Approved`,
      meta: {
        Employee: view.employeeName,
        "Leave type": view.leaveTypeName,
        From: view.startDate,
        To: view.endDate,
        Days: String(view.totalDays),
        Status: "Approved",
      },
    };
  });

  return [...meetingEvents, ...holidayEvents, ...leaveEvents];
}
