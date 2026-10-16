"use client";

import { Suspense } from "react";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { MarketingOffersPanel } from "@/components/website/marketing/marketing-offers-panel";

function OffersContent() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-base font-semibold text-foreground">Offers</h1>
        <p className="text-sm text-muted-foreground">
          BOGO, bundles, gifts, and tiered deals for the storefront.
        </p>
      </div>
      <MarketingOffersPanel />
    </div>
  );
}

export default function WebsiteMarketingOffersPage() {
  return (
    <Suspense fallback={<ContentDataSkeleton label="Loading offers…" />}>
      <OffersContent />
    </Suspense>
  );
}
