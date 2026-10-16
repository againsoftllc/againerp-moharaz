/** Guided PC Builder wizard types */

import type { AiAlternativeSuggestion, AiPcBuildResult, AiUpgradeSuggestion, PcBuildPurpose } from "@/lib/builder/ai/types";
import type { PcBuilderStepId } from "@/lib/builder/types";

export type BuilderMode = "manual" | "wizard" | "ai_chat";

export type WizardStepId =
  | "purpose"
  | "budget"
  | "brand_preference"
  | "performance_priority"
  | "upgrade_requirement"
  | "upgrade_component"
  | "accessories"
  | "contact"
  | "complete";

export type WizardQuestionType = "single_choice" | "multi_choice" | "budget_slider" | "contact_form";

export type WizardQuestionOption = {
  value: string;
  label: string;
  description?: string;
  icon?: string;
};

export type WizardQuestion = {
  id: WizardStepId;
  type: WizardQuestionType;
  title: string;
  subtitle?: string;
  required: boolean;
  options: WizardQuestionOption[];
  minValue?: number;
  maxValue?: number;
  stepIndex: number;
  totalSteps: number;
};

export type WizardAnswers = {
  purpose?: PcBuildPurpose;
  budgetBdt?: number;
  brandPreference?: "none" | "intel" | "amd" | "nvidia" | "mixed";
  performancePriority?: "balanced" | "max_fps" | "quiet" | "value" | "future_proof";
  upgradeRequirement?: "new_build" | "upgrading";
  upgradeComponent?: PcBuilderStepId;
  accessories: string[];
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
};

export type WizardSession = {
  id: string;
  sessionCode: string;
  mode: BuilderMode;
  currentStep: WizardStepId;
  answers: WizardAnswers;
  recommendation: AiPcBuildResult | null;
  buildId: string | null;
  leadId: string | null;
  leadNumber: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type WizardFlowState = {
  questions: WizardQuestion[];
  answers: WizardAnswers;
  currentStep: WizardStepId;
  progressPercent: number;
};

export type WizardRecommendationResult = AiPcBuildResult & {
  alternatives: AiAlternativeSuggestion[];
  upgrades: AiUpgradeSuggestion[];
};

export const BUILDER_MODE_LABELS: Record<BuilderMode, string> = {
  manual: "Manual Builder",
  wizard: "Wizard Builder",
  ai_chat: "AI Consultant",
};

export const BUILDER_MODE_DESCRIPTIONS: Record<BuilderMode, string> = {
  manual: "প্রতিটি part নিজে বেছে নিন — filter, multi SSD/RAM, live compatibility",
  wizard: "কয়েকটি প্রশ্নের উত্তর দিন — budget অনুযায়ী full build",
  ai_chat: "একই chat drawer — PC build, budget, compatibility সব এক জায়গায়",
};

export const DEFAULT_WIZARD_ANSWERS: WizardAnswers = {
  accessories: [],
};

export const BUDGET_PRESETS = [
  { value: 60000, label: "৳60,000", sub: "Entry" },
  { value: 100000, label: "৳1,00,000", sub: "Mid-range" },
  { value: 150000, label: "৳1,50,000", sub: "Performance" },
  { value: 200000, label: "৳2,00,000", sub: "High-end" },
  { value: 300000, label: "৳3,00,000+", sub: "Enthusiast" },
];
