export type ReviewCycleFrequency = "monthly" | "quarterly" | "semi_annual" | "annual";
export type ReviewCycleStatus = "active" | "completed" | "draft";

/** Workdo demo: Name (+ description), Frequency, Status. */
export type ReviewCycle = {
  id: string;
  name: string;
  description: string;
  frequency: ReviewCycleFrequency;
  status: ReviewCycleStatus;
  startDate: string;
  endDate: string;
};

export const CYCLE_FREQUENCY_LABEL: Record<ReviewCycleFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-Annual",
  annual: "Annual",
};

export const CYCLE_STATUS_LABEL: Record<ReviewCycleStatus, string> = {
  active: "Active",
  completed: "Completed",
  draft: "Draft",
};

export const CYCLE_FREQUENCY_OPTIONS = (
  Object.keys(CYCLE_FREQUENCY_LABEL) as ReviewCycleFrequency[]
).map((k) => ({ value: k, label: CYCLE_FREQUENCY_LABEL[k] }));

export const CYCLE_STATUS_OPTIONS = (Object.keys(CYCLE_STATUS_LABEL) as ReviewCycleStatus[]).map(
  (k) => ({ value: k, label: CYCLE_STATUS_LABEL[k] }),
);

export function createReviewCycleId(existing: ReviewCycle[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `rcy_${String(max + 1).padStart(2, "0")}`;
}

/** Seed aligned to Workdo Review Cycles list. */
export const REVIEW_CYCLES_SEED: ReviewCycle[] = [
  {
    id: "rcy_01",
    name: "Monthly Performance Review",
    description: "Monthly review",
    frequency: "monthly",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  },
  {
    id: "rcy_02",
    name: "Quarterly Business Review",
    description:
      "Comprehensive quarterly assessment of employee performance, goal achievement, and development needs across all departments.",
    frequency: "quarterly",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  },
  {
    id: "rcy_03",
    name: "Mid-Year Performance Review",
    description: "Mid-year review",
    frequency: "semi_annual",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-06-30",
  },
  {
    id: "rcy_04",
    name: "Annual Performance Appraisal",
    description: "Annual appraisal",
    frequency: "annual",
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  },
];
