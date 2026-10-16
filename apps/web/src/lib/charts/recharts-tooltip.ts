/**
 * Recharts Tooltip formatters.
 *
 * Recharts passes `ValueType | undefined` to `formatter` — never annotate the
 * first parameter as `number` or TypeScript build will fail on Vercel.
 */

import { formatCurrency } from "@/lib/utils";

export function chartValueAsNumber(value: unknown, fallback = 0): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

/** Tooltip tuple for BDT in millions, e.g. `৳12M`. */
export function chartTooltipBdtMillions(value: unknown): [string, string] {
  return [`${formatCurrency(chartValueAsNumber(value))}M`, ""];
}

/** Tooltip tuple for BDT in thousands, e.g. `৳120K`. */
export function chartTooltipBdtThousands(value: unknown): [string, string] {
  return [`${formatCurrency(chartValueAsNumber(value))}K`, ""];
}
