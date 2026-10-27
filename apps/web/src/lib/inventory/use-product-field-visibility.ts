import { fetchModuleSettings } from "@/lib/api/module-settings";
import { mergeInventorySettings, type InventorySettingsValues } from "@/lib/inventory/inventory-settings";

export type ProductFieldVisibility = {
  barcodeType: boolean;
  businessLocations: boolean;
  manageStock: boolean;
  alertQuantity: boolean;
  unitType: boolean;
  tracking: boolean;
  category: boolean;
  brand: boolean;
  warranty: boolean;
  origin: boolean;
  costPrice: boolean;
  lastSellingPrice: boolean;
  weight: boolean;
  applicableTax: boolean;
  taxType: boolean;
  notForSelling: boolean;
  shortDescription: boolean;
  media: boolean;
  variants: boolean;
  digitalFiles: boolean;
  supplierMapping: boolean;
  openingStock: boolean;
};

/** Every field visible: used until the company's choice has loaded. */
export const ALL_PRODUCT_FIELDS_VISIBLE: ProductFieldVisibility = toVisibility(mergeInventorySettings(null));

/** Which Add Product fields the company has left visible, per /inventory/settings → Product Settings.
 * Falls back to everything visible when the settings can't be read. */
export async function fetchProductFieldVisibility(): Promise<ProductFieldVisibility> {
  try {
    const res = await fetchModuleSettings("inventory");
    return toVisibility(mergeInventorySettings(res.values));
  } catch {
    return ALL_PRODUCT_FIELDS_VISIBLE;
  }
}

function toVisibility(v: InventorySettingsValues): ProductFieldVisibility {
  return {
    barcodeType: v.product_field_barcode_type !== false,
    businessLocations: v.product_field_business_locations !== false,
    manageStock: v.product_field_manage_stock !== false,
    alertQuantity: v.product_field_alert_quantity !== false,
    unitType: v.product_field_unit_type !== false,
    tracking: v.product_field_tracking !== false,
    category: v.product_field_category !== false,
    brand: v.product_field_brand !== false,
    warranty: v.product_field_warranty !== false,
    origin: v.product_field_origin !== false,
    costPrice: v.product_field_cost_price !== false,
    lastSellingPrice: v.product_field_last_selling_price !== false,
    weight: v.product_field_weight !== false,
    applicableTax: v.product_field_applicable_tax !== false,
    taxType: v.product_field_tax_type !== false,
    notForSelling: v.product_field_not_for_selling !== false,
    shortDescription: v.product_field_short_description !== false,
    media: v.product_field_media !== false,
    variants: v.product_field_variants !== false,
    digitalFiles: v.product_field_digital_files !== false,
    supplierMapping: v.product_field_supplier_mapping !== false,
    openingStock: v.product_field_opening_stock !== false,
  };
}
