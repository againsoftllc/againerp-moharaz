import {
  PurchaseModuleNavbar,
  PurchaseModuleBody,
} from "@/components/purchase/purchase-module-chrome";
import { RouteContentTransition } from "@/components/layout/route-content-transition";

/** Purchase module — persistent navbar across /purchase/* routes. */
export default function PurchaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-3 -mt-3 -mb-3 flex h-full min-h-0 w-[calc(100%+1.5rem)] max-w-none flex-1 flex-col max-md:mb-0 lg:-mx-4 lg:-mt-4 lg:-mb-4 lg:w-[calc(100%+2rem)]">
      <PurchaseModuleNavbar />
      <PurchaseModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <RouteContentTransition>{children}</RouteContentTransition>
      </PurchaseModuleBody>
    </div>
  );
}
