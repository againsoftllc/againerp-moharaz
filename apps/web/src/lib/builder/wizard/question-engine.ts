import type {
  WizardAnswers,
  WizardFlowState,
  WizardQuestion,
  WizardQuestionOption,
  WizardStepId,
} from "@/lib/builder/wizard/types";
import { DEFAULT_WIZARD_ANSWERS } from "@/lib/builder/wizard/types";

const PURPOSE_OPTIONS: WizardQuestionOption[] = [
  { value: "gaming", label: "Gaming", description: "Play modern games smoothly", icon: "gamepad" },
  { value: "workstation", label: "Work / Creative", description: "Video editing, 3D, CAD", icon: "briefcase" },
  { value: "streaming", label: "Streaming", description: "Game + stream at once", icon: "radio" },
  { value: "office", label: "Office", description: "Browsing, documents, light work", icon: "monitor" },
  { value: "general", label: "General use", description: "A bit of everything", icon: "puzzle" },
];

const BRAND_OPTIONS: WizardQuestionOption[] = [
  { value: "none", label: "No preference", description: "Best value for my budget" },
  { value: "intel", label: "Intel + NVIDIA", description: "Popular gaming combo" },
  { value: "amd", label: "AMD", description: "Strong multi-core value" },
  { value: "nvidia", label: "NVIDIA GPU focus", description: "Prioritize graphics" },
  { value: "mixed", label: "Best mix", description: "Let us pick optimal brands" },
];

const PERF_OPTIONS: WizardQuestionOption[] = [
  { value: "balanced", label: "Balanced", description: "Good all-round performance" },
  { value: "max_fps", label: "Maximum FPS", description: "Prioritize frame rates" },
  { value: "quiet", label: "Quiet & cool", description: "Lower noise and thermals" },
  { value: "value", label: "Best value", description: "Most performance per taka" },
  { value: "future_proof", label: "Future-proof", description: "Higher tier for longevity" },
];

const UPGRADE_OPTIONS: WizardQuestionOption[] = [
  { value: "new_build", label: "Brand new PC", description: "Building from scratch" },
  { value: "upgrading", label: "Upgrading existing", description: "Replace one or more parts" },
];

const UPGRADE_COMPONENT_OPTIONS: WizardQuestionOption[] = [
  { value: "cpu", label: "CPU", description: "Processor upgrade" },
  { value: "gpu", label: "GPU", description: "Graphics card upgrade" },
  { value: "ram", label: "RAM", description: "More memory" },
  { value: "ssd", label: "Storage", description: "Faster or larger SSD" },
  { value: "psu", label: "PSU", description: "Power supply upgrade" },
];

const ACCESSORY_OPTIONS: WizardQuestionOption[] = [
  { value: "monitor", label: "Monitor", description: "Display included" },
  { value: "keyboard", label: "Keyboard", description: "Mechanical or wireless" },
  { value: "mouse", label: "Mouse", description: "Gaming or ergonomic" },
  { value: "headset", label: "Headset", description: "Audio + mic" },
  { value: "none", label: "No accessories", description: "PC only" },
];

/** Conditional step visibility based on answers */
export function getVisibleSteps(answers: WizardAnswers): WizardStepId[] {
  const steps: WizardStepId[] = ["purpose", "budget"];

  if (answers.purpose !== "office") {
    steps.push("brand_preference", "performance_priority");
  } else if ((answers.budgetBdt ?? 0) >= 80000) {
    steps.push("brand_preference");
  }

  steps.push("upgrade_requirement");
  if (answers.upgradeRequirement === "upgrading") {
    steps.push("upgrade_component");
  }
  steps.push("accessories", "contact");
  return steps;
}

function isStepAnswered(step: WizardStepId, answers: WizardAnswers): boolean {
  switch (step) {
    case "purpose":
      return !!answers.purpose;
    case "budget":
      return answers.budgetBdt != null;
    case "brand_preference":
      return !!answers.brandPreference;
    case "performance_priority":
      return !!answers.performancePriority;
    case "upgrade_requirement":
      return !!answers.upgradeRequirement;
    case "upgrade_component":
      return !!answers.upgradeComponent;
    case "accessories":
    case "contact":
      return true;
    default:
      return false;
  }
}

function questionForStep(step: WizardStepId, idx: number, total: number): WizardQuestion {
  const base = { stepIndex: idx + 1, totalSteps: total };

  switch (step) {
    case "purpose":
      return { ...base, id: step, type: "single_choice", title: "What will you use this PC for?", subtitle: "We'll tailor components to your needs", required: true, options: PURPOSE_OPTIONS };
    case "budget":
      return { ...base, id: step, type: "budget_slider", title: "What's your budget?", subtitle: "Total in BDT — monitor included if selected later", required: true, options: [], minValue: 40000, maxValue: 500000 };
    case "brand_preference":
      return { ...base, id: step, type: "single_choice", title: "Any brand preference?", subtitle: "Optional — we'll optimize for value", required: false, options: BRAND_OPTIONS };
    case "performance_priority":
      return { ...base, id: step, type: "single_choice", title: "What matters most?", required: true, options: PERF_OPTIONS };
    case "upgrade_requirement":
      return { ...base, id: step, type: "single_choice", title: "New build or upgrade?", required: true, options: UPGRADE_OPTIONS };
    case "upgrade_component":
      return { ...base, id: step, type: "single_choice", title: "Which part are you upgrading?", required: true, options: UPGRADE_COMPONENT_OPTIONS };
    case "accessories":
      return { ...base, id: step, type: "multi_choice", title: "Need any accessories?", subtitle: "Select all that apply", required: false, options: ACCESSORY_OPTIONS };
    case "contact":
      return { ...base, id: step, type: "contact_form", title: "Almost done — stay in touch?", subtitle: "Optional — save your build & get a sales follow-up", required: false, options: [] };
    default:
      return { ...base, id: "complete", type: "single_choice", title: "Complete", required: true, options: [] };
  }
}

export function getWizardFlow(answers: WizardAnswers = DEFAULT_WIZARD_ANSWERS, currentStep?: WizardStepId): WizardFlowState {
  const visible = getVisibleSteps(answers);

  let step: WizardStepId = visible[0];
  if (currentStep === "complete") {
    step = "complete";
  } else if (currentStep && visible.includes(currentStep)) {
    step = currentStep;
  } else {
    for (const s of visible) {
      if (!isStepAnswered(s, answers)) {
        step = s;
        break;
      }
    }
    if (visible.every((s) => isStepAnswered(s, answers))) {
      step = "complete";
    }
  }

  const questions = visible.map((s, i) => questionForStep(s, i, visible.length));
  const idx = visible.indexOf(step);
  const progress = step === "complete" ? 100 : (Math.max(idx, 0) / visible.length) * 100;

  return { questions, answers, currentStep: step, progressPercent: Math.round(progress) };
}

export function getCurrentQuestion(flow: WizardFlowState): WizardQuestion | null {
  if (flow.currentStep === "complete") return null;
  return flow.questions.find((q) => q.id === flow.currentStep) ?? null;
}

export function nextWizardStep(answers: WizardAnswers, current: WizardStepId): WizardStepId {
  const visible = getVisibleSteps(answers);
  const idx = visible.indexOf(current);
  if (idx < 0 || idx >= visible.length - 1) return "complete";
  return visible[idx + 1];
}

export function prevWizardStep(answers: WizardAnswers, current: WizardStepId): WizardStepId {
  const visible = getVisibleSteps(answers);
  const idx = visible.indexOf(current);
  if (idx <= 0) return visible[0];
  return visible[idx - 1];
}

export function answersToPrompt(answers: WizardAnswers): string {
  const parts = [`Build a ${answers.purpose ?? "general"} PC`];
  if (answers.budgetBdt) parts.push(`under ${answers.budgetBdt} BDT`);
  if (answers.performancePriority === "max_fps") parts.push("maximum FPS");
  else if (answers.performancePriority === "quiet") parts.push("quiet and cool");
  else if (answers.performancePriority === "value") parts.push("best value");
  else if (answers.performancePriority === "future_proof") parts.push("high end future proof");
  if (answers.brandPreference === "intel") parts.push("Intel CPU NVIDIA GPU");
  else if (answers.brandPreference === "amd") parts.push("AMD platform");
  if (answers.upgradeRequirement === "upgrading" && answers.upgradeComponent) {
    parts.push(`upgrading ${answers.upgradeComponent}`);
  }
  const acc = answers.accessories.filter((a) => a !== "none");
  if (!acc.includes("monitor")) parts.push("no monitor");
  return parts.join(" ");
}
