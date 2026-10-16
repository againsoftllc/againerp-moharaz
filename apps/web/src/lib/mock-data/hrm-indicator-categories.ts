export type IndicatorCategoryStatus = "active" | "inactive";

/** Workdo demo: Name, Status, Created At. */
export type IndicatorCategory = {
  id: string;
  name: string;
  description: string;
  weight: number;
  status: IndicatorCategoryStatus;
  createdAt: string;
};

export const INDICATOR_CATEGORY_STATUS_LABEL: Record<IndicatorCategoryStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const INDICATOR_CATEGORY_STATUS_OPTIONS = (
  Object.keys(INDICATOR_CATEGORY_STATUS_LABEL) as IndicatorCategoryStatus[]
).map((k) => ({ value: k, label: INDICATOR_CATEGORY_STATUS_LABEL[k] }));

export function createIndicatorCategoryId(existing: IndicatorCategory[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `icg_${String(max + 1).padStart(2, "0")}`;
}

/** Seed aligned to Workdo Indicator Categories list. */
export const INDICATOR_CATEGORIES_SEED: IndicatorCategory[] = [
  {
    id: "icg_01",
    name: "Job Performance",
    description: "Core role delivery and output quality.",
    weight: 20,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "icg_02",
    name: "Quality of Work",
    description: "Accuracy, standards, and rework rate.",
    weight: 15,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "icg_03",
    name: "Communication Skills",
    description: "Written and verbal communication clarity.",
    weight: 10,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "icg_04",
    name: "Teamwork and Collaboration",
    description: "Cross-team cooperation and support.",
    weight: 10,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "icg_05",
    name: "Leadership and Initiative",
    description: "Ownership, mentoring, and initiative.",
    weight: 10,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "icg_06",
    name: "Problem Solving",
    description: "Analytical thinking and issue resolution.",
    weight: 10,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "icg_07",
    name: "Adaptability and Flexibility",
    description: "Response to change and learning agility.",
    weight: 10,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "icg_08",
    name: "Time Management",
    description: "Deadline adherence and prioritization.",
    weight: 10,
    status: "active",
    createdAt: "2025-09-19",
  },
  {
    id: "icg_09",
    name: "Customer Service",
    description: "Customer satisfaction and response quality.",
    weight: 5,
    status: "active",
    createdAt: "2025-09-19",
  },
];
