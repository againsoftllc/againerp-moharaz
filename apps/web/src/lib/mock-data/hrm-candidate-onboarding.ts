import { CANDIDATES_SEED } from "@/lib/mock-data/hrm-candidates";

export type OnboardingStatus = "not_started" | "in_progress" | "completed" | "on_hold";

export type OnboardingTask = {
  id: string;
  title: string;
  category: string;
  dueDay: number;
  done: boolean;
};

export type CandidateOnboarding = {
  id: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  jobCode: string;
  checklistId: string;
  checklistName: string;
  startDate: string;
  expectedCompletion: string;
  buddyName: string;
  assignedTo: string;
  progress: number;
  status: OnboardingStatus;
  createdOn: string;
  notes: string;
  tasks: OnboardingTask[];
};

export const ONBOARDING_STATUS_LABEL: Record<OnboardingStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
};

export const ONBOARDING_STATUS_OPTIONS = (
  Object.keys(ONBOARDING_STATUS_LABEL) as OnboardingStatus[]
).map((k) => ({ value: k, label: ONBOARDING_STATUS_LABEL[k] }));

export const ONBOARDING_CHECKLISTS = [
  {
    id: "chk_standard",
    name: "Standard Onboarding",
    tasks: [
      { title: "Welcome email & portal access", category: "HR", dueDay: 1 },
      { title: "ID & bank documents collection", category: "HR", dueDay: 2 },
      { title: "IT laptop & accounts setup", category: "IT", dueDay: 3 },
      { title: "Policy acknowledgment", category: "Compliance", dueDay: 5 },
      { title: "Team introduction meeting", category: "Culture", dueDay: 7 },
    ],
  },
  {
    id: "chk_it",
    name: "IT Department Onboarding",
    tasks: [
      { title: "Dev environment setup", category: "IT", dueDay: 1 },
      { title: "Repo & VPN access", category: "IT", dueDay: 2 },
      { title: "Security training", category: "Compliance", dueDay: 3 },
      { title: "Buddy code review session", category: "Engineering", dueDay: 5 },
      { title: "First sprint assignment", category: "Engineering", dueDay: 10 },
    ],
  },
  {
    id: "chk_support",
    name: "Customer Support Onboarding",
    tasks: [
      { title: "CRM login & scripts", category: "Support", dueDay: 1 },
      { title: "Product knowledge quiz", category: "Training", dueDay: 3 },
      { title: "Shadow live tickets", category: "Support", dueDay: 5 },
      { title: "Soft-skills workshop", category: "Training", dueDay: 7 },
    ],
  },
] as const;

export const ONBOARDING_BUDDIES = [
  "Karim Ahmed",
  "Sadia Rahman",
  "Nusrat Jahan",
  "Rafiq Ahmed",
  "Priya Sharma",
] as const;

export const ONBOARDING_ASSIGNEES = [
  "Priya Sharma",
  "Orpha Nolan",
  "Ankit Verma",
  "Sneha Kapoor",
] as const;

export function createOnboardingId(existing: CandidateOnboarding[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `ob_${String(max + 1).padStart(2, "0")}`;
}

export function buildTasksFromChecklist(checklistId: string, doneCount = 0): OnboardingTask[] {
  const chk = ONBOARDING_CHECKLISTS.find((c) => c.id === checklistId) ?? ONBOARDING_CHECKLISTS[0]!;
  return chk.tasks.map((t, i) => ({
    id: `task_${checklistId}_${i + 1}`,
    title: t.title,
    category: t.category,
    dueDay: t.dueDay,
    done: i < doneCount,
  }));
}

export function calcProgress(tasks: OnboardingTask[]) {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.done).length;
  return Math.round((done / tasks.length) * 100);
}

export function statusFromProgress(progress: number, current?: OnboardingStatus): OnboardingStatus {
  if (current === "on_hold") return "on_hold";
  if (progress <= 0) return "not_started";
  if (progress >= 100) return "completed";
  return "in_progress";
}

function cand(id: string) {
  return CANDIDATES_SEED.find((c) => c.id === id) ?? CANDIDATES_SEED[0]!;
}

/** Hired / offer-stage candidates for onboarding dropdown. */
export function hiredCandidatesForOnboarding() {
  return CANDIDATES_SEED.filter((c) => c.status === "hired" || c.status === "offer");
}

/** Workdo-style candidate onboarding runs. */
export const CANDIDATE_ONBOARDING_SEED: CandidateOnboarding[] = [
  (() => {
    const c = cand("cand_01");
    const tasks = buildTasksFromChecklist("chk_it", 2);
    const progress = calcProgress(tasks);
    return {
      id: "ob_01",
      candidateId: c.id,
      candidateName: c.name,
      jobTitle: c.jobTitle,
      jobCode: c.jobCode,
      checklistId: "chk_it",
      checklistName: "IT Department Onboarding",
      startDate: "2026-01-15",
      expectedCompletion: "2026-01-30",
      buddyName: "Karim Ahmed",
      assignedTo: "Priya Sharma",
      progress,
      status: statusFromProgress(progress),
      createdOn: "2026-01-10",
      notes: "Priority hire — laptop already requested.",
      tasks,
    } satisfies CandidateOnboarding;
  })(),
  (() => {
    const c = cand("cand_04");
    const tasks = buildTasksFromChecklist("chk_support", 1);
    const progress = calcProgress(tasks);
    return {
      id: "ob_02",
      candidateId: c.id,
      candidateName: c.name,
      jobTitle: c.jobTitle,
      jobCode: c.jobCode,
      checklistId: "chk_support",
      checklistName: "Customer Support Onboarding",
      startDate: "2026-02-01",
      expectedCompletion: "2026-02-14",
      buddyName: "Sadia Rahman",
      assignedTo: "Ankit Verma",
      progress,
      status: statusFromProgress(progress),
      createdOn: "2026-01-20",
      notes: "",
      tasks,
    } satisfies CandidateOnboarding;
  })(),
  (() => {
    const c = cand("cand_06");
    const tasks = buildTasksFromChecklist("chk_standard", 5);
    const progress = calcProgress(tasks);
    return {
      id: "ob_03",
      candidateId: c.id,
      candidateName: c.name,
      jobTitle: c.jobTitle,
      jobCode: c.jobCode,
      checklistId: "chk_standard",
      checklistName: "Standard Onboarding",
      startDate: "2026-01-05",
      expectedCompletion: "2026-01-20",
      buddyName: "Nusrat Jahan",
      assignedTo: "Orpha Nolan",
      progress,
      status: statusFromProgress(progress),
      createdOn: "2026-01-02",
      notes: "All checklist items completed.",
      tasks,
    } satisfies CandidateOnboarding;
  })(),
  (() => {
    const c = cand("cand_02");
    const tasks = buildTasksFromChecklist("chk_standard", 0);
    return {
      id: "ob_04",
      candidateId: c.id,
      candidateName: c.name,
      jobTitle: c.jobTitle,
      jobCode: c.jobCode,
      checklistId: "chk_standard",
      checklistName: "Standard Onboarding",
      startDate: "2026-03-01",
      expectedCompletion: "2026-03-15",
      buddyName: "Rafiq Ahmed",
      assignedTo: "Sneha Kapoor",
      progress: 0,
      status: "not_started" as const,
      createdOn: "2026-01-22",
      notes: "Waiting for start date.",
      tasks,
    } satisfies CandidateOnboarding;
  })(),
];
