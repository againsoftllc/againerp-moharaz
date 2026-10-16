import type { UniversalAttribute } from "./UniversalAttribute";
import type { UniversalImage } from "./UniversalImage";

/** Universal product variant / SKU. */
export type UniversalVariant = {
  id: string;
  sku: string;
  barcode?: string;
  attributes: UniversalAttribute[];
  price: number;
  salePrice?: number;
  stock?: number;
  weight?: number;
  image?: UniversalImage;
};
