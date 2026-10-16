"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  fetchInventorySettings,
  updateInventorySettings,
  type WarrantyStartBasis,
} from "@/lib/api/inventory-settings";

const OPTIONS: { value: WarrantyStartBasis; label: string; hint: string }[] = [
  {
    value: "sale",
    label: "Sale date — the day the product is sold to the customer",
    hint: "The warranty period on the product (e.g. \"1 year\") counts from the invoice / confirmation day. This is what the customer is promised.",
  },
  {
    value: "stock_in",
    label: "Stock-in date — the day the unit was received into stock",
    hint: "For supplier-style warranties that run from the purchase receipt, regardless of when the unit is sold.",
  },
];

/** Server-side sales policy (Configuration → Sales): how a sold unit's warranty is counted. */
export function SalesPolicyCard() {
  const [basis, setBasis] = useState<WarrantyStartBasis | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchInventorySettings()
      .then((s) => {
        if (!cancelled) setBasis(s.warranty_start_basis ?? "sale");
      })
      .catch(() => {
        if (!cancelled) setBasis("sale");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const change = async (next: WarrantyStartBasis) => {
    setSaving(true);
    try {
      const saved = await updateInventorySettings({ warranty_start_basis: next });
      setBasis(saved.warranty_start_basis);
      toast.success(
        saved.warranty_start_basis === "sale"
          ? "Warranty now counts from the sale date"
          : "Warranty now counts from the stock-in date",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save warranty policy");
    } finally {
      setSaving(false);
    }
  };

  const current = OPTIONS.find((o) => o.value === basis) ?? OPTIONS[0];

  return (
    <section className="mx-4 mt-4 border border-border bg-card sm:mx-6" data-component="INV-SALES-POLICY">
      <div className="border-b border-border bg-muted px-4 py-2">
        <h2 className="text-[13px] font-semibold text-foreground">Sales</h2>
      </div>
      <div className="space-y-2 px-4 py-3">
        <label className="block text-[13px] font-medium text-foreground" htmlFor="warranty-start-basis">
          Warranty starts from
        </label>
        <select
          id="warranty-start-basis"
          className="h-8 w-full max-w-xl rounded-none border border-border bg-background px-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-[#00a09d]"
          value={basis ?? "sale"}
          disabled={basis === null || saving}
          onChange={(e) => void change(e.target.value as WarrantyStartBasis)}
          aria-label="Warranty starts from"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{current.hint}</p>
        <p className="text-xs text-muted-foreground">
          Applies to serial-tracked units when a sale is confirmed (and to RMA warranty checks). The
          period itself comes from each product&apos;s warranty field.
        </p>
      </div>
    </section>
  );
}
