"use client";

import { Suspense } from "react";
import { CompanySetupPanel } from "@/components/workspace/company-setup-panel";

export default function WorkspaceCompanySetupPage() {
  return (
    <Suspense fallback={null}>
      <CompanySetupPanel />
    </Suspense>
  );
}
