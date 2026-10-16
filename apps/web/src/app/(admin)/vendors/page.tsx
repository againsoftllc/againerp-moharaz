"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VendorsListScreen } from "@/components/vendors/vendors-list-screen";
import { VendorModuleNavbar, VendorModuleBody } from "@/components/vendors/vendor-module-chrome";
import { PartyModuleNavbar, PartyModuleBody } from "@/components/party/party-module-chrome";
import { RouteContentTransition } from "@/components/layout/route-content-transition";

/**
 * Same /vendors URL and datatable no matter where it's opened from — but the
 * calling module's own top navbar stays up, via ?from=party. No search param
 * (direct link/bookmark) renders the Vendors module's own navbar as before.
 */
function VendorsPageContent() {
  const from = useSearchParams().get("from");

  if (from === "party") {
    return (
      <>
        <PartyModuleNavbar />
        <PartyModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
          <RouteContentTransition>
            <VendorsListScreen />
          </RouteContentTransition>
        </PartyModuleBody>
      </>
    );
  }

  return (
    <>
      <VendorModuleNavbar />
      <VendorModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <RouteContentTransition>
          <VendorsListScreen />
        </RouteContentTransition>
      </VendorModuleBody>
    </>
  );
}

export default function VendorsPage() {
  return (
    <Suspense fallback={null}>
      <VendorsPageContent />
    </Suspense>
  );
}
