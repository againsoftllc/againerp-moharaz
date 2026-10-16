import type { CommerceMvpRun } from "@/lib/commerce/commerce-audit.types";

export type BrandOutcomeStatus = "existing" | "created" | "skipped" | "unknown";

export type CommerceRunOutcome = {
  name?: string;
  sku?: string;
  price?: { amount: number; currency: string };
  compareAtPrice?: number;
  brand?: { name: string; status: BrandOutcomeStatus };
  categoryPath?: string[];
  imagesCount?: number;
  attributesTotal?: number;
  attributesCreated?: number;
};

function readCanonicalString(canonical: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = canonical?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function brandFromCanonical(canonical: Record<string, unknown> | undefined): string | undefined {
  const brand = canonical?.brand as { name?: string } | undefined;
  return brand?.name?.trim() || undefined;
}

function categoryPathFromCanonical(canonical: Record<string, unknown> | undefined): string[] {
  const category = canonical?.category as { path?: string[] } | undefined;
  return Array.isArray(category?.path) ? category.path.filter(Boolean) : [];
}

function priceFromCanonical(canonical: Record<string, unknown> | undefined) {
  const price = canonical?.price as { amount?: number; currency?: string } | undefined;
  const amount = Number(price?.amount);
  if (!Number.isFinite(amount)) return undefined;
  return { amount, currency: price?.currency?.trim() || "BDT" };
}

function attributeCountFromCanonical(canonical: Record<string, unknown> | undefined): number {
  const specs = canonical?.specifications;
  if (!Array.isArray(specs)) return 0;
  return specs.reduce((total, group) => {
    const items = (group as { items?: unknown[] }).items;
    return total + (Array.isArray(items) ? items.length : 0);
  }, 0);
}

/** Derive TC-010 product summary from MVP run audit + canonical snapshot. */
export function deriveRunOutcome(run: CommerceMvpRun): CommerceRunOutcome {
  const canonical = run.canonical;
  const outcome: CommerceRunOutcome = {
    name: run.productName ?? readCanonicalString(canonical, "name"),
    sku: run.productSku ?? readCanonicalString(canonical, "sku"),
    price: priceFromCanonical(canonical),
    brand: brandFromCanonical(canonical)
      ? { name: brandFromCanonical(canonical)!, status: "unknown" }
      : undefined,
    categoryPath: categoryPathFromCanonical(canonical),
    attributesTotal: attributeCountFromCanonical(canonical),
    attributesCreated: 0,
  };

  const compareAt = (
    canonical?.metadata as { extensions?: { compareAtPrice?: { amount?: number } } } | undefined
  )?.extensions?.compareAtPrice?.amount;
  if (Number.isFinite(Number(compareAt))) {
    outcome.compareAtPrice = Number(compareAt);
  }

  for (const entry of run.audit) {
    if (entry.phase !== "erp") continue;

    if (entry.step.startsWith("erp.brand")) {
      const brandName = (entry.detail?.brandName as string | undefined) ?? outcome.brand?.name;
      if (entry.message.includes("skipped")) {
        outcome.brand = { name: brandName ?? "—", status: "skipped" };
      } else if (entry.detail?.created === true) {
        outcome.brand = { name: brandName ?? outcome.brand?.name ?? "—", status: "created" };
      } else if (entry.detail?.created === false || entry.message.includes("resolved")) {
        outcome.brand = { name: brandName ?? outcome.brand?.name ?? "—", status: "existing" };
      }
    }

    if (entry.step === "erp.category" && entry.detail?.path) {
      const path = entry.detail.path as string[];
      if (Array.isArray(path) && path.length) outcome.categoryPath = path;
    }

    if (entry.step === "erp.images") {
      const count = entry.detail?.imageCount ?? entry.detail?.count ?? entry.detail?.mediaIds;
      if (typeof count === "number") outcome.imagesCount = count;
      else if (Array.isArray(count)) outcome.imagesCount = count.length;
    }

    if (entry.step.startsWith("erp.attributes") && typeof entry.detail?.attributesCreated === "number") {
      outcome.attributesCreated = entry.detail.attributesCreated as number;
    } else if (entry.step.startsWith("erp.attributes") && entry.detail?.created === true) {
      outcome.attributesCreated = Number(entry.detail.fieldCount ?? outcome.attributesTotal ?? 0);
    }
  }

  if (outcome.imagesCount == null) {
    const images = canonical?.images;
    if (Array.isArray(images)) outcome.imagesCount = images.length;
  }

  return outcome;
}
