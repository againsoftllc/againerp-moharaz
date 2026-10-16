import type { CompatibilityRule } from "@/lib/compatibility/types";

export const CONFIGURATOR_BUILDER_PROFILES = [
  { id: "pc-builder", name: "PC Builder", code: "pc_builder" },
  { id: "cfg_pc", name: "PC Builder (legacy)", code: "pc_builder" },
  { id: "laptop-builder", name: "Laptop Builder", code: "laptop_builder" },
  { id: "cctv-builder", name: "CCTV Builder", code: "cctv_builder" },
] as const;

export const compatibilityRulesSeed: CompatibilityRule[] = [
  {
    id: "cr_socket_match",
    name: "CPU ↔ Motherboard Socket Match",
    code: "socket_match",
    configuratorProfileId: "cfg_pc",
    configuratorProfileName: "PC Builder",
    description: "CPU socket must equal motherboard socket.",
    priority: 1,
    active: true,
    body: {
      conditions: [
        {
          id: "c1",
          left: { profileId: "cap_cpu", fieldCode: "socket" },
          operator: "equals",
          right: { profileId: "cap_mobo", fieldCode: "socket" },
        },
      ],
      then: {
        status: "compatible",
        message: "CPU socket matches motherboard socket.",
      },
      else: {
        status: "incompatible",
        message: "CPU socket does not match motherboard socket — cannot install.",
      },
    },
    updatedAt: "2026-06-15",
  },
  {
    id: "cr_ram_type_match",
    name: "Motherboard ↔ RAM Type Match",
    code: "ram_type_match",
    configuratorProfileId: "cfg_pc",
    configuratorProfileName: "PC Builder",
    description: "Motherboard RAM type must equal RAM module type.",
    priority: 2,
    active: true,
    body: {
      conditions: [
        {
          id: "c1",
          left: { profileId: "cap_mobo", fieldCode: "ram_type" },
          operator: "equals",
          right: { profileId: "cap_ram", fieldCode: "type" },
        },
      ],
      then: {
        status: "compatible",
        message: "RAM type matches motherboard support.",
      },
      else: {
        status: "incompatible",
        message: "RAM type incompatible with motherboard — check DDR4/DDR5.",
      },
    },
    updatedAt: "2026-06-15",
  },
  {
    id: "cr_tdp_warning",
    name: "High TDP CPU Warning",
    code: "tdp_warning",
    configuratorProfileId: "cfg_pc",
    configuratorProfileName: "PC Builder",
    description: "Warn when CPU TDP exceeds 125W — verify cooler and PSU.",
    priority: 10,
    active: true,
    body: {
      conditions: [
        {
          id: "c1",
          left: { profileId: "cap_cpu", fieldCode: "tdp" },
          operator: "greater_than",
          right: { literal: 125 },
        },
      ],
      then: {
        status: "warning",
        message: "CPU TDP exceeds 125W — ensure adequate cooling and PSU headroom.",
      },
      else: {
        status: "compatible",
        message: "CPU TDP within standard cooling range.",
      },
    },
    updatedAt: "2026-06-15",
  },
  {
    id: "cr_ddr5_speed",
    name: "DDR5 Speed Check",
    code: "ddr5_speed_check",
    configuratorProfileId: "cfg_pc",
    configuratorProfileName: "PC Builder",
    priority: 15,
    active: true,
    body: {
      conditions: [
        {
          id: "c1",
          left: { profileId: "cap_ram", fieldCode: "type" },
          operator: "equals",
          right: { literal: "ddr5" },
        },
        {
          id: "c2",
          left: { profileId: "cap_ram", fieldCode: "speed" },
          operator: "less_than",
          right: { literal: 4800 },
        },
      ],
      then: {
        status: "warning",
        message: "DDR5 speed below 4800 MHz — performance may be limited on Z790 boards.",
      },
      else: {
        status: "compatible",
        message: "RAM speed acceptable.",
      },
    },
    updatedAt: "2026-06-15",
  },
];

export function slugifyRuleCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
