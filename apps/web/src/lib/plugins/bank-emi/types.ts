export type EmiPlanRow = {
  months: number;
  chargePercent: number;
  monthlyEmi: number;
  effectiveCost: number;
};

export type EmiBank = {
  id: string;
  name: string;
  nameBn?: string;
  initial: string;
  brandColor: string;
  plans: { months: number; chargePercent: number; active?: boolean }[];
};

export type EmiSettings = {
  enabled: boolean;
  minOrderAmount: number;
  labelEn: string;
  labelBn?: string;
  showOnPdp: boolean;
  showOnCart: boolean;
  showOnBuilder: boolean;
  banks: EmiBank[];
};

export type EmiCalculationResult = {
  eligible: boolean;
  amount: number;
  minOrderAmount: number;
  banks: {
    bank: EmiBank;
    plans: EmiPlanRow[];
  }[];
  lowestMonthlyEmi: number | null;
};
