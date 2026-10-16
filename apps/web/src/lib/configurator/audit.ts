import { useActivityStore } from "@/lib/store/activity-store";
import type { ActivityEntityType, ActivityFieldChange } from "@/lib/activity/types";

export type ConfiguratorEntityType =
  | "configurator_profile"
  | "configurator_category"
  | "configurator_rule"
  | "configurator_template"
  | "configurator_build";

const ENTITY_MAP: Record<ConfiguratorEntityType, ActivityEntityType> = {
  configurator_profile: "configurator_profile",
  configurator_category: "configurator_category",
  configurator_rule: "configurator_rule",
  configurator_template: "configurator_template",
  configurator_build: "configurator_build",
};

export function logConfiguratorActivity(
  entityType: ConfiguratorEntityType,
  entityId: string,
  action: "create" | "update" | "delete" | "status_change" | "export",
  title: string,
  options?: {
    description?: string;
    fieldChanges?: ActivityFieldChange[];
  },
) {
  useActivityStore.getState().logActivity({
    entityType: ENTITY_MAP[entityType],
    entityId,
    actionType: action === "export" ? "export" : action,
    title,
    description: options?.description,
    fieldChanges: options?.fieldChanges,
    actor: "Admin",
    actorInitials: "AD",
    at: new Date().toISOString(),
  });
}

export function bulkLogConfiguratorActivity(
  entityType: ConfiguratorEntityType,
  ids: string[],
  action: "delete" | "status_change" | "export",
  title: string,
) {
  for (const id of ids) {
    logConfiguratorActivity(entityType, id, action, title);
  }
}
