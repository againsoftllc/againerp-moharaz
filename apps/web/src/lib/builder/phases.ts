import { PC_BUILDER_STEPS, type PcBuilderSelection, type PcBuilderStepId } from "@/lib/builder/types";

/** Top-level builder tabs — inspired by Wootware, grouped for clarity */
export const PC_BUILDER_PHASES = [
  {
    id: "overview",
    label: "Overview",
    labelBn: "সারাংশ",
    hint: "Progress, tips & quick actions",
  },
  {
    id: "components",
    label: "Components",
    labelBn: "কম্পোনেন্ট",
    hint: "CPU, GPU, RAM — compatibility checked",
  },
  {
    id: "extras",
    label: "Extras",
    labelBn: "অতিরিক্ত",
    hint: "OS, fans, WiFi, accessories",
  },
  {
    id: "peripherals",
    label: "Peripherals",
    labelBn: "পেরিফেরাল",
    hint: "Monitor, mouse, keyboard & desk setup",
  },
] as const;

export type PcBuilderPhaseId = (typeof PC_BUILDER_PHASES)[number]["id"];

/** Professional assembly — Wootware-style service line, not a product slot */
export const PC_BUILDER_ASSEMBLY_SERVICE = {
  id: "assembly",
  label: "Professional assembly",
  labelBn: "প্রফেশনাল অ্যাসেম্বলি",
  description: "Cable management, BIOS setup, stress test",
  price: 3500,
} as const;

export function getPhaseForStep(stepId: PcBuilderStepId): PcBuilderPhaseId {
  return PC_BUILDER_STEPS.find((s) => s.id === stepId)?.phase ?? "components";
}

export function getStepsForPhase(phaseId: PcBuilderPhaseId) {
  if (phaseId === "overview") return [];
  return PC_BUILDER_STEPS.filter((s) => s.phase === phaseId);
}

export function isCompatibilityPhase(phaseId: PcBuilderPhaseId): boolean {
  return phaseId === "components";
}

export function phaseSelectionCount(phaseId: PcBuilderPhaseId, selections: PcBuilderSelection[]): number {
  const stepIds = new Set(getStepsForPhase(phaseId).map((s) => s.id));
  return selections.filter((s) => stepIds.has(s.stepId)).length;
}

export function phaseFilledCount(phaseId: PcBuilderPhaseId, getSelectionsForStep: (id: PcBuilderStepId) => PcBuilderSelection[]) {
  const steps = getStepsForPhase(phaseId);
  return steps.filter((s) => getSelectionsForStep(s.id).length > 0).length;
}
