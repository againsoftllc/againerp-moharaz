import type { EmiSettings } from "@/lib/plugins/bank-emi/types";

export const EMI_BANKS_SEED = [
  {
    id: "ab_bank",
    name: "AB Bank",
    initial: "A",
    brandColor: "#C41E3A",
    plans: [
      { months: 3, chargePercent: 4.16 },
      { months: 6, chargePercent: 6.5 },
      { months: 9, chargePercent: 7.8 },
      { months: 12, chargePercent: 8.69 },
    ],
  },
  {
    id: "ab_bank_online",
    name: "AB Bank - Online",
    initial: "A",
    brandColor: "#B91C1C",
    plans: [
      { months: 3, chargePercent: 3.99 },
      { months: 6, chargePercent: 6.2 },
      { months: 9, chargePercent: 7.5 },
      { months: 12, chargePercent: 8.4 },
    ],
  },
  {
    id: "al_arafah",
    name: "Al-Arafah",
    initial: "A",
    brandColor: "#15803D",
    plans: [
      { months: 3, chargePercent: 4.5 },
      { months: 6, chargePercent: 6.8 },
      { months: 9, chargePercent: 8.0 },
      { months: 12, chargePercent: 9.0 },
    ],
  },
  {
    id: "bank_asia",
    name: "Bank Asia",
    initial: "B",
    brandColor: "#1D4ED8",
    plans: [
      { months: 3, chargePercent: 4.25 },
      { months: 6, chargePercent: 6.6 },
      { months: 9, chargePercent: 7.9 },
      { months: 12, chargePercent: 8.75 },
    ],
  },
  {
    id: "brac_bank",
    name: "Brac Bank",
    initial: "B",
    brandColor: "#F97316",
    plans: [
      { months: 3, chargePercent: 4.0 },
      { months: 6, chargePercent: 6.3 },
      { months: 9, chargePercent: 7.6 },
      { months: 12, chargePercent: 8.5 },
    ],
  },
  {
    id: "city_bank",
    name: "City Bank",
    initial: "C",
    brandColor: "#7C3AED",
    plans: [
      { months: 3, chargePercent: 4.3 },
      { months: 6, chargePercent: 6.7 },
      { months: 12, chargePercent: 8.8 },
    ],
  },
  {
    id: "ebl",
    name: "Eastern Bank",
    initial: "E",
    brandColor: "#0F766E",
    plans: [
      { months: 3, chargePercent: 4.1 },
      { months: 6, chargePercent: 6.4 },
      { months: 9, chargePercent: 7.7 },
      { months: 12, chargePercent: 8.6 },
    ],
  },
] as const;

export const DEFAULT_EMI_SETTINGS: EmiSettings = {
  enabled: true,
  minOrderAmount: 5000,
  labelEn: "EMI Available for orders above ৳ {min}",
  labelBn: "{min} টাকার বেশি অর্ডারে কিস্তি সুবিধা",
  showOnPdp: true,
  showOnCart: true,
  showOnBuilder: true,
  banks: EMI_BANKS_SEED.map((b) => ({
    ...b,
    plans: b.plans.map((p) => ({ ...p })),
  })),
};
