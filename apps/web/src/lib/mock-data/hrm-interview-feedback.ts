import { CANDIDATES_SEED } from "@/lib/mock-data/hrm-candidates";
import { INTERVIEW_ROUNDS, INTERVIEWS_SEED } from "@/lib/mock-data/hrm-interviews";

export type FeedbackRecommendation =
  | "strong_hire"
  | "hire"
  | "maybe"
  | "no_hire"
  | "strong_reject";

export type InterviewFeedbackRow = {
  id: string;
  interviewId: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  jobCode: string;
  round: string;
  interviewer: string;
  overallRating: number;
  technicalSkills: number;
  communication: number;
  culturalFit: number;
  recommendation: FeedbackRecommendation;
  comments: string;
  nextSteps: string;
  submittedOn: string;
};

export const FEEDBACK_RECOMMENDATION_LABEL: Record<FeedbackRecommendation, string> = {
  strong_hire: "Strong Hire",
  hire: "Hire",
  maybe: "Maybe",
  no_hire: "No Hire",
  strong_reject: "Strong Reject",
};

export const FEEDBACK_RECOMMENDATION_OPTIONS = (
  Object.keys(FEEDBACK_RECOMMENDATION_LABEL) as FeedbackRecommendation[]
).map((k) => ({ value: k, label: FEEDBACK_RECOMMENDATION_LABEL[k] }));

export const FEEDBACK_INTERVIEWERS = [
  "Orpha Nolan",
  "Priya Sharma",
  "Rahul Mehta",
  "Ankit Verma",
  "Sneha Kapoor",
  "Manager",
] as const;

export function createFeedbackId(existing: InterviewFeedbackRow[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `fb_${String(max + 1).padStart(2, "0")}`;
}

function cand(id: string) {
  return CANDIDATES_SEED.find((c) => c.id === id) ?? CANDIDATES_SEED[0]!;
}

function intv(id: string) {
  return INTERVIEWS_SEED.find((i) => i.id === id);
}

/** Workdo-style demo interview feedback (rating out of 5). */
export const INTERVIEW_FEEDBACK_SEED: InterviewFeedbackRow[] = [
  {
    id: "fb_01",
    interviewId: "int_01",
    candidateId: "cand_02",
    candidateName: cand("cand_02").name,
    jobTitle: cand("cand_02").jobTitle,
    jobCode: cand("cand_02").jobCode,
    round: intv("int_01")?.round ?? INTERVIEW_ROUNDS[3],
    interviewer: "Orpha Nolan",
    overallRating: 3,
    technicalSkills: 3,
    communication: 4,
    culturalFit: 3,
    recommendation: "maybe",
    comments: "Solid writing samples; needs stronger SEO depth for senior briefs.",
    nextSteps: "Second writing assignment on product landing pages.",
    submittedOn: "2026-01-08",
  },
  {
    id: "fb_02",
    interviewId: "int_06",
    candidateId: "cand_06",
    candidateName: cand("cand_06").name,
    jobTitle: cand("cand_06").jobTitle,
    jobCode: cand("cand_06").jobCode,
    round: intv("int_06")?.round ?? "Technical Interview",
    interviewer: "Priya Sharma",
    overallRating: 4,
    technicalSkills: 4,
    communication: 4,
    culturalFit: 5,
    recommendation: "hire",
    comments: "Clear facilitation; handled stakeholder conflict scenario well.",
    nextSteps: "Proceed to HR round.",
    submittedOn: "2026-01-07",
  },
  {
    id: "fb_03",
    interviewId: "int_01",
    candidateId: "cand_02",
    candidateName: cand("cand_02").name,
    jobTitle: cand("cand_02").jobTitle,
    jobCode: cand("cand_02").jobCode,
    round: "Initial Screening",
    interviewer: "Orpha Nolan",
    overallRating: 5,
    technicalSkills: 5,
    communication: 5,
    culturalFit: 5,
    recommendation: "strong_hire",
    comments: "Excellent first impression; portfolio exceeds expectations.",
    nextSteps: "Schedule final interview.",
    submittedOn: "2025-12-30",
  },
  {
    id: "fb_04",
    interviewId: "int_04",
    candidateId: "cand_05",
    candidateName: cand("cand_05").name,
    jobTitle: cand("cand_05").jobTitle,
    jobCode: cand("cand_05").jobCode,
    round: intv("int_04")?.round ?? "Initial Screening",
    interviewer: "Sneha Kapoor",
    overallRating: 4,
    technicalSkills: 4,
    communication: 3,
    culturalFit: 4,
    recommendation: "hire",
    comments: "Strong variance analysis case; junior-level Excel fluency.",
    nextSteps: "Offer internship track.",
    submittedOn: "2026-01-09",
  },
  {
    id: "fb_05",
    interviewId: "",
    candidateId: "cand_extra_anjali",
    candidateName: "Anjali Saxena",
    jobTitle: "Quality Assurance Engineer",
    jobCode: "JOB-1-00008",
    round: "Technical Interview",
    interviewer: "Orpha Nolan",
    overallRating: 1,
    technicalSkills: 1,
    communication: 2,
    culturalFit: 1,
    recommendation: "strong_reject",
    comments: "Could not complete basic test-case design exercise.",
    nextSteps: "Close application.",
    submittedOn: "2026-01-05",
  },
  {
    id: "fb_06",
    interviewId: "int_03",
    candidateId: "cand_01",
    candidateName: cand("cand_01").name,
    jobTitle: cand("cand_01").jobTitle,
    jobCode: cand("cand_01").jobCode,
    round: intv("int_03")?.round ?? "Technical Interview",
    interviewer: "Rahul Mehta",
    overallRating: 4,
    technicalSkills: 5,
    communication: 3,
    culturalFit: 4,
    recommendation: "strong_hire",
    comments: "Strong system design; communication can be more concise.",
    nextSteps: "Move to offer discussion.",
    submittedOn: "2026-01-12",
  },
];
