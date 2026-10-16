/** Workdo demo: Program (session + program), Date & Time, Location+mode, Status, Trainers, Attendance. */

export type SessionMode = "virtual" | "physical";
export type SessionStatus = "scheduled" | "in_progress" | "completed";

export type TrainingSession = {
  id: string;
  sessionName: string;
  programName: string;
  startAt: string; // YYYY-MM-DD HH:mm
  endAt: string;
  location: string;
  mode: SessionMode;
  status: SessionStatus;
  trainers: string[];
  attendance: number;
};

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
};

export const SESSION_MODE_LABEL: Record<SessionMode, string> = {
  virtual: "Virtual",
  physical: "Physical",
};

export const SESSION_STATUS_OPTIONS = (
  Object.keys(SESSION_STATUS_LABEL) as SessionStatus[]
).map((k) => ({ value: k, label: SESSION_STATUS_LABEL[k] }));

export const SESSION_MODE_OPTIONS = (
  Object.keys(SESSION_MODE_LABEL) as SessionMode[]
).map((k) => ({ value: k, label: SESSION_MODE_LABEL[k] }));

export const SESSION_PROGRAMS = [
  "Executive Leadership Program",
  "Database Management Certification",
  "Advanced Software Development",
  "Department Integration Workshop",
  "Customer Service Excellence",
] as const;

export const SESSION_TRAINER_POOL = [
  "Burdette Rath",
  "Rosemary Okuneva",
  "Karim Ahmed",
  "Nusrat Jahan",
  "Tanvir Hasan",
  "Farzana Islam",
] as const;

export const SESSION_LOCATIONS: { name: string; mode: SessionMode }[] = [
  { name: "Zoom Meeting", mode: "virtual" },
  { name: "Online Platform", mode: "virtual" },
  { name: "Conference Hall", mode: "physical" },
  { name: "Training Room 2", mode: "physical" },
  { name: "Main Auditorium", mode: "physical" },
];

export const TRAINING_SESSIONS_SEED: TrainingSession[] = [
  {
    id: "ts_1",
    sessionName: "Evening Online Session",
    programName: "Executive Leadership Program",
    startAt: "2025-07-21 00:00",
    endAt: "2025-07-21 02:00",
    location: "Zoom Meeting",
    mode: "virtual",
    status: "completed",
    trainers: ["Burdette Rath", "Rosemary Okuneva", "Karim Ahmed"],
    attendance: 5,
  },
  {
    id: "ts_2",
    sessionName: "Morning Kickoff",
    programName: "Database Management Certification",
    startAt: "2025-08-05 09:00",
    endAt: "2025-08-05 12:00",
    location: "Conference Hall",
    mode: "physical",
    status: "scheduled",
    trainers: ["Nusrat Jahan", "Tanvir Hasan"],
    attendance: 0,
  },
  {
    id: "ts_3",
    sessionName: "Hands-on Lab",
    programName: "Advanced Software Development",
    startAt: "2025-07-10 13:00",
    endAt: "2025-07-10 17:00",
    location: "Training Room 2",
    mode: "physical",
    status: "in_progress",
    trainers: ["Farzana Islam"],
    attendance: 12,
  },
  {
    id: "ts_4",
    sessionName: "Orientation Webinar",
    programName: "Department Integration Workshop",
    startAt: "2025-06-15 10:00",
    endAt: "2025-06-15 11:30",
    location: "Online Platform",
    mode: "virtual",
    status: "completed",
    trainers: ["Rosemary Okuneva", "Burdette Rath"],
    attendance: 28,
  },
  {
    id: "ts_5",
    sessionName: "Service Soft Skills",
    programName: "Customer Service Excellence",
    startAt: "2025-09-01 14:00",
    endAt: "2025-09-01 16:00",
    location: "Main Auditorium",
    mode: "physical",
    status: "scheduled",
    trainers: ["Karim Ahmed", "Nusrat Jahan", "Farzana Islam", "Tanvir Hasan"],
    attendance: 0,
  },
];

export function createTrainingSessionId(existing: TrainingSession[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^ts_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `ts_${n + 1}`;
}

export function formatSessionRange(startAt: string, endAt: string): string {
  return `${startAt} - ${endAt}`;
}
