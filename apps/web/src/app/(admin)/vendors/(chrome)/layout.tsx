import { VendorModuleNavbar, VendorModuleBody } from "@/components/vendors/vendor-module-chrome";
import { RouteContentTransition } from "@/components/layout/route-content-transition";

/** Vendors module navbar — persistent across every /vendors/* route except the
 * bare index (which switches between this and Party's own navbar via ?from=). */
export default function VendorsChromeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <VendorModuleNavbar />
      <VendorModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <RouteContentTransition>{children}</RouteContentTransition>
      </VendorModuleBody>
    </div>
  );
}
