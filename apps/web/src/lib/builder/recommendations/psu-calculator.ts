import type { PcBuilderSelection } from "@/lib/builder/types";
import type { PsuRecommendation } from "@/lib/builder/recommendations/types";
import { getPcProductsByStep } from "@/lib/mock-data/pc-builder-products";

const HEADROOM_PERCENT = 20;
const BASE_DRAW_W = 80; // motherboard, fans, storage

export function calculateSystemDrawW(selections: PcBuilderSelection[]): number {
  const cpuTdp = Number(selections.find((s) => s.stepId === "cpu")?.attributes.tdp ?? 65);
  const gpuTdp = Number(selections.find((s) => s.stepId === "gpu")?.attributes.tdp ?? 0);
  return cpuTdp + gpuTdp + BASE_DRAW_W;
}

export function recommendPsu(selections: PcBuilderSelection[]): PsuRecommendation | null {
  const draw = calculateSystemDrawW(selections);
  if (draw <= BASE_DRAW_W) return null;

  const recommendedMinW = Math.ceil(draw * 1.1);
  const recommendedIdealW = Math.ceil(draw * (1 + HEADROOM_PERCENT / 100));

  const psuSel = selections.find((s) => s.stepId === "psu");
  const currentPsuW = psuSel ? Number(psuSel.attributes.wattage ?? 0) : null;
  const adequate = currentPsuW === null ? false : currentPsuW >= recommendedMinW;

  const psuProducts = getPcProductsByStep("psu")
    .filter((p) => p.stockStatus !== "Out of Stock")
    .filter((p) => Number(p.attributes.wattage) >= recommendedMinW)
    .sort((a, b) => Number(a.attributes.wattage) - Number(b.attributes.wattage));

  const message = currentPsuW
    ? adequate
      ? `Your ${currentPsuW}W PSU covers the estimated ${draw}W draw with headroom.`
      : `Estimated draw ${draw}W — upgrade to at least ${recommendedMinW}W (ideal ${recommendedIdealW}W).`
    : `Estimated system draw ${draw}W — select a ${recommendedIdealW}W+ PSU for safe headroom.`;

  return {
    estimatedDrawW: draw,
    recommendedMinW,
    recommendedIdealW,
    headroomPercent: HEADROOM_PERCENT,
    currentPsuW,
    adequate,
    message,
    suggestedProductIds: psuProducts.slice(0, 2).map((p) => p.id),
  };
}
