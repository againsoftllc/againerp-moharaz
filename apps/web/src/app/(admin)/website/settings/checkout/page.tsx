"use client";

import { Suspense } from "react";
import { BusinessSettingsHome } from "@/components/settings/business-settings-home";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

/**
 * Website › Configuration › Customers, Payments & Shipping.
 * Payments and Shipping only feed the storefront checkout. Customers holds the account / profile switches the
 * Customers module (Customers › Settings) reads too, so a change there also shows in the ERP.
 */
export default function WebsiteCheckoutSettingsPage() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto p-3 lg:p-4">
      <Suspense fallback={<ContentDataSkeleton />}>
        <BusinessSettingsHome />
      </Suspense>
    </div>
  );
}
