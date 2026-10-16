/** Workdo Meeting Rooms: physical/virtual rooms with capacity, equipment, meetings count. */

export type MeetingRoomStatus = "active" | "inactive";
export type MeetingRoomKind = "physical" | "virtual";

export type MeetingRoom = {
  id: string;
  name: string;
  kind: MeetingRoomKind;
  /** Physical address / floor; unused for virtual when joinLink is set. */
  location: string;
  /** Video join URL for virtual rooms. */
  joinLink: string;
  capacity: number;
  equipment: string[];
  meetingsCount: number;
  status: MeetingRoomStatus;
  description: string;
};

export const MEETING_ROOM_STATUS_LABEL: Record<MeetingRoomStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const MEETING_ROOM_KIND_LABEL: Record<MeetingRoomKind, string> = {
  physical: "Physical",
  virtual: "Virtual",
};

export const MEETING_ROOM_STATUS_OPTIONS = (
  Object.keys(MEETING_ROOM_STATUS_LABEL) as MeetingRoomStatus[]
).map((k) => ({ value: k, label: MEETING_ROOM_STATUS_LABEL[k] }));

export const MEETING_ROOM_KIND_OPTIONS = (
  Object.keys(MEETING_ROOM_KIND_LABEL) as MeetingRoomKind[]
).map((k) => ({ value: k, label: MEETING_ROOM_KIND_LABEL[k] }));

export const MEETING_ROOMS_SEED: MeetingRoom[] = [
  {
    id: "mr_1",
    name: "Webinar Room",
    kind: "virtual",
    location: "",
    joinLink: "https://meet.example.com/webinar",
    capacity: 500,
    equipment: ["Webcam", "Mic", "Screen share", "Recording", "Chat"],
    meetingsCount: 1,
    status: "active",
    description: "Large virtual webinar space for company-wide broadcasts.",
  },
  {
    // Workdo demo: https://demo.workdo.io/hrm/meetings/meeting-rooms
    id: "mr_2",
    name: "Huddle Space 1",
    kind: "physical",
    location: "First Floor, Open Area",
    joinLink: "",
    capacity: 6,
    equipment: ["Comfortable Seating", "Whiteboard", "WiFi"],
    meetingsCount: 31,
    status: "active",
    description:
      "Small informal meeting space for quick discussions and brainstorming sessions",
  },
  {
    id: "mr_3",
    name: "Teams Room 1",
    kind: "virtual",
    location: "",
    joinLink: "https://teams.microsoft.com/l/meetup-join/demo1",
    capacity: 250,
    equipment: ["Camera", "Speaker", "Screen share", "Recording"],
    meetingsCount: 0,
    status: "active",
    description: "Microsoft Teams virtual room for cross-team standups.",
  },
  {
    id: "mr_4",
    name: "Conference Room A",
    kind: "physical",
    location: "Second Floor, East Wing",
    joinLink: "",
    capacity: 12,
    equipment: ["Projector", "Whiteboard", "Phone", "HDMI"],
    meetingsCount: 18,
    status: "active",
    description: "Standard conference room for department meetings.",
  },
  {
    id: "mr_5",
    name: "Conference Room B",
    kind: "physical",
    location: "Second Floor, West Wing",
    joinLink: "",
    capacity: 10,
    equipment: ["TV", "Whiteboard", "HDMI"],
    meetingsCount: 9,
    status: "active",
    description: "West-wing meeting room with display and whiteboard.",
  },
  {
    id: "mr_6",
    name: "Board Room",
    kind: "physical",
    location: "Third Floor, Executive Suite",
    joinLink: "",
    capacity: 16,
    equipment: ["Projector", "Conference phone", "Whiteboard", "Laptop dock", "AV system"],
    meetingsCount: 7,
    status: "active",
    description: "Executive board room with full AV and conference phone.",
  },
  {
    id: "mr_7",
    name: "Training Room",
    kind: "physical",
    location: "Ground Floor, Training Center",
    joinLink: "",
    capacity: 40,
    equipment: ["Projector", "Mic", "Speakers", "Whiteboard"],
    meetingsCount: 5,
    status: "active",
    description: "Large training space for workshops and onboarding sessions.",
  },
  {
    id: "mr_8",
    name: "Zoom Studio",
    kind: "virtual",
    location: "",
    joinLink: "https://zoom.us/j/demo-studio",
    capacity: 100,
    equipment: ["HD Camera", "Ring light", "Mic", "Green screen"],
    meetingsCount: 4,
    status: "active",
    description: "Content studio setup for recorded Zoom sessions.",
  },
  {
    id: "mr_9",
    name: "Focus Booth 2",
    kind: "physical",
    location: "First Floor, Quiet Zone",
    joinLink: "",
    capacity: 2,
    equipment: ["Monitor", "Headset"],
    meetingsCount: 22,
    status: "active",
    description: "Quiet booth for 1:1s and focused calls.",
  },
  {
    id: "mr_10",
    name: "Innovation Lab",
    kind: "physical",
    location: "Basement, Lab Wing",
    joinLink: "",
    capacity: 20,
    equipment: ["Smart board", "3D display", "Speakers", "Cameras", "Whiteboard", "Power hubs"],
    meetingsCount: 3,
    status: "active",
    description: "Lab space for product demos and innovation workshops.",
  },
];

export function createMeetingRoomId(existing: MeetingRoom[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^mr_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `mr_${n + 1}`;
}

export function parseEquipment(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
