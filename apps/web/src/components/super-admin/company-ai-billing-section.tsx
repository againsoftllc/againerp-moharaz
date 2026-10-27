"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  type CompanyAiBilling,
  getCompanyAiBilling,
  recordCompanyAiInvoicePayment,
  setCompanyAiPackage,
} from "@/lib/api/super-admin";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

/** AI plan of one company: switch the plan once an upgrade is paid, record payments for overage invoices. */
export function CompanyAiBillingSection({ companyId }: { companyId: string }) {
  const [billing, setBilling] = useState<CompanyAiBilling | null>(null);
  const [packageId, setPackageId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getCompanyAiBilling(companyId);
      setBilling(data);
      setPackageId(data.package?.id ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load AI billing");
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<CompanyAiBilling>, message: string) => {
    setBusy(true);
    try {
      const data = await action();
      setBilling(data);
      setPackageId(data.package?.id ?? "");
      toast.success(message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update AI billing");
    } finally {
      setBusy(false);
    }
  };

  if (!billing) {
    return (
      <div className="border p-4">
        <h3 className="text-sm font-semibold">AI plan & invoices</h3>
        <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const unpaid = billing.invoices.filter((i) => i.status === "unpaid");

  return (
    <div className="space-y-3 border p-4">
      <h3 className="text-sm font-semibold">AI plan & invoices</h3>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Plan</span>
          <select
            id="cd-ai-package"
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            className="h-8 min-w-[12rem] border border-input bg-background px-2 text-xs"
          >
            {billing.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatCurrency(Number(p.price_bdt))}/mo
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          disabled={busy || !packageId || packageId === billing.package?.id}
          onClick={() => void run(() => setCompanyAiPackage(companyId, packageId), "AI plan switched")}
        >
          Switch plan
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Switch to a pricier plan only after the company has paid for it.</p>

      {unpaid.length ? (
        <ul className="space-y-2">
          {unpaid.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs">
              <span>
                <b>{inv.id.slice(0, 8).toUpperCase()}</b> · {formatCurrency(Number(inv.amount_bdt))} · {inv.period_start} → {inv.period_end}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() => recordCompanyAiInvoicePayment(companyId, inv.id), "Payment recorded — AI access restored")
                }
              >
                Record payment received
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No unpaid AI invoices.</p>
      )}
    </div>
  );
}
