import type { PcBuilderStepId } from "@/lib/builder/types";

/** Ready-made full PC builds for design / demo — all parts compatible */
export type PcBuildPreset = {
  id: string;
  name: string;
  description: string;
  tier: "budget" | "mid" | "high";
  totalEstimate: number;
  picks: Partial<Record<PcBuilderStepId, string>>;
};

export const pcBuildPresets: PcBuildPreset[] = [
  {
    id: "preset_budget_intel",
    name: "Budget Intel DDR4",
    description: "Office + light gaming under ৳95,000",
    tier: "budget",
    totalEstimate: 94800,
    picks: {
      cpu: "pcb_cpu_i3",
      motherboard: "pcb_mobo_b760",
      ram: "pcb_ram_ddr4_16",
      gpu: "pcb_gpu_3050",
      ssd: "pcb_ssd_500",
      psu: "pcb_psu_550",
      case: "pcb_case_compact",
      monitor: "pcb_mon_24",
    },
  },
  {
    id: "preset_gaming_intel",
    name: "Gaming Intel DDR5",
    description: "1440p gaming — i5, RTX 4060, 32GB DDR5",
    tier: "mid",
    totalEstimate: 142900,
    picks: {
      cpu: "pcb_cpu_i5",
      motherboard: "pcb_mobo_b760_ddr5",
      ram: "pcb_ram_ddr5_32",
      gpu: "pcb_gpu_4060",
      ssd: "pcb_ssd_1tb",
      psu: "pcb_psu_650",
      case: "pcb_case_mid",
      monitor: "pcb_mon_27_1440",
    },
  },
  {
    id: "preset_gaming_amd",
    name: "Gaming AMD AM5",
    description: "Best gaming value — 7800X3D + RX 7800 XT",
    tier: "mid",
    totalEstimate: 178400,
    picks: {
      cpu: "pcb_cpu_r7",
      motherboard: "pcb_mobo_b650",
      ram: "pcb_ram_ddr5_32",
      gpu: "pcb_gpu_7800xt",
      ssd: "pcb_ssd_1tb",
      psu: "pcb_psu_850",
      case: "pcb_case_4000d",
      monitor: "pcb_mon_27_1440",
    },
  },
  {
    id: "preset_enthusiast",
    name: "Enthusiast Intel",
    description: "4K ready — i7, RTX 4070, 850W, ultrawide",
    tier: "high",
    totalEstimate: 248600,
    picks: {
      cpu: "pcb_cpu_i7",
      motherboard: "pcb_mobo_z790",
      ram: "pcb_ram_ddr5_32",
      gpu: "pcb_gpu_4070",
      ssd: "pcb_ssd_2tb",
      psu: "pcb_psu_850",
      case: "pcb_case_o11",
      monitor: "pcb_mon_27",
    },
  },
  {
    id: "preset_streaming_amd",
    name: "Streaming AMD",
    description: "Ryzen 5 + RTX 4060 Ti — encode + game",
    tier: "mid",
    totalEstimate: 165200,
    picks: {
      cpu: "pcb_cpu_r5",
      motherboard: "pcb_mobo_b650m",
      ram: "pcb_ram_ddr5_32",
      gpu: "pcb_gpu_4060ti",
      ssd: "pcb_ssd_1tb",
      psu: "pcb_psu_750",
      case: "pcb_case_mid",
      monitor: "pcb_mon_27_1440",
    },
  },
];

export function getPcBuildPresetById(id: string): PcBuildPreset | undefined {
  return pcBuildPresets.find((p) => p.id === id);
}
