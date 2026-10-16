"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CustomersListScreen } from "@/components/customers/customers-list-screen";
import { PartyModuleNavbar, PartyModuleBody } from "@/components/party/party-module-chrome";
import { RouteContentTransition } from "@/components/layout/route-content-transition";

/**
 * Same /customers URL and datatable no matter where it's opened from — but the
 * calling module's own top navbar stays up, via ?from=party. No search param
 * (direct link/bookmark) renders the Customers module's own navbar as before.
 *
 * No extra edge-to-edge wrapper here — `customers/layout.tsx` already cancels
 * the (admin) shell's padding for every /customers/* route. Re-applying the
 * same negative-margin/width-calc trick here would compound it and push
 * content past the page edge.
 */
function CustomersPageContent() {
  const from = useSearchParams().get("from");

  if (from === "party") {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
        <PartyModuleNavbar />
        <PartyModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
          <RouteContentTransition>
            <CustomersListScreen chrome={false} />
          </RouteContentTransition>
        </PartyModuleBody>
      </div>
    );
  }

  return <CustomersListScreen />;
}

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersPageContent />
    </Suspense>
  );
}
