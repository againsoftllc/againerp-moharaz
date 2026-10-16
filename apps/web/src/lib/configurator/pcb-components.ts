/** Rule bodies refer to a part by a stable component id ("cap_cpu"…) rather than a
 * slot id — the same ids apps/api/app/services/pc_builder_rules.py SLOT_TO_COMPONENT
 * uses. Each maps to the builder slot with this slug. */
export const CAP_BY_SLUG: Record<string, string> = {
  cpu: "cap_cpu",
  motherboard: "cap_mobo",
  memory: "cap_ram",
  "cpu-cooler": "cap_cooler",
  casing: "cap_case",
  "power-supply": "cap_psu",
  "graphics-card": "cap_gpu",
  storage: "cap_storage",
  monitor: "cap_monitor",
};
