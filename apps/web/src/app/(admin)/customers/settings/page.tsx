"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CustomersModuleNavbar } from "@/components/customers/customers-module-chrome";
import { CustomerSettingsForm } from "@/components/customers/customer-settings-form";

export default function CustomersSettingsPage() {
  const router = useRouter();

  const handleNav = useCallback(
    (menuId: string, subId: string) => {
      if (menuId === "configuration" && subId === "settings") return;
      if (menuId === "contacts" && (subId === "customers" || subId === "contacts")) {
        router.push("/customers");
        return;
      }
      toast.info(`${menuId} › ${subId.replace(/_/g, " ")} — mock`);
    },
    [router],
  );

  return (
    <div className="w-full">
      <header className="sticky top-0 z-10 bg-background">
        <CustomersModuleNavbar
          activeNav="configuration"
          activeSub="settings"
          onNavigate={handleNav}
        />
      </header>
      <CustomerSettingsForm />
    </div>
  );
}
