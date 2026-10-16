"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchInventorySettings, updateInventorySettings } from "@/lib/api/inventory-settings";

/** Server-side stock policy — unlike the rest of the Inventory settings page
 * (browser-local), this gates Sales/POS on the API, so it lives in its own card. */
export function InventoryStockPolicyCard() {
  const [allowNegative, setAllowNegative] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchInventorySettings()
      .then((s) => {
        if (!cancelled) setAllowNegative(Boolean(s.allow_negative_stock));
      })
      .catch(() => {
        if (!cancelled) setAllowNegative(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      const saved = await updateInventorySettings({ allow_negative_stock: next });
      setAllowNegative(Boolean(saved.allow_negative_stock));
      toast.success(
        saved.allow_negative_stock
          ? "Negative stock allowed — out-of-stock items can be sold"
          : "Negative stock blocked — out-of-stock items can't be sold",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save stock policy");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-4 mt-4 border border-border bg-card sm:mx-6" data-component="INV-STOCK-POLICY">
      <div className="border-b border-border bg-muted px-4 py-2">
        <h2 className="text-[13px] font-semibold text-foreground">Stock policy</h2>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 px-4 py-3">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#00a09d]"
          checked={allowNegative === true}
          disabled={allowNegative === null || saving}
          onChange={(e) => void toggle(e.target.checked)}
          aria-label="Allow negative stock"
        />
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-foreground">Allow negative stock</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            On: out-of-stock products can still be sold and their stock goes below zero. Off:
            selling an out-of-stock product is blocked in Sales and POS.
          </span>
        </span>
      </label>
    </section>
  );
}
