export type PluginFieldType = "text" | "toggle" | "select" | "password" | "url" | "number";

export type PluginFieldDef = {
  key: string;
  label: string;
  description?: string;
  type: PluginFieldType;
  defaultValue: string | boolean | number;
  options?: { label: string; value: string }[];
  placeholder?: string;
  required?: boolean;
};

export type PluginSectionDef = {
  id: string;
  title: string;
  description?: string;
  fields: PluginFieldDef[];
};

export type PluginCategory = "shipping" | "payment" | "marketing" | "accounting" | "communication" | "other";

export type PluginDef = {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  category: PluginCategory;
  version: string;
  author: string;
  website?: string;
  docsUrl?: string;
  /** Full-screen plugin app route (e.g. /plugins/china-import). */
  appHref?: string;
  brandColor: string;
  sections: PluginSectionDef[];
};

export type PluginInstallState = {
  installed: boolean;
  enabled: boolean;
  config: Record<string, string | boolean | number>;
  installedAt?: string;
  updatedAt?: string;
};

export type PluginChangeLog = {
  id: string;
  pluginId: string;
  label: string;
  oldValue: string | boolean | number;
  newValue: string | boolean | number;
  changedBy: string;
  at: string;
};
