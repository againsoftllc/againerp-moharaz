"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  EMI_TENURE_OPTIONS,
  createEmptyBank,
  parseBanksFromConfig,
  serializeBanks,
  slugifyBankId,
} from "@/lib/plugins/bank-emi/banks-config";
import { calculatePlanRow } from "@/lib/plugins/bank-emi/calculator";
import type { EmiBank } from "@/lib/plugins/bank-emi/types";
import { EmiPlansModal } from "@/components/settings/plugins/emi-plans-modal";
import { usePluginsStore } from "@/lib/store/plugins-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCurrency } from "@/lib/utils";

const PREVIEW_AMOUNT = 14000;

type Props = {
  pluginId: string;
};

export function BankEmiBanksPanel({ pluginId }: Props) {
  const pluginState = usePluginsStore((s) => s.plugins[pluginId]);
  const savePluginConfig = usePluginsStore((s) => s.savePluginConfig);

  const savedBanks = useMemo(
    () => parseBanksFromConfig(pluginState?.config),
    [pluginState?.config],
  );

  const [banks, setBanks] = useState<EmiBank[]>(savedBanks);
  const [selectedId, setSelectedId] = useState(savedBanks[0]?.id ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setBanks(savedBanks);
    setSelectedId(savedBanks[0]?.id ?? "");
    setDirty(false);
  }, [savedBanks]);

  const selected = banks.find((b) => b.id === selectedId) ?? banks[0];

  const updateBanks = (next: EmiBank[]) => {
    setBanks(next);
    setDirty(true);
    if (!next.some((b) => b.id === selectedId) && next[0]) {
      setSelectedId(next[0].id);
    }
  };

  const updateSelected = (patch: Partial<EmiBank>) => {
    if (!selected) return;
    updateBanks(banks.map((b) => (b.id === selected.id ? { ...b, ...patch } : b)));
  };

  const updatePlanCharge = (months: number, chargePercent: number) => {
    if (!selected) return;
    const plans = selected.plans.map((p) =>
      p.months === months ? { ...p, chargePercent } : p,
    );
    if (!plans.some((p) => p.months === months)) {
      plans.push({ months, chargePercent, active: true });
      plans.sort((a, b) => a.months - b.months);
    }
    updateSelected({ plans });
  };

  const togglePlanActive = (months: number, active: boolean) => {
    if (!selected) return;
    const plans = selected.plans.map((p) => (p.months === months ? { ...p, active } : p));
    if (!plans.some((p) => p.months === months)) {
      plans.push({ months, chargePercent: 5, active });
      plans.sort((a, b) => a.months - b.months);
    }
    updateSelected({ plans });
  };

  const getChargeForMonths = (months: number) => {
    const plan = selected?.plans.find((p) => p.months === months);
    return plan?.chargePercent ?? 0;
  };

  const isPlanActive = (months: number) => {
    const plan = selected?.plans.find((p) => p.months === months);
    return plan ? plan.active !== false : false;
  };

  const handleAddBank = () => {
    const bank = createEmptyBank();
    updateBanks([...banks, bank]);
    setSelectedId(bank.id);
  };

  const handleRemoveBank = (id: string) => {
    if (banks.length <= 1) {
      toast.error("At least one bank is required");
      return;
    }
    updateBanks(banks.filter((b) => b.id !== id));
  };

  const handleDuplicatePlans = () => {
    if (!selected || banks.length < 2) return;
    const source = banks.find((b) => b.id !== selected.id);
    if (!source) return;
    updateSelected({
      plans: source.plans.map((p) => ({ ...p })),
    });
    toast.success(`Copied plans from ${source.name}`);
  };

  const handleSave = () => {
    savePluginConfig(
      pluginId,
      { banks_json: serializeBanks(banks) },
      { labels: { banks_json: "Banks & EMI plans" } },
    );
    setDirty(false);
    toast.success("Banks and EMI rates saved");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/60 bg-amber-50/40 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
        <div>
          <p className="text-sm font-medium">Banks & tenure rates</p>
          <p className="text-[11px] text-muted-foreground">
            প্রতিটি bank-এ month অনুযায়ী <strong>Charge %</strong> সেট করুন — storefront modal-এ দেখাবে।
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Preview
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty}>
            Save banks
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="rounded-xl border border-input bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-input px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Banks</p>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAddBank}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ul className="max-h-[420px] space-y-1 overflow-y-auto p-2">
            {banks.map((bank) => (
              <li key={bank.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(bank.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                    selected?.id === bank.id
                      ? "bg-primary/10 font-semibold text-primary"
                      : "hover:bg-muted/50",
                  )}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: bank.brandColor }}
                  >
                    {bank.initial}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{bank.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-input p-2">
            <Button variant="outline" size="sm" className="w-full" onClick={handleAddBank}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add bank
            </Button>
          </div>
        </div>

        {selected && (
          <div className="space-y-4">
            <div className="rounded-xl border border-input bg-card shadow-sm">
              <div className="border-b border-input bg-muted/30 px-4 py-3">
                <p className="text-sm font-semibold">Bank details</p>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="bank-name">Bank name</Label>
                  <Input
                    id="bank-name"
                    value={selected.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      updateSelected({ name, initial: name.trim()[0]?.toUpperCase() ?? "B" });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bank-initial">Icon letter</Label>
                  <Input
                    id="bank-initial"
                    maxLength={1}
                    value={selected.initial}
                    onChange={(e) => updateSelected({ initial: e.target.value.toUpperCase().slice(0, 1) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bank-color">Brand color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="bank-color"
                      type="color"
                      className="h-9 w-14 cursor-pointer p-1"
                      value={selected.brandColor}
                      onChange={(e) => updateSelected({ brandColor: e.target.value })}
                    />
                    <Input
                      value={selected.brandColor}
                      onChange={(e) => updateSelected({ brandColor: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateSelected({ id: slugifyBankId(selected.name) })}
                  >
                    Sync ID from name
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDuplicatePlans}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy plans from another bank
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRemoveBank(selected.id)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Remove bank
                  </Button>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-input bg-card shadow-sm">
              <div className="border-b border-input bg-muted/30 px-4 py-3">
                <p className="text-sm font-semibold">EMI plans — Charge %</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Formula: Effective = Amount × (1 + Charge%/100) · Monthly = Effective ÷ Months
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-input bg-muted/20 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">Active</th>
                      <th className="px-4 py-2.5">Months</th>
                      <th className="px-4 py-2.5">Charge %</th>
                      <th className="px-4 py-2.5">Preview EMI ({formatCurrency(PREVIEW_AMOUNT)})</th>
                      <th className="px-4 py-2.5">Effective cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {EMI_TENURE_OPTIONS.map((months) => {
                      const active = isPlanActive(months);
                      const charge = getChargeForMonths(months);
                      const row = active && charge > 0 ? calculatePlanRow(PREVIEW_AMOUNT, months, charge) : null;
                      return (
                        <tr key={months} className="border-b border-input/60 last:border-0">
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={(e) => togglePlanActive(months, e.target.checked)}
                              className="h-4 w-4 rounded border-input"
                            />
                          </td>
                          <td className="px-4 py-2 font-medium">{months}</td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              disabled={!active}
                              value={active ? charge : ""}
                              placeholder="—"
                              className="h-8 w-24"
                              onChange={(e) =>
                                updatePlanCharge(months, parseFloat(e.target.value) || 0)
                              }
                            />
                          </td>
                          <td className="px-4 py-2 text-amber-700 dark:text-amber-400">
                            {row ? formatCurrency(row.monthlyEmi) : "—"}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {row ? formatCurrency(row.effectiveCost) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <EmiPlansModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        defaultAmount={PREVIEW_AMOUNT}
        banksOverride={banks}
      />
    </div>
  );
}
