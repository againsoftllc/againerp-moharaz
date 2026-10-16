import type { EmiBank, EmiCalculationResult, EmiPlanRow, EmiSettings } from "./types";
import { formatQuantity } from "@/lib/utils";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculatePlanRow(amount: number, months: number, chargePercent: number): EmiPlanRow {
  const effectiveCost = round2(amount * (1 + chargePercent / 100));
  const monthlyEmi = round2(effectiveCost / months);
  return { months, chargePercent, monthlyEmi, effectiveCost };
}

export function calculateBankPlans(amount: number, bank: EmiBank): EmiPlanRow[] {
  return bank.plans
    .filter((p) => p.active !== false)
    .map((p) => calculatePlanRow(amount, p.months, p.chargePercent))
    .sort((a, b) => a.months - b.months);
}

export function calculateEmiPlans(amount: number, settings: EmiSettings): EmiCalculationResult {
  const eligible = settings.enabled && amount >= settings.minOrderAmount;

  if (!eligible || amount <= 0) {
    return {
      eligible: false,
      amount,
      minOrderAmount: settings.minOrderAmount,
      banks: [],
      lowestMonthlyEmi: null,
    };
  }

  const banks = settings.banks
    .map((bank) => ({
      bank,
      plans: calculateBankPlans(amount, bank),
    }))
    .filter((b) => b.plans.length > 0);

  let lowestMonthlyEmi: number | null = null;
  for (const { plans } of banks) {
    for (const plan of plans) {
      if (lowestMonthlyEmi === null || plan.monthlyEmi < lowestMonthlyEmi) {
        lowestMonthlyEmi = plan.monthlyEmi;
      }
    }
  }

  return {
    eligible: true,
    amount,
    minOrderAmount: settings.minOrderAmount,
    banks,
    lowestMonthlyEmi,
  };
}

export function formatEmiLabel(template: string, minAmount: number): string {
  return template.replace("{min}", formatQuantity(minAmount));
}
