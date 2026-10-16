"use client";

import { Suspense } from "react";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { MarketingHappyHourPanel } from "@/components/website/marketing/marketing-happy-hour-panel";

function HappyHourContent() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-base font-semibold text-foreground">Happy Hour</h1>
        <p className="text-sm text-muted-foreground">
          Nightly time-boxed deals with hand-picked products and campaign prices.
        </p>
      </div>
      <MarketingHappyHourPanel />
    </div>
  );
}

export default function WebsiteMarketingHappyHourPage() {
  return (
    <Suspense fallback={<ContentDataSkeleton label="Loading Happy Hour…" />}>
      <HappyHourContent />
    </Suspense>
  );
}
