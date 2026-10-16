export type GoalTypeStatus = "active" | "inactive";
export type GoalTypeFrequency = "annual" | "quarterly" | "monthly";

/** Workdo demo: Name (+ description), Status. */
export type GoalType = {
  id: string;
  name: string;
  description: string;
  frequency: GoalTypeFrequency;
  status: GoalTypeStatus;
};

export const GOAL_TYPE_STATUS_LABEL: Record<GoalTypeStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const GOAL_TYPE_FREQUENCY_LABEL: Record<GoalTypeFrequency, string> = {
  annual: "Annual",
  quarterly: "Quarterly",
  monthly: "Monthly",
};

export const GOAL_TYPE_STATUS_OPTIONS = (
  Object.keys(GOAL_TYPE_STATUS_LABEL) as GoalTypeStatus[]
).map((k) => ({ value: k, label: GOAL_TYPE_STATUS_LABEL[k] }));

export const GOAL_TYPE_FREQUENCY_OPTIONS = (
  Object.keys(GOAL_TYPE_FREQUENCY_LABEL) as GoalTypeFrequency[]
).map((k) => ({ value: k, label: GOAL_TYPE_FREQUENCY_LABEL[k] }));

export function createGoalTypeId(existing: GoalType[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `gtp_${String(max + 1).padStart(2, "0")}`;
}

/** Seed aligned to Workdo Goal Types list. */
export const GOAL_TYPES_SEED: GoalType[] = [
  {
    id: "gtp_01",
    name: "Leadership Goals",
    description: "Leadership and management development",
    frequency: "annual",
    status: "active",
  },
  {
    id: "gtp_02",
    name: "Team Collaboration Goals",
    description:
      "Objectives aimed at improving teamwork, communication, cross-functional collaboration, and shared ownership of outcomes.",
    frequency: "quarterly",
    status: "active",
  },
  {
    id: "gtp_03",
    name: "Customer Service Goals",
    description: "Customer service improvement goals",
    frequency: "monthly",
    status: "active",
  },
  {
    id: "gtp_04",
    name: "Quality Improvement Goals",
    description:
      "Goals aimed at enhancing work quality, reducing errors, improving processes, and maintaining high standards.",
    frequency: "quarterly",
    status: "active",
  },
  {
    id: "gtp_05",
    name: "Project Goals",
    description: "Delivery milestones and project outcomes",
    frequency: "quarterly",
    status: "active",
  },
  {
    id: "gtp_06",
    name: "Sales and Revenue Goals",
    description: "Revenue, pipeline, and retention targets",
    frequency: "monthly",
    status: "active",
  },
];
