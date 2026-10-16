import type { ProviderId } from "../core/types";
import type { UniversalAttribute } from "./UniversalAttribute";
import type { UniversalBrand } from "./UniversalBrand";
import type { UniversalCategory } from "./UniversalCategory";
import type { UniversalImage } from "./UniversalImage";
import type { UniversalSupplier } from "./UniversalSupplier";
import type { UniversalVariant } from "./UniversalVariant";

export type UniversalStockStatus = "in_stock" | "out_of_stock" | "low_stock" | "unknown";

export type UniversalProductStatus = "active" | "inactive" | "draft" | "unknown";

export type UniversalDimensions = {
  length?: number;
  width?: number;
  height?: number;
  unit?: string;
};

export type UniversalVideo = {
  id: string;
  url: string;
  thumbnail?: string;
  duration?: number;
};

/**
 * Universal Product — the only product shape the ERP should ever see.
 * Provider-specific fields live in rawData only.
 */
export type UniversalProduct = {
  id: string;
  provider: ProviderId;
  providerProductId: string;

  title: string;
  subtitle?: string;
  shortDescription?: string;
  description?: string;

  brand?: UniversalBrand;
  category?: UniversalCategory;
  supplier?: UniversalSupplier;

  currency: string;
  basePrice: number;
  salePrice?: number;

  weight?: number;
  dimensions?: UniversalDimensions;
  originCountry?: string;

  stockStatus: UniversalStockStatus;
  minimumOrder?: number;
  unit?: string;

  status: UniversalProductStatus;
  createdAt?: string;
  updatedAt?: string;

  images: UniversalImage[];
  videos: UniversalVideo[];
  variants: UniversalVariant[];
  attributes: UniversalAttribute[];

  /** Original provider JSON — never discarded. */
  rawData: unknown;
};

export type { UniversalImage, UniversalVariant, UniversalCategory, UniversalBrand, UniversalSupplier, UniversalAttribute };
