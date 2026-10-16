"use client";

import { Suspense } from "react";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { MarketingCouponsPanel } from "@/components/website/marketing/marketing-coupons-panel";

function CouponsContent() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-base font-semibold text-foreground">Coupons</h1>
        <p className="text-sm text-muted-foreground">
          Promo codes for cart and checkout discounts.
        </p>
      </div>
      <MarketingCouponsPanel />
    </div>
  );
}

export default function WebsiteMarketingCouponsPage() {
  return (
    <Suspense fallback={<ContentDataSkeleton label="Loading coupons…" />}>
      <CouponsContent />
    </Suspense>
  );
}
