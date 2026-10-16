import { employeeAvatarUrl } from "@/lib/mock-data/employees";

/** Workdo Meeting Minutes: Meeting+date, Topic, Type, Recorded By, Recorded At. */

export type MinuteType = "note" | "action_item" | "decision" | "discussion";

export type MeetingMinute = {
  id: string;
  meetingTitle: string;
  meetingDate: string;
  topic: string;
  minuteType: MinuteType;
  content: string;
  recordedById: string;
  recordedByName: string;
  recordedAt: string;
};

export const MINUTE_TYPE_LABEL: Record<MinuteType, string> = {
  note: "Note",
  action_item: "Action Item",
  decision: "Decision",
  discussion: "Discussion",
};

export const MINUTE_TYPE_OPTIONS = (Object.keys(MINUTE_TYPE_LABEL) as MinuteType[]).map(
  (k) => ({ value: k, label: MINUTE_TYPE_LABEL[k] }),
);

export const MINUTE_MEETINGS = [
  { title: "Daily Scrum Meeting", date: "2025-09-19" },
  { title: "All Hands Company Meeting", date: "2025-09-29" },
  { title: "Project Alpha Review", date: "2026-02-26" },
  { title: "Weekly Engineering Standup", date: "2026-07-24" },
] as const;

export const MINUTE_RECORDERS = [
  { id: "emp_03", name: "Tanvir Hasan" },
  { id: "emp_01", name: "Karim Ahmed" },
  { id: "emp_04", name: "Nusrat Jahan" },
  { id: "emp_05", name: "Farzana Islam" },
] as const;

export const MEETING_MINUTES_SEED: MeetingMinute[] = [
  {
    id: "mm_1",
    meetingTitle: "Daily Scrum Meeting",
    meetingDate: "2025-09-19",
    topic: "Team Building Event",
    minuteType: "note",
    content: "Team agreed to host an offsite team-building session next month.",
    recordedById: "emp_03",
    recordedByName: "Tanvir Hasan",
    recordedAt: "2025-09-18",
  },
  {
    id: "mm_2",
    meetingTitle: "Daily Scrum Meeting",
    meetingDate: "2025-09-19",
    topic: "Code Review Process",
    minuteType: "action_item",
    content: "Update PR checklist and enforce two-reviewer rule for critical paths.",
    recordedById: "emp_03",
    recordedByName: "Tanvir Hasan",
    recordedAt: "2025-09-18",
  },
  {
    id: "mm_3",
    meetingTitle: "Daily Scrum Meeting",
    meetingDate: "2025-09-19",
    topic: "Resource Allocation Decision",
    minuteType: "decision",
    content: "Two engineers reassigned to Project Alpha for the next sprint.",
    recordedById: "emp_03",
    recordedByName: "Tanvir Hasan",
    recordedAt: "2025-09-18",
  },
  {
    id: "mm_4",
    meetingTitle: "Daily Scrum Meeting",
    meetingDate: "2025-09-19",
    topic: "Sprint Progress Review",
    minuteType: "discussion",
    content: "Discussed velocity drop and blockers around payment integration.",
    recordedById: "emp_03",
    recordedByName: "Tanvir Hasan",
    recordedAt: "2025-09-18",
  },
  {
    id: "mm_5",
    meetingTitle: "All Hands Company Meeting",
    meetingDate: "2025-09-29",
    topic: "Q3 Roadmap Highlights",
    minuteType: "discussion",
    content: "Leadership presented product and hiring priorities for Q4.",
    recordedById: "emp_04",
    recordedByName: "Nusrat Jahan",
    recordedAt: "2025-09-29",
  },
  {
    id: "mm_6",
    meetingTitle: "Project Alpha Review",
    meetingDate: "2026-02-26",
    topic: "Go-live Readiness",
    minuteType: "decision",
    content: "Approved soft launch for pilot customers in March.",
    recordedById: "emp_01",
    recordedByName: "Karim Ahmed",
    recordedAt: "2026-02-26",
  },
];

export function createMeetingMinuteId(existing: MeetingMinute[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^mm_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `mm_${n + 1}`;
}

export function minuteRecorderAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}
