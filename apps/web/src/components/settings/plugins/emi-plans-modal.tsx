"use client";

import { useMemo, useState } from "react";
import { calculateBankPlans } from "@/lib/plugins/bank-emi/calculator";
import type { EmiBank } from "@/lib/plugins/bank-emi/types";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCurrency } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAmount: number;
  banksOverride: EmiBank[];
};

export function EmiPlansModal({ open, onOpenChange, defaultAmount, banksOverride }: Props) {
  const [amount, setAmount] = useState(defaultAmount);

  const banks = useMemo(
    () =>
      banksOverride
        .map((bank) => ({
          bank,
          plans: calculateBankPlans(amount, bank),
        }))
        .filter((entry) => entry.plans.length > 0),
    [amount, banksOverride],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>EMI preview</SheetTitle>
          <SheetDescription>
            Customer-facing EMI breakdown using the banks configured above.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2">
          <Label htmlFor="emi-preview-amount">Order amount (৳)</Label>
          <Input
            id="emi-preview-amount"
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
          />
        </div>

        {banks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add at least one active EMI plan to preview.</p>
        ) : (
          <div className="space-y-4">
            {banks.map(({ bank, plans }) => (
              <div key={bank.id} className="rounded-lg border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: bank.brandColor }}
                  >
                    {bank.initial}
                  </span>
                  <div>
                    <p className="font-medium">{bank.name}</p>
                    {bank.nameBn ? (
                      <p className="text-xs text-muted-foreground">{bank.nameBn}</p>
                    ) : null}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4">Tenure</th>
                        <th className="py-2 pr-4">Charge</th>
                        <th className="py-2 pr-4">Monthly EMI</th>
                        <th className="py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plans.map((plan) => (
                        <tr key={plan.months} className="border-b last:border-0">
                          <td className="py-2 pr-4">{plan.months} mo</td>
                          <td className="py-2 pr-4">{plan.chargePercent}%</td>
                          <td className={cn("py-2 pr-4 font-medium")}>
                            {formatCurrency(plan.monthlyEmi)}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {formatCurrency(plan.effectiveCost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
