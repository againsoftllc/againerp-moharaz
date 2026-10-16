/** Smart Recommendation Engine types */

import type { PcBuilderStepId } from "@/lib/builder/types";

export const RECOMMENDATION_KINDS = [
  "related_component",
  "better_performance",
  "better_value",
  "psu_wattage",
  "cooling",
  "upgrade_path",
  "budget_optimization",
] as const;

export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

export type SmartRecommendation = {
  id: string;
  kind: RecommendationKind;
  priority: number;
  title: string;
  description: string;
  stepId?: PcBuilderStepId | "cooler";
  productId?: string;
  productName?: string;
  price?: number;
  priceDelta?: number;
  action: "add" | "swap" | "info";
  metadata?: Record<string, string | number | boolean>;
};

export type PsuRecommendation = {
  estimatedDrawW: number;
  recommendedMinW: number;
  recommendedIdealW: number;
  headroomPercent: number;
  currentPsuW: number | null;
  adequate: boolean;
  message: string;
  suggestedProductIds: string[];
};

export type CoolingRecommendation = {
  cpuTdp: number;
  needsAftermarket: boolean;
  tier: "stock_ok" | "tower_recommended" | "aio_recommended";
  message: string;
  suggestedProductIds: string[];
};

export type UpgradePathStep = {
  order: number;
  stepId: PcBuilderStepId | "cooler";
  fromProductId: string;
  toProductId: string;
  toProductName: string;
  priceDelta: number;
  impact: string;
  cumulativeDelta: number;
};

export type BudgetOptimization = {
  currentTotal: number;
  budgetCap: number | null;
  remaining: number | null;
  overBudget: boolean;
  suggestions: {
    stepId: PcBuilderStepId;
    swapToProductId: string;
    swapToProductName: string;
    savings: number;
    tradeoff: string;
  }[];
  spendRemainingIdeas: {
    stepId: PcBuilderStepId;
    productId: string;
    productName: string;
    cost: number;
    benefit: string;
  }[];
};

export type SmartRecommendationResult = {
  recommendations: SmartRecommendation[];
  psu: PsuRecommendation | null;
  cooling: CoolingRecommendation | null;
  upgradePath: UpgradePathStep[];
  budget: BudgetOptimization | null;
  generatedAt: string;
};

export const KIND_LABELS: Record<RecommendationKind, string> = {
  related_component: "Related components",
  better_performance: "Better performance",
  better_value: "Better value",
  psu_wattage: "PSU sizing",
  cooling: "Cooling",
  upgrade_path: "Upgrade path",
  budget_optimization: "Budget optimization",
};
