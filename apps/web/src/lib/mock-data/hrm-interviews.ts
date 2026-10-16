import { CANDIDATES_SEED } from "@/lib/mock-data/hrm-candidates";

export type InterviewStatus = "scheduled" | "completed" | "cancelled" | "rescheduled";
export type InterviewFeedbackStatus = "pending" | "submitted";

export type Interview = {
  id: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  jobCode: string;
  round: string;
  type: string;
  date: string;
  time: string;
  durationMin: number;
  location: string;
  meetingLink: string;
  interviewer: string;
  notes: string;
  status: InterviewStatus;
  feedback: InterviewFeedbackStatus;
  feedbackNotes: string;
};

export const INTERVIEW_STATUS_LABEL: Record<InterviewStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

export const INTERVIEW_FEEDBACK_LABEL: Record<InterviewFeedbackStatus, string> = {
  pending: "Pending",
  submitted: "Submitted",
};

export const INTERVIEW_STATUS_OPTIONS = (
  Object.keys(INTERVIEW_STATUS_LABEL) as InterviewStatus[]
).map((k) => ({ value: k, label: INTERVIEW_STATUS_LABEL[k] }));

export const INTERVIEW_FEEDBACK_OPTIONS = (
  Object.keys(INTERVIEW_FEEDBACK_LABEL) as InterviewFeedbackStatus[]
).map((k) => ({ value: k, label: INTERVIEW_FEEDBACK_LABEL[k] }));

export const INTERVIEW_ROUNDS = [
  "Initial Screening",
  "Technical Interview",
  "HR Interview",
  "Final Interview",
] as const;

export const INTERVIEW_TYPES = [
  "Phone Screening",
  "Video Interview",
  "Technical Interview",
  "Case Study Interview",
  "Practical Assessment",
  "In-Person Interview",
] as const;

export const INTERVIEW_LOCATIONS = [
  "Online",
  "Conference Room A",
  "Conference Room B",
  "Boardroom",
  "Meeting Room 1",
] as const;

export function createInterviewId(existing: Interview[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `int_${String(max + 1).padStart(2, "0")}`;
}

function cand(id: string) {
  return CANDIDATES_SEED.find((c) => c.id === id) ?? CANDIDATES_SEED[0]!;
}

/** Workdo-style demo interviews. */
export const INTERVIEWS_SEED: Interview[] = [
  {
    id: "int_01",
    candidateId: "cand_02",
    candidateName: cand("cand_02").name,
    jobTitle: cand("cand_02").jobTitle,
    jobCode: cand("cand_02").jobCode,
    round: "Final Interview",
    type: "Video Interview",
    date: "2026-01-08",
    time: "14:00",
    durationMin: 45,
    location: "Online",
    meetingLink: "https://meet.example.com/nisha-final",
    interviewer: "Priya Sharma",
    notes: "Discuss portfolio samples and culture fit.",
    status: "completed",
    feedback: "submitted",
    feedbackNotes: "Strong writing; recommend hire.",
  },
  {
    id: "int_02",
    candidateId: "cand_03",
    candidateName: cand("cand_03").name,
    jobTitle: cand("cand_03").jobTitle,
    jobCode: cand("cand_03").jobCode,
    round: "Initial Screening",
    type: "Phone Screening",
    date: "2026-01-10",
    time: "11:00",
    durationMin: 30,
    location: "Online",
    meetingLink: "https://meet.example.com/ramesh-screen",
    interviewer: "Ankit Verma",
    notes: "Confirm CCNA and notice period.",
    status: "scheduled",
    feedback: "pending",
    feedbackNotes: "",
  },
  {
    id: "int_03",
    candidateId: "cand_01",
    candidateName: cand("cand_01").name,
    jobTitle: cand("cand_01").jobTitle,
    jobCode: cand("cand_01").jobCode,
    round: "Technical Interview",
    type: "Technical Interview",
    date: "2026-01-12",
    time: "10:30",
    durationMin: 60,
    location: "Conference Room A",
    meetingLink: "",
    interviewer: "Rahul Mehta",
    notes: "System design + coding round.",
    status: "scheduled",
    feedback: "pending",
    feedbackNotes: "",
  },
  {
    id: "int_04",
    candidateId: "cand_05",
    candidateName: cand("cand_05").name,
    jobTitle: cand("cand_05").jobTitle,
    jobCode: cand("cand_05").jobCode,
    round: "Initial Screening",
    type: "Case Study Interview",
    date: "2026-01-09",
    time: "15:30",
    durationMin: 45,
    location: "Boardroom",
    meetingLink: "",
    interviewer: "Sneha Kapoor",
    notes: "FP&A case on variance analysis.",
    status: "completed",
    feedback: "submitted",
    feedbackNotes: "Good analytical approach.",
  },
  {
    id: "int_05",
    candidateId: "cand_04",
    candidateName: cand("cand_04").name,
    jobTitle: cand("cand_04").jobTitle,
    jobCode: cand("cand_04").jobCode,
    round: "HR Interview",
    type: "In-Person Interview",
    date: "2026-01-14",
    time: "16:00",
    durationMin: 40,
    location: "Meeting Room 1",
    meetingLink: "",
    interviewer: "Priya Sharma",
    notes: "Offer discussion prep.",
    status: "scheduled",
    feedback: "pending",
    feedbackNotes: "",
  },
  {
    id: "int_06",
    candidateId: "cand_06",
    candidateName: cand("cand_06").name,
    jobTitle: cand("cand_06").jobTitle,
    jobCode: cand("cand_06").jobCode,
    round: "Technical Interview",
    type: "Practical Assessment",
    date: "2026-01-07",
    time: "09:00",
    durationMin: 90,
    location: "Online",
    meetingLink: "https://meet.example.com/divya-practical",
    interviewer: "Amit Khan",
    notes: "Agile planning exercise.",
    status: "completed",
    feedback: "submitted",
    feedbackNotes: "Solid facilitation skills.",
  },
];
