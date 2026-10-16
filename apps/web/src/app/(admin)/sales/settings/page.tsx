"use client";

import { useCallback } from "react";
import { SalesModuleNavbar } from "@/components/sales/sales-module-chrome";
import { SalesSettingsForm } from "@/components/sales/sales-settings-form";

export default function SalesSettingsPage() {
  // NavMenuItem already navigates for every top-level Sales nav item (href or
  // listFilter), so there's nothing left for this page to do here.
  const handleNav = useCallback(() => {}, []);

  return (
    <div className="w-full">
      <header className="sticky top-0 z-10 bg-background">
        <SalesModuleNavbar
          activeNav="settings"
          activeSub="settings"
          onNavigate={handleNav}
        />
      </header>
      <SalesSettingsForm />
    </div>
  );
}
