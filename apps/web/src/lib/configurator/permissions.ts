/** Frontend permission keys for Product Configurator admin */

export const CONFIGURATOR_PERMISSIONS = {
  view: "configurator.view",
  create: "configurator.create",
  edit: "configurator.edit",
  delete: "configurator.delete",
  recommend: "configurator.recommend",
  ai: "configurator.ai.use",
} as const;

export type ConfiguratorPermission = (typeof CONFIGURATOR_PERMISSIONS)[keyof typeof CONFIGURATOR_PERMISSIONS];

/** Prototype: all permissions granted. Wire to role store in production. */
const GRANTED: ConfiguratorPermission[] = Object.values(CONFIGURATOR_PERMISSIONS);

export function hasConfiguratorPermission(permission: ConfiguratorPermission): boolean {
  return GRANTED.includes(permission);
}

export function requireConfiguratorPermission(permission: ConfiguratorPermission): boolean {
  if (!hasConfiguratorPermission(permission)) return false;
  return true;
}
