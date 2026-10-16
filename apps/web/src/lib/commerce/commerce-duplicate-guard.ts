import type { CommerceMvpRun } from "@/lib/commerce/commerce-audit.types";
import { findCompletedRunBySourceUrl } from "@/lib/commerce/commerce-mvp-run.store";

export type DuplicateImportHit = {
  runId: string;
  sourceUrl: string;
  productId?: string;
  productName?: string;
  productSku?: string;
  productPageUrl?: string;
  completedAt?: number;
};

export async function findDuplicateImport(sourceUrl: string): Promise<DuplicateImportHit | null> {
  const normalized = sourceUrl.trim().replace(/\/+$/, "");
  const run = await findCompletedRunBySourceUrl(normalized);
  if (!run?.productId) return null;

  return {
    runId: run.id,
    sourceUrl: run.sourceUrl,
    productId: run.productId,
    productName: run.productName,
    productSku: run.productSku,
    productPageUrl: run.productPageUrl,
    completedAt: run.completedAt,
  };
}

export function duplicateImportMessage(hit: DuplicateImportHit): string {
  const label = hit.productName ?? hit.productSku ?? hit.productId ?? "this product";
  return `This URL was already imported as **${label}**. Open the existing product or paste a different link.`;
}

export function duplicateImportFromRun(run: CommerceMvpRun): DuplicateImportHit | null {
  if (run.status !== "completed" || !run.productId) return null;
  return {
    runId: run.id,
    sourceUrl: run.sourceUrl,
    productId: run.productId,
    productName: run.productName,
    productSku: run.productSku,
    productPageUrl: run.productPageUrl,
    completedAt: run.completedAt,
  };
}
