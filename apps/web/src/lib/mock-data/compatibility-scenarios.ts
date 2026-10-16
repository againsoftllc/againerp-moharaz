import type { BuildComponentContext } from "@/lib/compatibility/types";

export type CompatibilityScenario = {
  id: string;
  title: string;
  titleBn: string;
  description: string;
  descriptionBn: string;
  expectedStatus: "compatible" | "warning" | "incompatible";
  icon: "success" | "error" | "warning";
  components: BuildComponentContext[];
};

export const compatibilityScenarios: CompatibilityScenario[] = [
  {
    id: "scenario_perfect_intel",
    title: "Perfect Intel DDR5 Build",
    titleBn: "✅ সঠিক Intel DDR5 বিল্ড",
    description: "i5 LGA1700 + Z790 DDR5 + matching RAM — all rules pass",
    descriptionBn: "CPU socket, RAM type সব মিলেছে — customer cart-এ যেতে পারবে",
    expectedStatus: "compatible",
    icon: "success",
    components: [
      {
        componentProfileId: "cap_cpu",
        componentName: "Intel Core i5-14600K",
        productId: "pcb_cpu_i5",
        attributes: { socket: "lga_1700", tdp: 125, core_count: 14 },
      },
      {
        componentProfileId: "cap_mobo",
        componentName: "ASUS Z790-P WiFi",
        productId: "pcb_mobo_z790",
        attributes: { socket: "lga_1700", ram_type: "ddr5", chipset: "z790" },
      },
      {
        componentProfileId: "cap_ram",
        componentName: "Corsair Vengeance 32GB DDR5",
        productId: "pcb_ram_ddr5_32",
        attributes: { type: "ddr5", speed: 5600, capacity: 32 },
      },
    ],
  },
  {
    id: "scenario_socket_mismatch",
    title: "Socket Mismatch",
    titleBn: "❌ Socket মিলছে না",
    description: "Intel LGA1700 CPU on AMD AM5 motherboard — blocked",
    descriptionBn: "Intel CPU + AMD motherboard — বিল্ড incompatible, GPU step-এ যাওয়ার আগেই আটকাবে",
    expectedStatus: "incompatible",
    icon: "error",
    components: [
      {
        componentProfileId: "cap_cpu",
        componentName: "Intel Core i5-14600K",
        productId: "pcb_cpu_i5",
        attributes: { socket: "lga_1700", tdp: 125, core_count: 14 },
      },
      {
        componentProfileId: "cap_mobo",
        componentName: "Gigabyte B650 AORUS",
        productId: "pcb_mobo_b650",
        attributes: { socket: "am5", ram_type: "ddr5", chipset: "b650" },
      },
      {
        componentProfileId: "cap_ram",
        componentName: "Corsair Vengeance 32GB DDR5",
        productId: "pcb_ram_ddr5_32",
        attributes: { type: "ddr5", speed: 5600, capacity: 32 },
      },
    ],
  },
  {
    id: "scenario_ram_mismatch",
    title: "RAM Type Mismatch",
    titleBn: "⚠️ RAM টাইপ ভুল",
    description: "DDR4 motherboard with DDR5 RAM stick",
    descriptionBn: "Motherboard DDR4 সাপোর্ট করে কিন্তু DDR5 RAM বেছে নিয়েছে",
    expectedStatus: "incompatible",
    icon: "warning",
    components: [
      {
        componentProfileId: "cap_cpu",
        componentName: "Intel Core i3-14100",
        productId: "pcb_cpu_i3",
        attributes: { socket: "lga_1700", tdp: 60, core_count: 4 },
      },
      {
        componentProfileId: "cap_mobo",
        componentName: "MSI B760M PRO DDR4",
        productId: "pcb_mobo_b760",
        attributes: { socket: "lga_1700", ram_type: "ddr4", chipset: "b760" },
      },
      {
        componentProfileId: "cap_ram",
        componentName: "Corsair Vengeance 32GB DDR5",
        productId: "pcb_ram_ddr5_32",
        attributes: { type: "ddr5", speed: 5600, capacity: 32 },
      },
    ],
  },
  {
    id: "scenario_high_tdp",
    title: "High TDP Warning",
    titleBn: "⚠️ বেশি TDP CPU",
    description: "Ryzen 9 7950X — needs strong cooler and PSU headroom",
    descriptionBn: "১৭০W TDP — cooling ও PSU যথেষ্ট কিনা চেক করুন (warning, not blocked)",
    expectedStatus: "warning",
    icon: "warning",
    components: [
      {
        componentProfileId: "cap_cpu",
        componentName: "AMD Ryzen 9 7950X",
        productId: "pcb_cpu_r9",
        attributes: { socket: "am5", tdp: 170, core_count: 16 },
      },
      {
        componentProfileId: "cap_mobo",
        componentName: "Gigabyte B650 AORUS",
        productId: "pcb_mobo_b650",
        attributes: { socket: "am5", ram_type: "ddr5", chipset: "b650" },
      },
      {
        componentProfileId: "cap_ram",
        componentName: "G.Skill 64GB DDR5",
        productId: "pcb_ram_ddr5_64",
        attributes: { type: "ddr5", speed: 6000, capacity: 64 },
      },
    ],
  },
];

export const compatibilityRuleQuickStart = [
  {
    id: "qs_socket",
    title: "Socket Match",
    titleBn: "Socket মিল",
    summary: "IF CPU socket = Motherboard socket → OK, else block",
    summaryBn: "CPU আর Motherboard-এর socket এক হতে হবে",
    example: "LGA1700 CPU শুধু LGA1700 board-এ বসবে",
  },
  {
    id: "qs_ram",
    title: "RAM Type Match",
    titleBn: "RAM টাইপ মিল",
    summary: "IF Motherboard ram_type = RAM type → OK",
    summaryBn: "DDR4 board-এ DDR4 RAM, DDR5 board-এ DDR5",
    example: "B760 DDR4 + DDR4 16GB = compatible",
  },
  {
    id: "qs_tdp",
    title: "High TDP Warning",
    titleBn: "বেশি TDP সতর্কতা",
    summary: "IF CPU TDP > 125W → warning (cooling check)",
    summaryBn: "১২৫W এর বেশি CPU হলে cooler/PSU যাচাই করুন",
    example: "Ryzen 9 / i7 K-series → amber banner",
  },
  {
    id: "qs_ddr5",
    title: "DDR5 Speed Check",
    titleBn: "DDR5 স্পিড চেক",
    summary: "IF DDR5 speed < 4800 → performance warning",
    summaryBn: "ধীর DDR5 হলে performance সীমিত হতে পারে",
    example: "5200 MHz OK · 4400 MHz warning",
  },
];
