import type { PcBuilderSelection, PcBuilderStepId } from "@/lib/builder/types";
import { PC_BUILDER_STEPS } from "@/lib/builder/types";
import { filterCompatibleProducts } from "@/lib/builder/compatibility-filter";
import { recommendCooling } from "@/lib/builder/recommendations/cooling-calculator";
import { recommendPsu, calculateSystemDrawW } from "@/lib/builder/recommendations/psu-calculator";
import type {
  BudgetOptimization,
  SmartRecommendation,
  SmartRecommendationResult,
  UpgradePathStep,
} from "@/lib/builder/recommendations/types";
import { getCoolerById, coolerProductsSeed } from "@/lib/mock-data/pc-builder-coolers";
import {
  getPcProductById,
  getPcProductsByStep,
} from "@/lib/mock-data/pc-builder-products";
import { compatibilityRulesSeed } from "@/lib/mock-data/compatibility-rules";
import { formatCurrency } from "@/lib/utils";

type EngineOptions = {
  budgetBdt?: number | null;
  purpose?: "gaming" | "workstation" | "general";
};

function perfScore(sel: PcBuilderSelection, product: { attributes: Record<string, unknown>; price: number }): number {
  const step = sel.stepId;
  if (step === "cpu") return Number(product.attributes.core_count ?? 0) * 100 - product.price / 50;
  if (step === "gpu") return Number(product.attributes.vram ?? 0) * 200 - product.price / 100;
  if (step === "ram") return Number(product.attributes.capacity ?? 0) * 10 + Number(product.attributes.speed ?? 0) / 100;
  if (step === "ssd") return Number(product.attributes.capacity ?? 0) / 10;
  return -product.price / 100;
}

function valueScore(product: { attributes: Record<string, unknown>; price: number }, step: PcBuilderStepId): number {
  if (product.price <= 0) return 0;
  const perf =
    step === "cpu"
      ? Number(product.attributes.core_count ?? 1)
      : step === "gpu"
        ? Number(product.attributes.vram ?? 1)
        : step === "ram"
          ? Number(product.attributes.capacity ?? 1)
          : 1;
  return (perf * 10000) / product.price;
}

function relatedComponents(selections: PcBuilderSelection[]): SmartRecommendation[] {
  const selectedSteps = new Set(selections.map((s) => s.stepId));
  const recs: SmartRecommendation[] = [];
  const coreSteps: PcBuilderStepId[] = ["cpu", "motherboard", "ram", "ssd", "psu", "case"];

  for (const step of coreSteps) {
    if (selectedSteps.has(step)) continue;
    const products = getPcProductsByStep(step);
    const { compatible } = filterCompatibleProducts(products, selections, compatibilityRulesSeed);
    const pick = compatible.find((p) => p.stockStatus !== "Out of Stock");
    if (!pick) continue;

    recs.push({
      id: `rel_${step}`,
      kind: "related_component",
      priority: step === "cpu" || step === "motherboard" ? 1 : 2,
      title: `Add ${PC_BUILDER_STEPS.find((s) => s.id === step)?.label ?? step}`,
      description: `Complete your build with ${pick.name} — compatible with current selections.`,
      stepId: step,
      productId: pick.id,
      productName: pick.name,
      price: pick.price,
      action: "add",
    });
  }

  return recs;
}

function betterPerformance(selections: PcBuilderSelection[]): SmartRecommendation[] {
  const recs: SmartRecommendation[] = [];

  for (const sel of selections) {
    const products = getPcProductsByStep(sel.stepId);
    const { compatible } = filterCompatibleProducts(
      products.filter((p) => p.id !== sel.productId),
      selections.filter((s) => s.stepId !== sel.stepId),
      compatibilityRulesSeed,
    );
    const upgrades = compatible
      .filter((p) => p.price > sel.price && p.stockStatus !== "Out of Stock")
      .sort((a, b) => perfScore(sel, b) - perfScore(sel, a));

    const best = upgrades[0];
    if (!best) continue;

    recs.push({
      id: `perf_${sel.stepId}`,
      kind: "better_performance",
      priority: sel.stepId === "gpu" || sel.stepId === "cpu" ? 2 : 3,
      title: `Upgrade ${PC_BUILDER_STEPS.find((s) => s.id === sel.stepId)?.label}`,
      description: `${best.name} delivers higher performance for +${formatCurrency(best.price - sel.price)}.`,
      stepId: sel.stepId,
      productId: best.id,
      productName: best.name,
      price: best.price,
      priceDelta: best.price - sel.price,
      action: "swap",
    });
  }

  return recs.slice(0, 4);
}

function betterValue(selections: PcBuilderSelection[]): SmartRecommendation[] {
  const recs: SmartRecommendation[] = [];

  for (const sel of selections) {
    const products = getPcProductsByStep(sel.stepId);
    const { compatible } = filterCompatibleProducts(
      products.filter((p) => p.id !== sel.productId),
      selections.filter((s) => s.stepId !== sel.stepId),
      compatibilityRulesSeed,
    );
    const alternatives = compatible
      .filter((p) => p.price < sel.price && p.stockStatus !== "Out of Stock")
      .sort((a, b) => valueScore(b, sel.stepId) - valueScore(a, sel.stepId));

    const best = alternatives[0];
    if (!best || sel.price - best.price < 500) continue;

    recs.push({
      id: `value_${sel.stepId}`,
      kind: "better_value",
      priority: 4,
      title: `Save on ${PC_BUILDER_STEPS.find((s) => s.id === sel.stepId)?.label}`,
      description: `${best.name} saves ${formatCurrency(sel.price - best.price)} with similar specs.`,
      stepId: sel.stepId,
      productId: best.id,
      productName: best.name,
      price: best.price,
      priceDelta: best.price - sel.price,
      action: "swap",
    });
  }

  return recs.slice(0, 3);
}

function buildUpgradePath(selections: PcBuilderSelection[], purpose: string): UpgradePathStep[] {
  const perfUpgrades = betterPerformance(selections);
  const priorityOrder =
    purpose === "gaming"
      ? ["gpu", "cpu", "ram", "ssd"]
      : purpose === "workstation"
        ? ["cpu", "ram", "ssd", "gpu"]
        : ["cpu", "gpu", "ram"];

  const sorted = perfUpgrades
    .filter((r) => r.stepId && r.productId)
    .sort((a, b) => {
      const ai = priorityOrder.indexOf(a.stepId!);
      const bi = priorityOrder.indexOf(b.stepId!);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });

  let cumulative = 0;
  return sorted.map((r, i) => {
    cumulative += r.priceDelta ?? 0;
    const sel = selections.find((s) => s.stepId === r.stepId);
    return {
      order: i + 1,
      stepId: r.stepId!,
      fromProductId: sel?.productId ?? "",
      toProductId: r.productId!,
      toProductName: r.productName!,
      priceDelta: r.priceDelta ?? 0,
      impact:
        r.stepId === "gpu"
          ? "Higher FPS and graphics settings"
          : r.stepId === "cpu"
            ? "Faster rendering and multitasking"
            : "Improved system performance",
      cumulativeDelta: cumulative,
    };
  });
}

function budgetOptimization(
  selections: PcBuilderSelection[],
  budgetBdt: number | null | undefined,
): BudgetOptimization | null {
  const currentTotal = selections.reduce((s, x) => s + x.price, 0);
  if (!budgetBdt) {
    return {
      currentTotal,
      budgetCap: null,
      remaining: null,
      overBudget: false,
      suggestions: [],
      spendRemainingIdeas: [],
    };
  }

  const remaining = budgetBdt - currentTotal;
  const overBudget = remaining < 0;

  const suggestions: BudgetOptimization["suggestions"] = [];
  if (overBudget) {
    let deficit = -remaining;
    const valueRecs = betterValue(selections).sort((a, b) => (a.priceDelta ?? 0) - (b.priceDelta ?? 0));
    for (const rec of valueRecs) {
      if (!rec.stepId || rec.stepId === "cooler" || !rec.productId || !rec.productName) continue;
      const savings = -(rec.priceDelta ?? 0);
      suggestions.push({
        stepId: rec.stepId as PcBuilderStepId,
        swapToProductId: rec.productId,
        swapToProductName: rec.productName,
        savings,
        tradeoff: `Frees ${formatCurrency(savings)} toward budget`,
      });
      deficit -= savings;
      if (deficit <= 0) break;
    }
  }

  const spendRemainingIdeas: BudgetOptimization["spendRemainingIdeas"] = [];
  if (!overBudget && remaining > 3000) {
    const perfRecs = betterPerformance(selections);
    for (const rec of perfRecs.slice(0, 2)) {
      if (!rec.stepId || rec.stepId === "cooler" || !rec.productId || !rec.productName || (rec.priceDelta ?? 0) > remaining) continue;
      spendRemainingIdeas.push({
        stepId: rec.stepId as PcBuilderStepId,
        productId: rec.productId,
        productName: rec.productName,
        cost: rec.priceDelta ?? 0,
        benefit: rec.description,
      });
    }
  }

  return {
    currentTotal,
    budgetCap: budgetBdt,
    remaining,
    overBudget,
    suggestions,
    spendRemainingIdeas,
  };
}

export function generateSmartRecommendations(
  selections: PcBuilderSelection[],
  options: EngineOptions = {},
): SmartRecommendationResult {
  const purpose = options.purpose ?? "general";
  const recommendations: SmartRecommendation[] = [];

  recommendations.push(...relatedComponents(selections));
  recommendations.push(...betterPerformance(selections));
  recommendations.push(...betterValue(selections));

  const psu = recommendPsu(selections);
  if (psu) {
    recommendations.push({
      id: "psu_sizing",
      kind: "psu_wattage",
      priority: psu.adequate ? 5 : 1,
      title: psu.adequate ? "PSU adequately sized" : "PSU upgrade recommended",
      description: psu.message,
      stepId: "psu",
      action: psu.adequate ? "info" : "swap",
      metadata: {
        estimatedDrawW: psu.estimatedDrawW,
        recommendedMinW: psu.recommendedMinW,
        recommendedIdealW: psu.recommendedIdealW,
      },
    });
    if (!psu.adequate && psu.suggestedProductIds[0]) {
      const suggested = getPcProductById(psu.suggestedProductIds[0]);
      if (suggested) {
        recommendations[recommendations.length - 1].productId = suggested.id;
        recommendations[recommendations.length - 1].productName = suggested.name;
        recommendations[recommendations.length - 1].price = suggested.price;
      }
    }
  }

  const cooling = recommendCooling(selections);
  if (cooling?.needsAftermarket) {
    const cooler = getCoolerById(cooling.suggestedProductIds[0] ?? "");
    recommendations.push({
      id: "cooling_rec",
      kind: "cooling",
      priority: cooling.tier === "aio_recommended" ? 2 : 3,
      title: "Cooling upgrade recommended",
      description: cooling.message,
      stepId: "cooler",
      productId: cooler?.id,
      productName: cooler?.name,
      price: cooler?.price,
      action: "add",
      metadata: { cpuTdp: cooling.cpuTdp, tier: cooling.tier },
    });
  }

  const upgradePath = buildUpgradePath(selections, purpose);
  if (upgradePath.length > 0) {
    recommendations.push({
      id: "upgrade_path_summary",
      kind: "upgrade_path",
      priority: 3,
      title: `${upgradePath.length}-step upgrade path`,
      description: `Full upgrade path adds ${formatCurrency(upgradePath[upgradePath.length - 1].cumulativeDelta)} total.`,
      action: "info",
      metadata: { steps: upgradePath.length },
    });
  }

  const budget = budgetOptimization(selections, options.budgetBdt);
  if (budget && (budget.overBudget || (budget.spendRemainingIdeas?.length ?? 0) > 0)) {
    recommendations.push({
      id: "budget_opt",
      kind: "budget_optimization",
      priority: budget.overBudget ? 1 : 4,
      title: budget.overBudget ? "Over budget — optimize" : "Budget headroom available",
      description: budget.overBudget
        ? `${formatCurrency(-budget.remaining!)} over cap — swap components below.`
        : `${formatCurrency(budget.remaining!)} remaining — consider upgrades.`,
      action: "info",
    });
  }

  recommendations.sort((a, b) => a.priority - b.priority);

  return {
    recommendations,
    psu,
    cooling,
    upgradePath,
    budget,
    generatedAt: new Date().toISOString(),
  };
}

export { calculateSystemDrawW };
