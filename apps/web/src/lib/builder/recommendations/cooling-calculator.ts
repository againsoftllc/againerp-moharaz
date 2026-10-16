import type { CoolingRecommendation } from "@/lib/builder/recommendations/types";
import type { PcBuilderSelection } from "@/lib/builder/types";
import { coolerProductsSeed } from "@/lib/mock-data/pc-builder-coolers";

export function recommendCooling(selections: PcBuilderSelection[]): CoolingRecommendation | null {
  const cpu = selections.find((s) => s.stepId === "cpu");
  if (!cpu) return null;

  const tdp = Number(cpu.attributes.tdp ?? 65);

  let tier: CoolingRecommendation["tier"] = "stock_ok";
  let needsAftermarket = false;
  let message = `CPU TDP ${tdp}W — stock cooler is sufficient for typical loads.`;

  if (tdp > 125) {
    tier = "aio_recommended";
    needsAftermarket = true;
    message = `CPU TDP ${tdp}W — recommend 240mm+ AIO or high-end air cooler for sustained loads.`;
  } else if (tdp > 95) {
    tier = "tower_recommended";
    needsAftermarket = true;
    message = `CPU TDP ${tdp}W — tower cooler recommended over stock for thermals and noise.`;
  }

  const suitable = coolerProductsSeed
    .filter((c) => c.stockStatus !== "Out of Stock")
    .filter((c) => Number(c.attributes.tdp_rating) >= tdp)
    .sort((a, b) => a.price - b.price);

  return {
    cpuTdp: tdp,
    needsAftermarket,
    tier,
    message,
    suggestedProductIds: suitable.slice(0, 2).map((c) => c.id),
  };
}
