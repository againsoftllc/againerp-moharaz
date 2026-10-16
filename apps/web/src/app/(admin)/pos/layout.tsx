import { Suspense } from "react";
import { PosModuleNavbar, PosModuleBody } from "@/components/pos/pos-module-chrome";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-background">
      <Suspense fallback={<div className="h-[34px] shrink-0 border-b border-border bg-[#1f2a22]" />}>
        <PosModuleNavbar />
      </Suspense>
      <PosModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        {children}
      </PosModuleBody>
    </div>
  );
}
