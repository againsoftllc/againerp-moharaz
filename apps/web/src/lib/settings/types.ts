export type SettingFieldType = "text" | "toggle" | "select" | "number" | "textarea";

export type SettingItemDef = {
  key: string;
  label: string;
  description?: string;
  type: SettingFieldType;
  options?: { label: string; value: string }[];
  defaultValue: string | boolean | number;
};

export type SettingGroupDef = {
  id: string;
  title: string;
  items: SettingItemDef[];
};

export type SettingSectionDef = {
  id: string;
  title: string;
  groups: SettingGroupDef[];
};

export type SettingCategoryDef = {
  id: string;
  title: string;
  description: string;
  sections: SettingSectionDef[];
};

export type SettingsLayer = "business" | "workspace" | "platform";

export type SettingValue = string | boolean | number;

export type SettingsChangeLog = {
  id: string;
  key: string;
  label: string;
  oldValue: SettingValue;
  newValue: SettingValue;
  changedBy: string;
  at: string;
  reason?: string;
};
