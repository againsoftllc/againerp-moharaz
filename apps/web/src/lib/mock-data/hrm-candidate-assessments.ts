import { CANDIDATES_SEED } from "@/lib/mock-data/hrm-candidates";

export type AssessmentType = "technical" | "behavioral" | "aptitude" | "personality";
export type AssessmentStatus = "scheduled" | "completed" | "cancelled";

export type CandidateAssessment = {
  id: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  jobCode: string;
  title: string;
  assessmentType: AssessmentType;
  assessmentDate: string;
  score: number;
  maxScore: number;
  durationMin: number;
  conductedBy: string;
  notes: string;
  status: AssessmentStatus;
};

export const ASSESSMENT_TYPE_LABEL: Record<AssessmentType, string> = {
  technical: "Technical",
  behavioral: "Behavioral",
  aptitude: "Aptitude",
  personality: "Personality",
};

export const ASSESSMENT_STATUS_LABEL: Record<AssessmentStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ASSESSMENT_TYPE_OPTIONS = (
  Object.keys(ASSESSMENT_TYPE_LABEL) as AssessmentType[]
).map((k) => ({ value: k, label: ASSESSMENT_TYPE_LABEL[k] }));

export const ASSESSMENT_STATUS_OPTIONS = (
  Object.keys(ASSESSMENT_STATUS_LABEL) as AssessmentStatus[]
).map((k) => ({ value: k, label: ASSESSMENT_STATUS_LABEL[k] }));

export const ASSESSMENT_CONDUCTORS = [
  "Orpha Nolan",
  "Priya Sharma",
  "Rahul Mehta",
  "Ankit Verma",
  "Sneha Kapoor",
] as const;

export function createAssessmentId(existing: CandidateAssessment[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `asm_${String(max + 1).padStart(2, "0")}`;
}

export function formatScore(score: number, maxScore: number) {
  if (maxScore <= 0) return String(score);
  return `${score}/${maxScore}`;
}

function cand(id: string) {
  return CANDIDATES_SEED.find((c) => c.id === id) ?? CANDIDATES_SEED[0]!;
}

/** Workdo-style candidate assessments. */
export const CANDIDATE_ASSESSMENTS_SEED: CandidateAssessment[] = [
  {
    id: "asm_01",
    candidateId: "cand_02",
    candidateName: cand("cand_02").name,
    jobTitle: cand("cand_02").jobTitle,
    jobCode: cand("cand_02").jobCode,
    title: "Content Writing Sample",
    assessmentType: "technical",
    assessmentDate: "2026-01-05",
    score: 78,
    maxScore: 100,
    durationMin: 60,
    conductedBy: "Orpha Nolan",
    notes: "Strong narrative voice; SEO keywords need polish.",
    status: "completed",
  },
  {
    id: "asm_02",
    candidateId: "cand_01",
    candidateName: cand("cand_01").name,
    jobTitle: cand("cand_01").jobTitle,
    jobCode: cand("cand_01").jobCode,
    title: "System Design Challenge",
    assessmentType: "technical",
    assessmentDate: "2026-01-11",
    score: 88,
    maxScore: 100,
    durationMin: 90,
    conductedBy: "Rahul Mehta",
    notes: "Excellent trade-off discussion; diagram clarity high.",
    status: "completed",
  },
  {
    id: "asm_03",
    candidateId: "cand_03",
    candidateName: cand("cand_03").name,
    jobTitle: cand("cand_03").jobTitle,
    jobCode: cand("cand_03").jobCode,
    title: "Networking Aptitude Test",
    assessmentType: "aptitude",
    assessmentDate: "2026-01-12",
    score: 0,
    maxScore: 50,
    durationMin: 45,
    conductedBy: "Ankit Verma",
    notes: "",
    status: "scheduled",
  },
  {
    id: "asm_04",
    candidateId: "cand_05",
    candidateName: cand("cand_05").name,
    jobTitle: cand("cand_05").jobTitle,
    jobCode: cand("cand_05").jobCode,
    title: "Behavioral Case Study",
    assessmentType: "behavioral",
    assessmentDate: "2026-01-08",
    score: 34,
    maxScore: 40,
    durationMin: 40,
    conductedBy: "Sneha Kapoor",
    notes: "Collaborative under pressure; good stakeholder framing.",
    status: "completed",
  },
  {
    id: "asm_05",
    candidateId: "cand_06",
    candidateName: cand("cand_06").name,
    jobTitle: cand("cand_06").jobTitle,
    jobCode: cand("cand_06").jobCode,
    title: "Personality Profile",
    assessmentType: "personality",
    assessmentDate: "2026-01-06",
    score: 0,
    maxScore: 100,
    durationMin: 30,
    conductedBy: "Priya Sharma",
    notes: "Cancelled — candidate rescheduled interview week.",
    status: "cancelled",
  },
  {
    id: "asm_06",
    candidateId: "cand_04",
    candidateName: cand("cand_04").name,
    jobTitle: cand("cand_04").jobTitle,
    jobCode: cand("cand_04").jobCode,
    title: "Customer Scenario Role-play",
    assessmentType: "behavioral",
    assessmentDate: "2026-01-14",
    score: 0,
    maxScore: 20,
    durationMin: 30,
    conductedBy: "Orpha Nolan",
    notes: "",
    status: "scheduled",
  },
];
