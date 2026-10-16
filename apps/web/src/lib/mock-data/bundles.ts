export type BundleStatus = "draft" | "published" | "archived";

export type BundlePricingMode = "fixed" | "sum_discount";

export type BundleItem = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  isOptional: boolean;
  thumbnail?: string;
};

export type ProductBundle = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  status: BundleStatus;
  pricingMode: BundlePricingMode;
  bundlePrice: number;
  discountPercent: number;
  retailTotal: number;
  componentCount: number;
  componentsSummary: string;
  stock: number;
  thumbnail?: string;
  category: string;
  updatedAt: string;
  description?: string;
  components: BundleItem[];
};

export const BUNDLE_STATUS_LABELS: Record<BundleStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export const BUNDLE_PRICING_LABELS: Record<BundlePricingMode, string> = {
  fixed: "Fixed price",
  sum_discount: "Sum − discount",
};

function calcRetailTotal(items: BundleItem[]) {
  return items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
}

function calcBundlePrice(
  retail: number,
  mode: BundlePricingMode,
  fixed: number,
  discountPercent: number,
) {
  if (mode === "fixed") return fixed;
  return Math.round(retail * (1 - discountPercent / 100));
}

function summaryFromItems(items: BundleItem[]) {
  const names = items.slice(0, 3).map((i) => i.productName.split(" ")[0]);
  const extra = items.length > 3 ? ` +${items.length - 3}` : "";
  return `${items.length} items · ${names.join(" + ")}${extra}`;
}

/** @deprecated Bundles load from `/api/v1/catalog/bundles` */
export const bundlesSeed: ProductBundle[] = [];

export function formatBdt(amount: number) {
  return `৳${amount.toLocaleString("en-BD")}`;
}

export function bundleSavings(bundle: ProductBundle) {
  return Math.max(0, bundle.retailTotal - bundle.bundlePrice);
}

export function bundleSavingsPercent(bundle: ProductBundle) {
  if (bundle.retailTotal <= 0) return 0;
  return Math.round((bundleSavings(bundle) / bundle.retailTotal) * 100);
}

export function recalcBundle(
  bundle: Partial<ProductBundle> & { components: BundleItem[] },
): Pick<
  ProductBundle,
  "retailTotal" | "bundlePrice" | "componentCount" | "componentsSummary"
> {
  const retailTotal = calcRetailTotal(bundle.components);
  const pricingMode = bundle.pricingMode ?? "fixed";
  const discountPercent = bundle.discountPercent ?? 0;
  const bundlePrice = calcBundlePrice(
    retailTotal,
    pricingMode,
    bundle.bundlePrice ?? retailTotal,
    discountPercent,
  );
  return {
    retailTotal,
    bundlePrice,
    componentCount: bundle.components.length,
    componentsSummary: summaryFromItems(bundle.components),
  };
}
