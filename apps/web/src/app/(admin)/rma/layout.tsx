import { Suspense } from "react";
import { RmaModuleNavbar, RmaModuleBody } from "@/components/rma/rma-module-chrome";
import { RouteContentTransition } from "@/components/layout/route-content-transition";

/** RMA module — persistent navbar across /rma/* routes. */
export default function RmaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-3 -mt-3 -mb-3 flex h-full min-h-0 w-[calc(100%+1.5rem)] max-w-none flex-1 flex-col max-md:mb-0 lg:-mx-4 lg:-mt-4 lg:-mb-4 lg:w-[calc(100%+2rem)]">
      <Suspense fallback={<div className="h-[34px] shrink-0 border-b border-border bg-[#3a2b2b]" />}>
        <RmaModuleNavbar />
      </Suspense>
      <RmaModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <RouteContentTransition>{children}</RouteContentTransition>
      </RmaModuleBody>
    </div>
  );
}
