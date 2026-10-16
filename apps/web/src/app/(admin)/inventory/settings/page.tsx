"use client";

import { InventorySettingsForm } from "@/components/inventory/inventory-settings-form";
import { InventoryStockPolicyCard } from "@/components/inventory/inventory-stock-policy-card";
import { SalesPolicyCard } from "@/components/inventory/sales-policy-card";

export default function InventorySettingsPage() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto">
      <InventoryStockPolicyCard />
      <SalesPolicyCard />
      <InventorySettingsForm />
    </div>
  );
}
