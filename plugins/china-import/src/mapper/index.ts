export { mapProduct, type MappingResult } from "./ProductMapper";
export { mapVariants as mapVariant, mapAttributes } from "./VariantMapper";
export { mapBrand, mapBrands } from "./BrandMapper";
export { mapCategory, mapCategories } from "./CategoryMapper";
export { mapSupplier, mapSuppliers } from "./SupplierMapper";
export { mapImages, mapVideos } from "./ImageMapper";
export {
  validateProduct,
  validateImage,
  validateVariantPrice,
  type ValidationResult,
  type ValidationIssue,
  type FieldTrace,
} from "./validation";
export * from "./normalize";
