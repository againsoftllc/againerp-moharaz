"use client";

import { Check, Minus } from "lucide-react";
import type { Product } from "@/lib/mock-data/products";
import {
  getWebsiteVisibility,
  websiteBlockReasonLabel,
} from "@/lib/catalog/website-visibility";

type Props = {
  product: Product;
  size?: "sm" | "md";
};

export function WebsiteBadge({ product, size = "md" }: Props) {
  const { onWebsite, reason } = getWebsiteVisibility(product);
  const title = onWebsite
    ? "Live on website"
    : reason
      ? `Not on website — ${websiteBlockReasonLabel(reason)}`
      : "Not on website";

  const dim = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const icon = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  if (onWebsite) {
    return (
      <span
        title={title}
        className={`inline-flex ${dim} items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400`}
        aria-label={title}
      >
        <Check className={icon} strokeWidth={2.5} />
      </span>
    );
  }

  return (
    <span
      title={title}
      className={`inline-flex ${dim} items-center justify-center rounded-full bg-muted text-muted-foreground`}
      aria-label={title}
    >
      <Minus className={icon} />
    </span>
  );
}
