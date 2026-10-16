import type { AiPcBuildResult, PcBuildPurpose } from "@/lib/builder/ai/types";
import type { PcBuilderSelection } from "@/lib/builder/types";
import { filterCompatibleProducts } from "@/lib/builder/compatibility-filter";
import { getPcProductsByStep } from "@/lib/mock-data/pc-builder-products";
import { compatibilityRulesSeed } from "@/lib/mock-data/compatibility-rules";

const CORE_STEPS = ["cpu", "motherboard", "ram", "ssd", "gpu", "psu", "case"] as const;

function parsePurpose(prompt: string): PcBuildPurpose {
  const lower = prompt.toLowerCase();
  if (lower.includes("gaming") || lower.includes("game")) return "gaming";
  if (lower.includes("workstation") || lower.includes("edit")) return "workstation";
  if (lower.includes("stream")) return "streaming";
  if (lower.includes("office")) return "office";
  if (lower.includes("student")) return "student";
  return "general";
}

function parseBudget(prompt: string): number | undefined {
  const match = prompt.match(/(\d[\d,]*)\s*(?:bdt|tk|৳)?/i);
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

function pickCheapestCompatible(stepId: (typeof CORE_STEPS)[number], selections: PcBuilderSelection[]) {
  const products = getPcProductsByStep(stepId);
  const { compatible } = filterCompatibleProducts(products, selections, compatibilityRulesSeed);
  return compatible.find((p) => p.stockStatus !== "Out of Stock") ?? compatible[0] ?? null;
}

/** Rule-based PC build planner (no external AI). */
export function planPcBuild(prompt: string): AiPcBuildResult {
  const purpose = parsePurpose(prompt);
  const budgetBdt = parseBudget(prompt);
  const selections: PcBuilderSelection[] = [];

  for (const stepId of CORE_STEPS) {
    const product = pickCheapestCompatible(stepId, selections);
    if (!product) continue;
    selections.push({
      selectionId: `${stepId}-${product.id}`,
      stepId,
      productId: product.id,
      productName: product.name,
      price: product.price,
      image: product.image,
      attributes: product.attributes,
      attributeProfileId: product.attributeProfileId,
    });
  }

  const totalPrice = selections.reduce((sum, row) => sum + row.price, 0);

  return {
    selections,
    totalPrice,
    compatibilityStatus: "compatible",
    compatibilityMessages: [],
    confidence: 0.75,
    explanation: `Recommended ${PURPOSE_LABELS[purpose].toLowerCase()} build based on compatible parts in catalog.`,
    intent: { purpose, budgetBdt },
    alternatives: [],
    upgrades: [],
  };
}

const PURPOSE_LABELS = {
  gaming: "Gaming",
  workstation: "Workstation",
  streaming: "Streaming",
  office: "Office",
  student: "Student",
  general: "General use",
} as const;
