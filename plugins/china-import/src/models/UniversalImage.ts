/** Universal image — provider-agnostic. */
export type UniversalImage = {
  id: string;
  url: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  position: number;
};
