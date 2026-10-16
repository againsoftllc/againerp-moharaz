import type { PcBuilderSelection } from "@/lib/builder/types";
import type { SavedBuild } from "@/lib/configurator/types";
import type { ErpBuildInput } from "@/lib/configurator/erp/types";
import { getPcProductById } from "@/lib/mock-data/pc-builder-products";

export function savedBuildToErpInput(build: SavedBuild): ErpBuildInput {
  return {
    buildId: build.id,
    buildCode: build.buildCode,
    name: build.name,
    profileName: build.profileName,
    customerName: build.customerName ?? build.userName,
    components: build.components.map((c) => ({
      categoryName: c.categoryName,
      productId: c.productId,
      productName: c.productName,
      quantity: c.quantity,
    })),
    totalPrice: build.totalPrice,
    compatibilityStatus: build.compatibilityStatus,
  };
}

export function pcSelectionsToErpInput(
  buildId: string,
  buildCode: string,
  name: string,
  selections: PcBuilderSelection[],
  totalPrice: number,
  compatibilityStatus: "compatible" | "warning" | "incompatible",
): ErpBuildInput {
  return {
    buildId,
    buildCode,
    name,
    profileName: "PC Builder",
    components: selections.map((s) => {
      const product = getPcProductById(s.productId);
      return {
        categoryName: s.stepId.toUpperCase(),
        productId: s.productId,
        productName: s.productName,
        quantity: 1,
        unitPrice: s.price,
        image: s.image,
        sku: product?.slug,
      };
    }),
    totalPrice,
    compatibilityStatus,
  };
}

export function erpInputToOrderLines(input: ErpBuildInput) {
  return input.components
    .filter((c) => c.productName)
    .map((c, i) => ({
      id: `line_${i}`,
      productId: c.productId ?? `prod_${i}`,
      name: c.productName ?? c.categoryName,
      sku: c.sku ?? c.productId ?? `SKU-${i}`,
      imageUrl: c.image,
      quantity: c.quantity,
      unitPrice: c.unitPrice ?? 0,
      discount: 0,
      tax: 0,
      lineTotal: (c.unitPrice ?? 0) * c.quantity,
    }));
}
