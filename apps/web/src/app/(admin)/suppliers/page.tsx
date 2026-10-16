"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SuppliersListScreen } from "@/components/suppliers/suppliers-list-screen";
import {
  PurchaseModuleNavbar,
  PurchaseModuleBody,
} from "@/components/purchase/purchase-module-chrome";
import { PartyModuleNavbar, PartyModuleBody } from "@/components/party/party-module-chrome";
import { RouteContentTransition } from "@/components/layout/route-content-transition";

/**
 * Same /suppliers URL and datatable no matter where it's opened from — but the
 * calling module's own top navbar stays up, via ?from=purchase|party. No
 * search param (direct link/bookmark) renders bare, with no module chrome.
 */
const MODULE_CHROME_CLASS =
  "-mx-3 -mt-3 -mb-3 flex h-full min-h-0 w-[calc(100%+1.5rem)] max-w-none flex-1 flex-col max-md:mb-0 lg:-mx-4 lg:-mt-4 lg:-mb-4 lg:w-[calc(100%+2rem)]";

function SuppliersPageContent() {
  const from = useSearchParams().get("from");

  if (from === "purchase") {
    return (
      <div className={MODULE_CHROME_CLASS}>
        <PurchaseModuleNavbar />
        <PurchaseModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
          <RouteContentTransition>
            <SuppliersListScreen />
          </RouteContentTransition>
        </PurchaseModuleBody>
      </div>
    );
  }

  if (from === "party") {
    return (
      <div className={MODULE_CHROME_CLASS}>
        <PartyModuleNavbar />
        <PartyModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
          <RouteContentTransition>
            <SuppliersListScreen />
          </RouteContentTransition>
        </PartyModuleBody>
      </div>
    );
  }

  return <SuppliersListScreen />;
}

export default function SuppliersPage() {
  return (
    <Suspense fallback={null}>
      <SuppliersPageContent />
    </Suspense>
  );
}
