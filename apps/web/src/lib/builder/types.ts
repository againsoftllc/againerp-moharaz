/** PC Builder wizard types */

export const PC_BUILDER_STEPS = [
  // ── Components (compatibility engine applies) ──
  { id: "cpu", phase: "components", categoryId: "cc_cpu", attributeProfileId: "cap_cpu", label: "CPU", icon: "cpu", allowMultiple: false },
  { id: "motherboard", phase: "components", categoryId: "cc_mobo", attributeProfileId: "cap_mobo", label: "Motherboard", icon: "mobo", allowMultiple: false },
  { id: "ram", phase: "components", categoryId: "cc_ram", attributeProfileId: "cap_ram", label: "RAM", icon: "ram", allowMultiple: true },
  { id: "gpu", phase: "components", categoryId: "cc_gpu", attributeProfileId: "cap_gpu", label: "GPU", icon: "gpu", allowMultiple: false },
  { id: "ssd", phase: "components", categoryId: "cc_storage", attributeProfileId: "cap_storage", label: "SSD", icon: "ssd", allowMultiple: true },
  { id: "hdd", phase: "components", categoryId: "cc_storage", attributeProfileId: "cap_storage", label: "HDD", icon: "hdd", allowMultiple: true },
  { id: "psu", phase: "components", categoryId: "cc_psu", attributeProfileId: "cap_psu", label: "PSU", icon: "psu", allowMultiple: false },
  { id: "case", phase: "components", categoryId: "cc_case", attributeProfileId: "cap_case", label: "Case", icon: "case", allowMultiple: false },
  { id: "cooler", phase: "components", categoryId: "cc_cooler", attributeProfileId: "cap_cooler", label: "CPU Cooler", icon: "cooler", allowMultiple: false, optional: true },
  // ── Extras (optional add-ons, no strict compatibility) ──
  { id: "os", phase: "extras", categoryId: "cc_os", attributeProfileId: "cap_os", label: "Operating System", icon: "os", allowMultiple: false, optional: true },
  { id: "case_fans", phase: "extras", categoryId: "cc_fans", attributeProfileId: "cap_fans", label: "Case Fans", icon: "case_fans", allowMultiple: true, optional: true },
  { id: "wifi", phase: "extras", categoryId: "cc_wifi", attributeProfileId: "cap_wifi", label: "WiFi Adapter", icon: "wifi", allowMultiple: false, optional: true },
  { id: "accessories", phase: "extras", categoryId: "cc_accessories", attributeProfileId: "cap_accessories", label: "Accessories", icon: "accessories", allowMultiple: true, optional: true },
  // ── Peripherals (desk setup — all optional) ──
  { id: "monitor", phase: "peripherals", categoryId: "cc_monitor", attributeProfileId: "cap_monitor", label: "Monitor", icon: "monitor", allowMultiple: false, optional: true },
  { id: "mouse", phase: "peripherals", categoryId: "cc_mouse", attributeProfileId: "cap_mouse", label: "Mouse", icon: "mouse", allowMultiple: false, optional: true },
  { id: "keyboard", phase: "peripherals", categoryId: "cc_keyboard", attributeProfileId: "cap_keyboard", label: "Keyboard", icon: "keyboard", allowMultiple: false, optional: true },
  { id: "mousepad", phase: "peripherals", categoryId: "cc_mousepad", attributeProfileId: "cap_mousepad", label: "Mouse Pad", icon: "mousepad", allowMultiple: false, optional: true },
  { id: "controller", phase: "peripherals", categoryId: "cc_controller", attributeProfileId: "cap_controller", label: "Controller", icon: "controller", allowMultiple: false, optional: true },
  { id: "headset", phase: "peripherals", categoryId: "cc_headset", attributeProfileId: "cap_headset", label: "Headset", icon: "headset", allowMultiple: false, optional: true },
  { id: "microphone", phase: "peripherals", categoryId: "cc_mic", attributeProfileId: "cap_mic", label: "Microphone", icon: "microphone", allowMultiple: false, optional: true },
  { id: "speakers", phase: "peripherals", categoryId: "cc_speakers", attributeProfileId: "cap_speakers", label: "Speakers", icon: "speakers", allowMultiple: false, optional: true },
  { id: "webcam", phase: "peripherals", categoryId: "cc_webcam", attributeProfileId: "cap_webcam", label: "Webcam", icon: "webcam", allowMultiple: false, optional: true },
] as const satisfies readonly {
  id: string;
  phase: "components" | "extras" | "peripherals";
  categoryId: string;
  attributeProfileId: string;
  label: string;
  icon: string;
  allowMultiple?: boolean;
  optional?: boolean;
}[];

export type PcBuilderStepId = (typeof PC_BUILDER_STEPS)[number]["id"];

export type PcComponentAttributes = Record<string, string | number | boolean>;

export type PcBuilderProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  stockStatus: "In Stock" | "Low Stock" | "Out of Stock";
  image: string;
  stepId: PcBuilderStepId;
  categoryId: string;
  attributeProfileId: string;
  attributes: PcComponentAttributes;
  specs: { label: string; value: string }[];
};

export type PcBuilderSelection = {
  selectionId: string;
  stepId: PcBuilderStepId;
  productId: string;
  productName: string;
  price: number;
  image: string;
  attributes: PcComponentAttributes;
  attributeProfileId: string;
};

export function stepAllowsMultiple(stepId: PcBuilderStepId): boolean {
  return PC_BUILDER_STEPS.find((s) => s.id === stepId)?.allowMultiple ?? false;
}

export type PcBuilderSavedBuild = {
  id: string;
  buildCode: string;
  name: string;
  selections: PcBuilderSelection[];
  totalPrice: number;
  compatibilityStatus: "compatible" | "warning" | "incompatible";
  createdAt: string;
  shareToken: string;
};

export type PcBuilderCompareSlot = {
  stepId: PcBuilderStepId;
  productIds: string[];
};
