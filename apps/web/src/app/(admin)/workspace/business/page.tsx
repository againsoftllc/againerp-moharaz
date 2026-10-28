"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Customers, Payments & Shipping moved under Website › Configuration (payments and shipping only drive the storefront checkout). */
function Redirect() {
  const router = useRouter();
  const tab = useSearchParams().get("tab");
  useEffect(() => {
    router.replace(tab ? `/website/settings/checkout?tab=${encodeURIComponent(tab)}` : "/website/settings/checkout");
  }, [router, tab]);
  return null;
}

export default function BusinessSettingsPage() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
