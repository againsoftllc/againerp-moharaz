import { listHrmAnnouncements } from "@/lib/api/hrm-announcements";
import { listHrmAttendanceRecords } from "@/lib/api/hrm-attendance-records";
import { listHrmBranches } from "@/lib/api/hrm-branches";
import { listHrmDepartments } from "@/lib/api/hrm-departments";
import { listHrmEmployees, type ApiHrmEmployee } from "@/lib/api/hrm-employees";
import { listHrmHolidays } from "@/lib/api/hrm-holidays";
import { listHrmLeaveApplications } from "@/lib/api/hrm-leave-applications";
import { listHrmLeaveTypes } from "@/lib/api/hrm-leave-types";
import { listMeetingsView } from "@/lib/api/hrm-meetings";
import { listCandidatesView, listJobPostingsView } from "@/lib/api/hrm-recruitment";
import { employeeAvatarUrl } from "@/lib/mock-data/employees";
import type { CandidateStatus } from "@/lib/mock-data/hrm-candidates";
import { CANDIDATE_STATUS_LABEL } from "@/lib/mock-data/hrm-candidates";

export type DashboardStats = {
  totalEmployees: number;
  totalBranches: number;
  monthAttendancePct: number;
  pendingLeaves: number;
  activeJobs: number;
  totalDepartments: number;
};

export type DashboardDeptCount = { name: string; count: number };

export type DashboardHiringPoint = { month: string; joined: number; left: number };

export type DashboardLeaveBreakdown = { name: string; value: number; color: string };

export type DashboardPipelinePoint = { stage: string; count: number };

export type DashboardPendingLeave = {
  id: string;
  employeeName: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
};

export type DashboardCandidate = {
  id: string;
  name: string;
  job: string;
  appliedAt: string;
  stage: string;
};

export type DashboardAnnouncement = {
  id: string;
  title: string;
  department: string;
  startDate: string;
};

export type DashboardMeeting = {
  id: string;
  title: string;
  type: string;
  when: string;
  room: string;
  attendees: number;
};

export type DashboardActivity = {
  id: string;
  text: string;
  at: string;
};

export type DashboardPerson = {
  id: string;
  name: string;
  department: string;
  workLocation: string;
  avatarUrl: string;
};

export type DashboardHoliday = {
  id: string;
  name: string;
  date: string;
};

export type HrmDashboardData = {
  stats: DashboardStats;
  deptCounts: DashboardDeptCount[];
  hiringTrend: DashboardHiringPoint[];
  leaveBreakdown: DashboardLeaveBreakdown[];
  candidatePipeline: DashboardPipelinePoint[];
  pendingLeaves: DashboardPendingLeave[];
  recentCandidates: DashboardCandidate[];
  announcements: DashboardAnnouncement[];
  recentMeetings: DashboardMeeting[];
  activities: DashboardActivity[];
  onLeave: DashboardPerson[];
  missingToday: DashboardPerson[];
  upcomingHolidays: DashboardHoliday[];
};

const LEAVE_COLORS = ["#00a09d", "#714B67", "#F0AD4E", "#0ea5e9", "#8b5cf6", "#10b981", "#94a3b8"];

const PIPELINE_ORDER: CandidateStatus[] = [
  "new",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
];

function ymd(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function monthStartEnd(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const endDate = new Date(y, m + 1, 0);
  const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end };
}

function lastSixMonthKeys(d = new Date()): string[] {
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    keys.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, 1);
  return dt.toLocaleString("en", { month: "short" });
}

function coversToday(start: string, end: string, today: string): boolean {
  if (!start) return false;
  const to = end || start;
  return start <= today && to >= today;
}

function relativeAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return ymd(iso);
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export async function loadHrmDashboard(): Promise<HrmDashboardData> {
  const today = todayYmd();
  const { start: monthStart, end: monthEnd } = monthStartEnd();

  const [
    employeesRes,
    branches,
    departments,
    leaveAppsRes,
    leaveTypes,
    announcements,
    candidates,
    jobs,
    meetings,
    holidays,
    attendanceRes,
  ] = await Promise.all([
    listHrmEmployees({ per_page: 200 }),
    listHrmBranches(),
    listHrmDepartments(),
    listHrmLeaveApplications({ per_page: 200 }),
    listHrmLeaveTypes(),
    listHrmAnnouncements(),
    listCandidatesView(),
    listJobPostingsView(),
    listMeetingsView(),
    listHrmHolidays(),
    listHrmAttendanceRecords({
      per_page: 200,
      date_from: monthStart,
      date_to: monthEnd,
    }),
  ]);

  const employees = employeesRes.rows;
  const leaveApps = leaveAppsRes.rows;
  const attendance = attendanceRes.rows;

  const deptById = new Map(departments.map((d) => [d.id, String(d.name ?? "")]));
  const leaveTypeById = new Map(leaveTypes.map((t) => [t.id, String(t.name ?? "")]));
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const activeEmployees = employees.filter((e) => e.employee_status !== "terminated");

  const pendingLeaveRows = leaveApps.filter((l) => l.status === "pending");
  const activeJobs = jobs.filter((j) => j.status === "published" || j.isPublished).length;

  const presentLike = attendance.filter(
    (r) => !r.is_absent && r.status !== "absent" && (r.clock_in || r.status === "present"),
  ).length;
  const attendanceDenom = attendance.filter((r) => !r.is_holiday && !r.is_weekend).length;
  const monthAttendancePct =
    attendanceDenom > 0
      ? Math.round((presentLike / attendanceDenom) * 100)
      : activeEmployees.length > 0
        ? 100
        : 0;

  const stats: DashboardStats = {
    totalEmployees: activeEmployees.length,
    totalBranches: branches.length,
    monthAttendancePct,
    pendingLeaves: pendingLeaveRows.length,
    activeJobs,
    totalDepartments: departments.length,
  };

  const deptCountMap = new Map<string, number>();
  for (const emp of activeEmployees) {
    const name = emp.department_id ? deptById.get(emp.department_id) ?? "Unassigned" : "Unassigned";
    deptCountMap.set(name, (deptCountMap.get(name) ?? 0) + 1);
  }
  const deptCounts = [...deptCountMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const monthKeys = lastSixMonthKeys();
  const joinedByMonth = new Map(monthKeys.map((k) => [k, 0]));
  const leftByMonth = new Map(monthKeys.map((k) => [k, 0]));
  for (const emp of employees) {
    const joinKey = ymd(emp.date_of_joining).slice(0, 7);
    if (joinKey && joinedByMonth.has(joinKey)) {
      joinedByMonth.set(joinKey, (joinedByMonth.get(joinKey) ?? 0) + 1);
    }
    if (emp.employee_status === "terminated") {
      const leftKey = ymd(emp.updated_at).slice(0, 7);
      if (leftKey && leftByMonth.has(leftKey)) {
        leftByMonth.set(leftKey, (leftByMonth.get(leftKey) ?? 0) + 1);
      }
    }
  }
  const hiringTrend = monthKeys.map((key) => ({
    month: monthLabel(key),
    joined: joinedByMonth.get(key) ?? 0,
    left: leftByMonth.get(key) ?? 0,
  }));

  const leaveCountMap = new Map<string, number>();
  for (const row of leaveApps) {
    const name = row.leave_type_id
      ? leaveTypeById.get(row.leave_type_id) ?? "Other"
      : "Other";
    leaveCountMap.set(name, (leaveCountMap.get(name) ?? 0) + 1);
  }
  const leaveBreakdown = [...leaveCountMap.entries()]
    .map(([name, value], i) => ({
      name,
      value,
      color: LEAVE_COLORS[i % LEAVE_COLORS.length]!,
    }))
    .sort((a, b) => b.value - a.value);

  const statusCounts = new Map<string, number>();
  for (const c of candidates) {
    statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);
  }
  const candidatePipeline = PIPELINE_ORDER.map((stage) => ({
    stage: CANDIDATE_STATUS_LABEL[stage],
    count: statusCounts.get(stage) ?? 0,
  }));

  const pendingLeaves: DashboardPendingLeave[] = pendingLeaveRows.slice(0, 8).map((row) => {
    const emp = row.employee_id ? employeeById.get(row.employee_id) : undefined;
    return {
      id: row.id,
      employeeName: emp?.name ?? "Unknown",
      leaveType: row.leave_type_id ? leaveTypeById.get(row.leave_type_id) ?? "Leave" : "Leave",
      fromDate: ymd(row.start_date),
      toDate: ymd(row.end_date),
    };
  });

  const recentCandidates: DashboardCandidate[] = [...candidates]
    .sort((a, b) => String(b.appliedOn).localeCompare(String(a.appliedOn)))
    .slice(0, 6)
    .map((c) => ({
      id: c.id,
      name: c.name,
      job: c.jobTitle || c.jobCode || "—",
      appliedAt: c.appliedOn,
      stage: CANDIDATE_STATUS_LABEL[c.status] ?? c.status,
    }));

  const announcementRows: DashboardAnnouncement[] = announcements.slice(0, 6).map((a) => ({
    id: a.id,
    title: String(a.name ?? ""),
    department: String(a.category ?? "General"),
    startDate: ymd(String(a.startDate ?? "")),
  }));

  const recentMeetings: DashboardMeeting[] = [...meetings]
    .sort((a, b) => `${b.meetingDate} ${b.startTime}`.localeCompare(`${a.meetingDate} ${a.startTime}`))
    .slice(0, 4)
    .map((m) => ({
      id: m.id,
      title: m.title,
      type: m.meetingType,
      when: `${m.meetingDate} ${m.startTime}`.trim(),
      room: m.room || "—",
      attendees: 0,
    }));

  const activities: DashboardActivity[] = [
    ...pendingLeaveRows.slice(0, 3).map((row) => {
      const emp = row.employee_id ? employeeById.get(row.employee_id) : undefined;
      return {
        id: `leave_${row.id}`,
        text: `Leave request from ${emp?.name ?? "employee"} is pending`,
        at: relativeAt(row.created_at),
      };
    }),
    ...recentCandidates.slice(0, 2).map((c) => ({
      id: `cand_${c.id}`,
      text: `New candidate ${c.name} applied for ${c.job}`,
      at: c.appliedAt,
    })),
    ...announcementRows.slice(0, 2).map((a) => ({
      id: `ann_${a.id}`,
      text: `Announcement: ${a.title}`,
      at: a.startDate,
    })),
  ].slice(0, 8);

  const onLeaveIds = new Set<string>();
  for (const row of leaveApps) {
    if (row.status !== "approved") continue;
    if (!coversToday(ymd(row.start_date), ymd(row.end_date), today)) continue;
    if (row.employee_id) onLeaveIds.add(row.employee_id);
  }
  for (const emp of employees) {
    if (emp.employee_status === "on_leave") onLeaveIds.add(emp.id);
  }

  const toPerson = (emp: ApiHrmEmployee): DashboardPerson => ({
    id: emp.id,
    name: emp.name,
    department: emp.department_id ? deptById.get(emp.department_id) ?? "" : "",
    workLocation: emp.branch_id ? "Office" : "—",
    avatarUrl: employeeAvatarUrl(emp.id, (emp.gender as "male" | "female" | "other") ?? undefined),
  });

  const onLeave = [...onLeaveIds]
    .map((id) => employeeById.get(id))
    .filter((e): e is ApiHrmEmployee => Boolean(e))
    .slice(0, 6)
    .map(toPerson);

  const presentToday = new Set(
    attendance
      .filter((r) => ymd(r.date) === today && !r.is_absent && (r.clock_in || r.status === "present"))
      .map((r) => r.employee_id)
      .filter(Boolean),
  );
  const missingToday = activeEmployees
    .filter((e) => !onLeaveIds.has(e.id) && !presentToday.has(e.id))
    .slice(0, 4)
    .map(toPerson);

  const upcomingHolidays: DashboardHoliday[] = holidays
    .map((h) => ({
      id: h.id,
      name: String(h.name ?? ""),
      date: ymd(String(h.startDate ?? "")),
    }))
    .filter((h) => h.date && h.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return {
    stats,
    deptCounts,
    hiringTrend,
    leaveBreakdown,
    candidatePipeline,
    pendingLeaves,
    recentCandidates,
    announcements: announcementRows,
    recentMeetings,
    activities,
    onLeave,
    missingToday,
    upcomingHolidays,
  };
}
