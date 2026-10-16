/** Universal attribute — Color, Size, Material, Model, Specification, or custom. */
export type UniversalAttributeKind =
  | "color"
  | "size"
  | "material"
  | "model"
  | "specification"
  | "custom";

export type UniversalAttribute = {
  id: string;
  name: string;
  value: string;
  kind: UniversalAttributeKind;
  group?: string;
};
