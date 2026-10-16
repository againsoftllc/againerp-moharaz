export type IndicatorStatus = "active" | "inactive";
export type MeasurementUnit = "rating" | "percentage" | "hours" | "count" | "currency";

/** Workdo demo: Name, Category, Measurement Unit, Target Value, Status, Created At. */
export type Indicator = {
  id: string;
  name: string;
  category: string;
  measurementUnit: MeasurementUnit;
  targetValue: string;
  status: IndicatorStatus;
  createdAt: string;
  description: string;
};

export const INDICATOR_STATUS_LABEL: Record<IndicatorStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const MEASUREMENT_UNIT_LABEL: Record<MeasurementUnit, string> = {
  rating: "Rating",
  percentage: "Percentage",
  hours: "Hours",
  count: "Count",
  currency: "Currency",
};

export const INDICATOR_STATUS_OPTIONS = (
  Object.keys(INDICATOR_STATUS_LABEL) as IndicatorStatus[]
).map((k) => ({ value: k, label: INDICATOR_STATUS_LABEL[k] }));

export const MEASUREMENT_UNIT_OPTIONS = (
  Object.keys(MEASUREMENT_UNIT_LABEL) as MeasurementUnit[]
).map((k) => ({ value: k, label: MEASUREMENT_UNIT_LABEL[k] }));

export const INDICATOR_CATEGORIES = [
  "Technical Competency",
  "Adaptability and Flexibility",
  "Time Management",
  "Customer Service",
  "Leadership",
  "Communication",
] as const;

export function createIndicatorId(existing: Indicator[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `ind_${String(max + 1).padStart(2, "0")}`;
}

/** Seed aligned to Workdo Indicators list. */
export const INDICATORS_SEED: Indicator[] = [
  {
    id: "ind_01",
    name: "Skill Proficiency",
    category: "Technical Competency",
    measurementUnit: "rating",
    targetValue: "4/5",
    status: "active",
    createdAt: "2025-09-19",
    description: "Technical skill level on assigned stack.",
  },
  {
    id: "ind_02",
    name: "Learning Agility",
    category: "Adaptability and Flexibility",
    measurementUnit: "rating",
    targetValue: "4/5",
    status: "active",
    createdAt: "2025-09-19",
    description: "Ability to learn and apply new tools quickly.",
  },
  {
    id: "ind_03",
    name: "Stress Management",
    category: "Adaptability and Flexibility",
    measurementUnit: "rating",
    targetValue: "3/5",
    status: "active",
    createdAt: "2025-09-19",
    description: "Composure under deadline pressure.",
  },
  {
    id: "ind_04",
    name: "Deadline Adherence",
    category: "Time Management",
    measurementUnit: "percentage",
    targetValue: "95%",
    status: "active",
    createdAt: "2025-09-19",
    description: "On-time delivery rate for assigned work.",
  },
  {
    id: "ind_05",
    name: "Priority Management",
    category: "Time Management",
    measurementUnit: "rating",
    targetValue: "4/5",
    status: "active",
    createdAt: "2025-09-19",
    description: "Effective prioritization of tasks.",
  },
  {
    id: "ind_06",
    name: "Efficiency Rating",
    category: "Time Management",
    measurementUnit: "rating",
    targetValue: "4/5",
    status: "active",
    createdAt: "2025-09-19",
    description: "Output quality relative to effort.",
  },
  {
    id: "ind_07",
    name: "Customer Satisfaction",
    category: "Customer Service",
    measurementUnit: "rating",
    targetValue: "4.5/5",
    status: "active",
    createdAt: "2025-09-19",
    description: "Average CSAT from closed tickets.",
  },
  {
    id: "ind_08",
    name: "Response Time",
    category: "Customer Service",
    measurementUnit: "hours",
    targetValue: "<24",
    status: "active",
    createdAt: "2025-09-19",
    description: "First response SLA for support queues.",
  },
];
