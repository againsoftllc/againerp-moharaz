/** Workdo Meeting Types: split Add form + list with color, duration, meetings count. */

export type MeetingTypeStatus = "active" | "inactive";

export type MeetingType = {
  id: string;
  name: string;
  description: string;
  color: string;
  defaultDuration: number;
  meetingsCount: number;
  status: MeetingTypeStatus;
  locked: boolean;
};

export const MEETING_TYPE_STATUS_LABEL: Record<MeetingTypeStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const MEETING_TYPE_STATUS_OPTIONS = (
  Object.keys(MEETING_TYPE_STATUS_LABEL) as MeetingTypeStatus[]
).map((k) => ({ value: k, label: MEETING_TYPE_STATUS_LABEL[k] }));

export const MEETING_TYPES_SEED: MeetingType[] = [
  {
    id: "mty_1",
    name: "Performance Review",
    description: "Formal performance discussion between manager and employee.",
    color: "#ec4899",
    defaultDuration: 60,
    meetingsCount: 6,
    status: "active",
    locked: false,
  },
  {
    id: "mty_2",
    name: "All Hands",
    description:
      "Company-wide meeting covering strategy updates, announcements, and open Q&A with leadership.",
    color: "#f97316",
    defaultDuration: 60,
    meetingsCount: 1,
    status: "active",
    locked: false,
  },
  {
    id: "mty_3",
    name: "Project Review",
    description: "Status review for active projects and deliverables.",
    color: "#22c55e",
    defaultDuration: 90,
    meetingsCount: 6,
    status: "active",
    locked: false,
  },
  {
    id: "mty_4",
    name: "1:1",
    description: "One-on-one coaching and check-in.",
    color: "#3b82f6",
    defaultDuration: 30,
    meetingsCount: 12,
    status: "active",
    locked: false,
  },
  {
    id: "mty_5",
    name: "Standup",
    description: "Short daily or weekly sync.",
    color: "#a855f7",
    defaultDuration: 15,
    meetingsCount: 20,
    status: "active",
    locked: false,
  },
  {
    id: "mty_6",
    name: "Interview",
    description: "Candidate interview sessions.",
    color: "#ef4444",
    defaultDuration: 45,
    meetingsCount: 4,
    status: "inactive",
    locked: true,
  },
];

export function createMeetingTypeId(existing: MeetingType[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^mty_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `mty_${n + 1}`;
}
