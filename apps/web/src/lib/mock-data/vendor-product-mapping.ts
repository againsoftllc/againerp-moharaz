/**
 * Canonical vendor ↔ catalog mapping (`purchase_vendor_items` + `inventory_supplier_items`).
 * Single source of truth — updates propagate to supplier catalog and product drawer.
 */

import { products } from "@/lib/mock-data/products";
import { suppliersSeed } from "@/lib/mock-data/suppliers";

export type SupplierStockStatus = "in_stock" | "low" | "out" | "unknown";

export type VendorProductMapping = {
  id: string;
  supplierId: string;
  /** Linked catalog product; null = vendor feed SKU not mapped to our catalog */
  productId: string | null;
  variantId: string | null;
  vendorSku: string;
  /** Supplier's product title (from feed or manual) */
  vendorTitle: string;
  vendorPrice: number;
  supplierStock: number;
  stockStatus: SupplierStockStatus;
  leadTimeDays: number;
  minOrderQty: number;
  /** Supplier warranty terms for this SKU */
  warranty?: string;
  /** Preferred supplier when creating PO for this product */
  isPreferred: boolean;
  /** Expose this supplier offer on storefront / dropship (not all mapped items go live) */
  isPublishedOnWeb: boolean;
  isMapped: boolean;
  lastSyncedAt: string | null;
  updatedAt: string;
  /** Supplier catalog SKU row — for PATCH cost/stock */
  supplierProductId?: string | null;
};

export const SUPPLIER_STOCK_STATUS_LABELS: Record<SupplierStockStatus, string> = {
  in_stock: "In stock",
  low: "Low stock",
  out: "Out of stock",
  unknown: "Unknown",
};

export const VENDOR_WARRANTY_OPTIONS = [
  "None",
  "3 months",
  "6 months",
  "1 year",
  "2 years",
  "3 years",
  "Manufacturer warranty",
] as const;

function supplierName(id: string) {
  return suppliersSeed.find((s) => s.id === id)?.name ?? id;
}

function productLabel(productId: string | null, variantId: string | null) {
  if (!productId) return null;
  const product = products.find((p) => p.id === productId);
  if (!product) return productId;
  if (variantId) return `${product.name} (${variantId})`;
  return product.name;
}

export type EnrichedVendorMapping = VendorProductMapping & {
  supplierName: string;
  productName: string | null;
  productSku: string | null;
  retailPrice: number | null;
  marginPct: number | null;
};

export function enrichMapping(m: VendorProductMapping): EnrichedVendorMapping {
  const product = m.productId ? products.find((p) => p.id === m.productId) : undefined;
  const retail = product?.price ?? null;
  const marginPct =
    retail && retail > 0 ? Math.round(((retail - m.vendorPrice) / retail) * 100) : null;

  return {
    ...m,
    supplierName: supplierName(m.supplierId),
    productName: productLabel(m.productId, m.variantId),
    productSku: product?.sku ?? null,
    retailPrice: retail,
    marginPct,
  };
}

export const vendorMappingSeed: VendorProductMapping[] = [
  // ── Wireless Earbuds Pro — 2 suppliers, different cost + stock ──
  {
    id: "vpm_001",
    supplierId: "sup_001",
    productId: "prod_0002",
    variantId: "v1",
    vendorSku: "TP-WE-PRO",
    vendorTitle: "Wireless Earbuds Pro",
    vendorPrice: 1850,
    supplierStock: 420,
    stockStatus: "in_stock",
    leadTimeDays: 5,
    minOrderQty: 50,
    isPreferred: true,
    isPublishedOnWeb: true,
    isMapped: true,
    warranty: "1 year",
    lastSyncedAt: "2026-06-15T10:00:00",
    updatedAt: "2026-06-15",
  },
  {
    id: "vpm_002",
    supplierId: "sup_004",
    productId: "prod_0002",
    variantId: "v1",
    vendorSku: "SZ-WE-PRO",
    vendorTitle: "TWS Earbuds Pro (export)",
    vendorPrice: 1720,
    supplierStock: 186,
    stockStatus: "in_stock",
    leadTimeDays: 25,
    minOrderQty: 20,
    isPreferred: false,
    isPublishedOnWeb: false,
    isMapped: true,
    lastSyncedAt: "2026-06-14T02:00:00",
    updatedAt: "2026-06-14",
  },
  {
    id: "vpm_003",
    supplierId: "sup_001",
    productId: "prod_0002",
    variantId: "v2",
    vendorSku: "TP-WE-PRO-SLV",
    vendorTitle: "Wireless Earbuds Pro — Silver",
    vendorPrice: 1920,
    supplierStock: 85,
    stockStatus: "low",
    leadTimeDays: 5,
    minOrderQty: 50,
    isPreferred: true,
    isPublishedOnWeb: true,
    isMapped: true,
    warranty: "1 year",
    lastSyncedAt: "2026-06-15T10:00:00",
    updatedAt: "2026-06-15",
  },
  // ── USB-C Hub — 3 suppliers ──
  {
    id: "vpm_004",
    supplierId: "sup_001",
    productId: "prod_0014",
    variantId: "v1",
    vendorSku: "TP-HUB7",
    vendorTitle: "USB-C Hub 7-in-1",
    vendorPrice: 2200,
    supplierStock: 310,
    stockStatus: "in_stock",
    leadTimeDays: 7,
    minOrderQty: 30,
    isPreferred: true,
    isPublishedOnWeb: true,
    isMapped: true,
    warranty: "1 year",
    lastSyncedAt: "2026-06-15T10:00:00",
    updatedAt: "2026-06-15",
  },
  {
    id: "vpm_005",
    supplierId: "sup_004",
    productId: "prod_0014",
    variantId: "v1",
    vendorSku: "SZ-HUB7",
    vendorTitle: "7-Port USB-C Hub",
    vendorPrice: 1980,
    supplierStock: 0,
    stockStatus: "out",
    leadTimeDays: 22,
    minOrderQty: 50,
    isPreferred: false,
    isPublishedOnWeb: false,
    isMapped: true,
    lastSyncedAt: "2026-06-14T02:00:00",
    updatedAt: "2026-06-14",
  },
  {
    id: "vpm_006",
    supplierId: "sup_002",
    productId: "prod_0014",
    variantId: "v1",
    vendorSku: "UW-HUB-ACC",
    vendorTitle: "Accessory Hub (OEM)",
    vendorPrice: 2450,
    supplierStock: 45,
    stockStatus: "low",
    leadTimeDays: 14,
    minOrderQty: 25,
    isPreferred: false,
    isPublishedOnWeb: false,
    isMapped: true,
    lastSyncedAt: "2026-06-13T08:00:00",
    updatedAt: "2026-06-13",
  },
  // ── Smart Watch — 2 suppliers ──
  {
    id: "vpm_007",
    supplierId: "sup_004",
    productId: "prod_0005",
    variantId: "v1",
    vendorSku: "SZ-SWX-01",
    vendorTitle: "Smart Watch Series X",
    vendorPrice: 4200,
    supplierStock: 92,
    stockStatus: "in_stock",
    leadTimeDays: 25,
    minOrderQty: 20,
    isPreferred: true,
    isPublishedOnWeb: true,
    isMapped: true,
    lastSyncedAt: "2026-06-14T02:00:00",
    updatedAt: "2026-06-14",
  },
  {
    id: "vpm_008",
    supplierId: "sup_001",
    productId: "prod_0005",
    variantId: "v1",
    vendorSku: "TP-SW-05",
    vendorTitle: "Smart Watch Series 5 (dist.)",
    vendorPrice: 4580,
    supplierStock: 28,
    stockStatus: "low",
    leadTimeDays: 7,
    minOrderQty: 15,
    isPreferred: false,
    isPublishedOnWeb: false,
    isMapped: true,
    lastSyncedAt: "2026-06-15T10:00:00",
    updatedAt: "2026-06-15",
  },
  // ── Bluetooth Speaker — single supplier ──
  {
    id: "vpm_009",
    supplierId: "sup_001",
    productId: "prod_0007",
    variantId: "v1",
    vendorSku: "TP-BSM",
    vendorTitle: "Bluetooth Speaker Mini",
    vendorPrice: 1450,
    supplierStock: 560,
    stockStatus: "in_stock",
    leadTimeDays: 5,
    minOrderQty: 40,
    isPreferred: true,
    isPublishedOnWeb: true,
    isMapped: true,
    warranty: "1 year",
    lastSyncedAt: "2026-06-15T10:00:00",
    updatedAt: "2026-06-15",
  },
  // ── Cotton T-Shirt — GlowUp only ──
  {
    id: "vpm_010",
    supplierId: "sup_003",
    productId: "prod_0001",
    variantId: "v1",
    vendorSku: "GU-TSH-N",
    vendorTitle: "Cotton T-Shirt — Navy",
    vendorPrice: 320,
    supplierStock: 1200,
    stockStatus: "in_stock",
    leadTimeDays: 8,
    minOrderQty: 100,
    isPreferred: true,
    isPublishedOnWeb: true,
    isMapped: true,
    lastSyncedAt: "2026-06-13T12:00:00",
    updatedAt: "2026-06-13",
  },
  // ── Unmapped vendor feed SKUs (not on our website) ──
  {
    id: "vpm_u01",
    supplierId: "sup_001",
    productId: null,
    variantId: null,
    vendorSku: "TP-CABLE-USB",
    vendorTitle: "USB Cable Bulk Pack (100pc)",
    vendorPrice: 45,
    supplierStock: 2000,
    stockStatus: "in_stock",
    leadTimeDays: 3,
    minOrderQty: 100,
    isPreferred: false,
    isPublishedOnWeb: false,
    isMapped: false,
    lastSyncedAt: "2026-06-15T10:00:00",
    updatedAt: "2026-06-15",
  },
  {
    id: "vpm_u02",
    supplierId: "sup_001",
    productId: null,
    variantId: null,
    vendorSku: "TP-PWR-ADP",
    vendorTitle: "Power Adapter 65W OEM",
    vendorPrice: 380,
    supplierStock: 340,
    stockStatus: "in_stock",
    leadTimeDays: 5,
    minOrderQty: 50,
    isPreferred: false,
    isPublishedOnWeb: false,
    isMapped: false,
    lastSyncedAt: "2026-06-15T10:00:00",
    updatedAt: "2026-06-15",
  },
  {
    id: "vpm_u03",
    supplierId: "sup_004",
    productId: null,
    variantId: null,
    vendorSku: "SZ-MISC-LED",
    vendorTitle: "LED Strip 5m (wholesale)",
    vendorPrice: 220,
    supplierStock: 800,
    stockStatus: "in_stock",
    leadTimeDays: 20,
    minOrderQty: 100,
    isPreferred: false,
    isPublishedOnWeb: false,
    isMapped: false,
    lastSyncedAt: "2026-06-14T02:00:00",
    updatedAt: "2026-06-14",
  },
  {
    id: "vpm_u04",
    supplierId: "sup_004",
    productId: null,
    variantId: null,
    vendorSku: "SZ-PB20",
    vendorTitle: "Power Bank 20000mAh",
    vendorPrice: 1100,
    supplierStock: 186,
    stockStatus: "in_stock",
    leadTimeDays: 20,
    minOrderQty: 50,
    isPreferred: false,
    isPublishedOnWeb: false,
    isMapped: false,
    lastSyncedAt: "2026-06-14T02:00:00",
    updatedAt: "2026-06-14",
  },
];

export function getMappingsForProduct(
  mappings: VendorProductMapping[],
  productId: string,
  variantId?: string | null,
) {
  return mappings.filter(
    (m) =>
      m.isMapped &&
      m.productId === productId &&
      (variantId == null || m.variantId === variantId || m.variantId === null),
  );
}

export function getMappingsForSupplier(mappings: VendorProductMapping[], supplierId: string) {
  return mappings.filter((m) => m.supplierId === supplierId);
}

export function getMappedCountForSupplier(mappings: VendorProductMapping[], supplierId: string) {
  return mappings.filter((m) => m.supplierId === supplierId && m.isMapped).length;
}

export function getUnmappedCountForSupplier(mappings: VendorProductMapping[], supplierId: string) {
  return mappings.filter((m) => m.supplierId === supplierId && !m.isMapped).length;
}

export function formatBdt(amount: number) {
  return `৳${amount.toLocaleString("en-BD")}`;
}

export function stockStatusVariant(
  status: SupplierStockStatus,
): "success" | "warning" | "muted" | "secondary" {
  if (status === "in_stock") return "success";
  if (status === "low") return "warning";
  if (status === "out") return "muted";
  return "secondary";
}

export function resolveSupplierStockStatus(stock: number): SupplierStockStatus {
  if (stock <= 0) return "out";
  if (stock < 25) return "low";
  return "in_stock";
}

export function hasProductSupplierMapping(
  mappings: VendorProductMapping[],
  supplierId: string,
  productId: string,
  variantId: string | null,
) {
  return mappings.some(
    (m) =>
      m.isMapped &&
      m.supplierId === supplierId &&
      m.productId === productId &&
      m.variantId === variantId,
  );
}

export type MapSupplierInput = {
  supplierId: string;
  productId: string;
  variantId: string | null;
  vendorSku: string;
  vendorTitle: string;
  vendorPrice: number;
  supplierStock: number;
  stockStatus?: SupplierStockStatus;
  leadTimeDays: number;
  minOrderQty: number;
  warranty?: string;
  isPreferred?: boolean;
  isPublishedOnWeb?: boolean;
};

export function createProductSupplierMapping(
  input: MapSupplierInput,
): VendorProductMapping {
  return {
    id: `vpm_${Date.now()}`,
    supplierId: input.supplierId,
    productId: input.productId,
    variantId: input.variantId,
    vendorSku: input.vendorSku.trim(),
    vendorTitle: input.vendorTitle.trim(),
    vendorPrice: input.vendorPrice,
    supplierStock: input.supplierStock,
    stockStatus: input.stockStatus ?? resolveSupplierStockStatus(input.supplierStock),
    leadTimeDays: input.leadTimeDays,
    minOrderQty: input.minOrderQty,
    warranty: input.warranty ?? "1 year",
    isPreferred: input.isPreferred ?? false,
    isPublishedOnWeb: input.isPublishedOnWeb ?? false,
    isMapped: true,
    lastSyncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}
