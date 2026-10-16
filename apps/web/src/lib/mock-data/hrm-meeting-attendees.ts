import { employeeAvatarUrl } from "@/lib/mock-data/employees";
import { MEETINGS_SEED } from "@/lib/mock-data/hrm-meetings";

/** Workdo Meeting Attendees: Attendee, Meeting+date, RSVP, Attendance, RSVP Date, Decline Reason. */

export type AttendeeRsvp = "invited" | "accepted" | "declined" | "tentative";
export type AttendeeAttendance = "attended" | "not_attended" | "pending";
export type AttendeeRole = "organizer" | "presenter" | "attendee";
export type AttendanceType = "required" | "optional";

export type MeetingAttendee = {
  id: string;
  employeeId: string;
  employeeName: string;
  meetingTitle: string;
  meetingDate: string;
  role: AttendeeRole;
  /** Workdo detail: Required / Optional */
  attendanceType: AttendanceType;
  rsvp: AttendeeRsvp;
  attendance: AttendeeAttendance;
  rsvpDate: string | null;
  declineReason: string | null;
};

export const RSVP_LABEL: Record<AttendeeRsvp, string> = {
  invited: "Invited",
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Tentative",
};

export const ATTENDANCE_LABEL: Record<AttendeeAttendance, string> = {
  attended: "Attended",
  not_attended: "Not Attended",
  pending: "Pending",
};

export const ROLE_LABEL: Record<AttendeeRole, string> = {
  organizer: "Organizer",
  presenter: "Presenter",
  attendee: "Attendee",
};

export const ATTENDANCE_TYPE_LABEL: Record<AttendanceType, string> = {
  required: "Required",
  optional: "Optional",
};

export const RSVP_OPTIONS = (Object.keys(RSVP_LABEL) as AttendeeRsvp[]).map((k) => ({
  value: k,
  label: RSVP_LABEL[k],
}));

export const ATTENDANCE_OPTIONS = (
  Object.keys(ATTENDANCE_LABEL) as AttendeeAttendance[]
).map((k) => ({ value: k, label: ATTENDANCE_LABEL[k] }));

export const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as AttendeeRole[]).map((k) => ({
  value: k,
  label: ROLE_LABEL[k],
}));

export const ATTENDANCE_TYPE_OPTIONS = (
  Object.keys(ATTENDANCE_TYPE_LABEL) as AttendanceType[]
).map((k) => ({ value: k, label: ATTENDANCE_TYPE_LABEL[k] }));

export const ATTENDEE_EMPLOYEES = [
  { id: "emp_01", name: "Karim Ahmed" },
  { id: "emp_03", name: "Tanvir Hasan" },
  { id: "emp_04", name: "Nusrat Jahan" },
  { id: "emp_05", name: "Farzana Islam" },
  { id: "emp_06", name: "Rafiqul Islam" },
  { id: "emp_07", name: "Sadia Rahman" },
] as const;

export const ATTENDEE_MEETINGS = MEETINGS_SEED.map((m) => ({
  title: m.title,
  date: m.meetingDate,
}));

export const MEETING_ATTENDEES_SEED: MeetingAttendee[] = [
  {
    id: "ma_1",
    employeeId: "emp_04",
    employeeName: "Nusrat Jahan",
    meetingTitle: "All Hands Company Meeting",
    meetingDate: "2025-09-29",
    role: "attendee",
    attendanceType: "required",
    rsvp: "accepted",
    attendance: "not_attended",
    rsvpDate: "2025-09-28",
    declineReason: null,
  },
  {
    id: "ma_2",
    employeeId: "emp_01",
    employeeName: "Karim Ahmed",
    meetingTitle: "All Hands Company Meeting",
    meetingDate: "2025-09-29",
    role: "attendee",
    attendanceType: "required",
    rsvp: "tentative",
    attendance: "not_attended",
    rsvpDate: "2025-09-28",
    declineReason: null,
  },
  {
    // Workdo demo: Declined + Required + Not Attended + decline reason
    id: "ma_3",
    employeeId: "emp_03",
    employeeName: "Tanvir Hasan",
    meetingTitle: "All Hands Company Meeting",
    meetingDate: "2025-09-29",
    role: "attendee",
    attendanceType: "required",
    rsvp: "declined",
    attendance: "not_attended",
    rsvpDate: "2025-09-28",
    declineReason: "Conflicting meeting schedule",
  },
  {
    id: "ma_4",
    employeeId: "emp_05",
    employeeName: "Farzana Islam",
    meetingTitle: "Project Alpha Review",
    meetingDate: "2026-02-26",
    role: "presenter",
    attendanceType: "required",
    rsvp: "accepted",
    attendance: "pending",
    rsvpDate: "2026-02-20",
    declineReason: null,
  },
  {
    id: "ma_5",
    employeeId: "emp_06",
    employeeName: "Rafiqul Islam",
    meetingTitle: "Weekly Engineering Standup",
    meetingDate: "2026-07-24",
    role: "organizer",
    attendanceType: "required",
    rsvp: "accepted",
    attendance: "attended",
    rsvpDate: "2026-07-23",
    declineReason: null,
  },
  {
    id: "ma_6",
    employeeId: "emp_07",
    employeeName: "Sadia Rahman",
    meetingTitle: "Candidate Final Interview",
    meetingDate: "2026-07-20",
    role: "attendee",
    attendanceType: "optional",
    rsvp: "invited",
    attendance: "pending",
    rsvpDate: null,
    declineReason: null,
  },
];

export function createMeetingAttendeeId(existing: MeetingAttendee[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^ma_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `ma_${n + 1}`;
}

export function attendeeAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}
