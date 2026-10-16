/** Workdo Meetings: Title+type, Date & Time, Organizer, Room, Recurrence, Status. */

export type MeetingRecurrence = "none" | "daily" | "weekly" | "monthly";
export type MeetingStatus = "scheduled" | "completed" | "cancelled";

export type MeetingTypeOption = {
  name: string;
  color: string;
};

export type HrmMeeting = {
  id: string;
  title: string;
  meetingType: string;
  typeColor: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  organizer: string;
  room: string;
  recurrence: MeetingRecurrence;
  status: MeetingStatus;
  description: string;
  videoLink: string;
};

export const MEETING_RECURRENCE_LABEL: Record<MeetingRecurrence, string> = {
  none: "None",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const MEETING_RECURRENCE_OPTIONS = (
  Object.keys(MEETING_RECURRENCE_LABEL) as MeetingRecurrence[]
).map((k) => ({ value: k, label: MEETING_RECURRENCE_LABEL[k] }));

export const MEETING_STATUS_OPTIONS = (
  Object.keys(MEETING_STATUS_LABEL) as MeetingStatus[]
).map((k) => ({ value: k, label: MEETING_STATUS_LABEL[k] }));

export const MEETING_TYPES: MeetingTypeOption[] = [
  { name: "All Hands", color: "#f97316" },
  { name: "Project Review", color: "#22c55e" },
  { name: "1:1", color: "#3b82f6" },
  { name: "Standup", color: "#a855f7" },
  { name: "Interview", color: "#ec4899" },
];

export const MEETING_ROOMS = [
  "Webinar Room",
  "Conference Room A",
  "Conference Room B",
  "Board Room",
  "Training Room",
] as const;

export const MEETING_ORGANIZERS = ["Manager", "Employee", "HR", "Admin"] as const;

export const MEETINGS_SEED: HrmMeeting[] = [
  {
    id: "mt_1",
    title: "All Hands Company Meeting",
    meetingType: "All Hands",
    typeColor: "#f97316",
    meetingDate: "2025-09-29",
    startTime: "16:00",
    endTime: "17:30",
    organizer: "Manager",
    room: "Webinar Room",
    recurrence: "none",
    status: "scheduled",
    description: "Company-wide update and Q&A.",
    videoLink: "",
  },
  {
    id: "mt_2",
    title: "Project Alpha Review",
    meetingType: "Project Review",
    typeColor: "#22c55e",
    meetingDate: "2026-02-26",
    startTime: "15:30",
    endTime: "17:00",
    organizer: "Employee",
    room: "Conference Room A",
    recurrence: "monthly",
    status: "scheduled",
    description: "Monthly project status review.",
    videoLink: "",
  },
  {
    id: "mt_3",
    title: "Project Alpha Review",
    meetingType: "Project Review",
    typeColor: "#22c55e",
    meetingDate: "2026-01-26",
    startTime: "15:30",
    endTime: "17:00",
    organizer: "Employee",
    room: "Conference Room A",
    recurrence: "monthly",
    status: "scheduled",
    description: "Monthly project status review.",
    videoLink: "",
  },
  {
    id: "mt_4",
    title: "Weekly Engineering Standup",
    meetingType: "Standup",
    typeColor: "#a855f7",
    meetingDate: "2026-07-24",
    startTime: "10:00",
    endTime: "10:30",
    organizer: "Manager",
    room: "Conference Room B",
    recurrence: "weekly",
    status: "scheduled",
    description: "Sprint sync and blockers.",
    videoLink: "https://meet.example.com/standup",
  },
  {
    id: "mt_5",
    title: "Candidate Final Interview",
    meetingType: "Interview",
    typeColor: "#ec4899",
    meetingDate: "2026-07-20",
    startTime: "14:00",
    endTime: "15:00",
    organizer: "HR",
    room: "Board Room",
    recurrence: "none",
    status: "completed",
    description: "Final round for senior engineer role.",
    videoLink: "",
  },
  {
    id: "mt_6",
    title: "Manager 1:1 — Performance",
    meetingType: "1:1",
    typeColor: "#3b82f6",
    meetingDate: "2026-07-18",
    startTime: "11:00",
    endTime: "11:45",
    organizer: "Manager",
    room: "Training Room",
    recurrence: "weekly",
    status: "cancelled",
    description: "Rescheduled due to leave.",
    videoLink: "",
  },
];

export function createMeetingId(existing: HrmMeeting[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^mt_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `mt_${n + 1}`;
}

export function typeColorFor(name: string): string {
  return MEETING_TYPES.find((t) => t.name === name)?.color ?? "#64748b";
}
