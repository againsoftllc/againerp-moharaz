/** Workdo demo: Name+program, Type, Passing Score, Results. */

export type AssessmentType = "quiz" | "practical" | "presentation";

export type TrainingAssessment = {
  id: string;
  name: string;
  programName: string;
  assessmentType: AssessmentType;
  passingScore: number;
  results: number;
};

export const ASSESSMENT_TYPE_LABEL: Record<AssessmentType, string> = {
  quiz: "Quiz",
  practical: "Practical",
  presentation: "Presentation",
};

export const ASSESSMENT_TYPE_OPTIONS = (
  Object.keys(ASSESSMENT_TYPE_LABEL) as AssessmentType[]
).map((k) => ({ value: k, label: ASSESSMENT_TYPE_LABEL[k] }));

export const ASSESSMENT_PROGRAMS = [
  "Advanced Software Development",
  "Effective Business Communication",
  "Executive Leadership Program",
  "Database Management Certification",
  "Customer Service Excellence",
  "Department Integration Workshop",
] as const;

export const TRAINING_ASSESSMENTS_SEED: TrainingAssessment[] = [
  {
    id: "ta_1",
    name: "Coding Skills Assessment",
    programName: "Advanced Software Development",
    assessmentType: "practical",
    passingScore: 75,
    results: 3,
  },
  {
    id: "ta_2",
    name: "Communication Skills Test",
    programName: "Effective Business Communication",
    assessmentType: "quiz",
    passingScore: 75,
    results: 0,
  },
  {
    id: "ta_3",
    name: "SQL Query Challenge",
    programName: "Database Management Certification",
    assessmentType: "practical",
    passingScore: 80,
    results: 5,
  },
  {
    id: "ta_4",
    name: "Customer Empathy Quiz",
    programName: "Customer Service Excellence",
    assessmentType: "quiz",
    passingScore: 70,
    results: 12,
  },
  {
    id: "ta_5",
    name: "Onboarding Knowledge Check",
    programName: "Department Integration Workshop",
    assessmentType: "quiz",
    passingScore: 85,
    results: 0,
  },
  {
    id: "ta_6",
    name: "Leadership Case Study",
    programName: "Executive Leadership Program",
    assessmentType: "presentation",
    passingScore: 80,
    results: 3,
  },
  {
    id: "ta_7",
    name: "Architecture Design Review",
    programName: "Advanced Software Development",
    assessmentType: "presentation",
    passingScore: 95,
    results: 1,
  },
];

export function createTrainingAssessmentId(existing: TrainingAssessment[]): string {
  const n = existing.reduce((max, r) => {
    const m = /^ta_(\d+)$/.exec(r.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `ta_${n + 1}`;
}

export function formatPassingScore(score: number): string {
  return `${score.toFixed(2)}%`;
}
