import type { PcBuilderSelection, PcBuilderStepId } from "@/lib/builder/types";

export type PcBuildPurpose =
  | "gaming"
  | "workstation"
  | "streaming"
  | "office"
  | "student"
  | "general";

export const PURPOSE_LABELS: Record<PcBuildPurpose, string> = {
  gaming: "Gaming",
  workstation: "Workstation",
  streaming: "Streaming",
  office: "Office",
  student: "Student",
  general: "General use",
};

export type AiPcBuildResult = {
  selections: PcBuilderSelection[];
  totalPrice: number;
  compatibilityStatus: "compatible" | "warning" | "incompatible";
  compatibilityMessages: string[];
  confidence: number;
  explanation: string;
  intent: {
    purpose: PcBuildPurpose;
    budgetBdt?: number;
  };
  alternatives: AiAlternativeSuggestion[];
  upgrades: AiUpgradeSuggestion[];
};

export type AiAlternativeSuggestion = {
  stepId: PcBuilderStepId;
  productId: string;
  productName: string;
  price: number;
  reason: string;
};

export type AiUpgradeSuggestion = {
  stepId: PcBuilderStepId;
  upgradeProductId: string;
  upgradeProductName: string;
  priceDelta: number;
  benefit: string;
};
