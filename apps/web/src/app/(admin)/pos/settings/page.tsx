"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchPosSettings, updatePosSettings, type PosSettings } from "@/lib/api/pos";

export default function PosSettingsPage() {
  const [data, setData] = useState<PosSettings | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchPosSettings());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load POS settings");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!data) return;
    try {
      setData(await updatePosSettings(data));
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings");
    }
  }

  if (!data) return <p className="p-4 text-xs text-muted-foreground">Loading…</p>;

  function toggle(key: keyof PosSettings) {
    setData((s) => (s ? { ...s, [key]: !s[key] } : s));
  }

  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto p-4">
      <h1 className="text-sm font-semibold">POS settings</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Negative stock follows Inventory configuration and cannot be overridden here.
      </p>
      <div className="mt-4 space-y-3 text-xs">
        <div>
          <Label>Default tax rate %</Label>
          <Input className="mt-1" type="number" value={data.default_tax_rate} onChange={(e) => setData({ ...data, default_tax_rate: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Default payment method</Label>
          <select className="mt-1 flex h-8 w-full rounded-none border border-input bg-background px-2 text-xs" value={data.default_payment_method} onChange={(e) => setData({ ...data, default_payment_method: e.target.value })}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank">Bank</option>
            <option value="mobile_banking">Mobile Banking</option>
          </select>
        </div>
        <div>
          <Label>Receipt size</Label>
          <select className="mt-1 flex h-8 w-full rounded-none border border-input bg-background px-2 text-xs" value={data.receipt_size} onChange={(e) => setData({ ...data, receipt_size: e.target.value })}>
            <option value="80mm">80mm</option>
            <option value="58mm">58mm</option>
          </select>
        </div>
        <div>
          <Label>Receipt footer</Label>
          <Input className="mt-1" value={data.receipt_footer} onChange={(e) => setData({ ...data, receipt_footer: e.target.value })} />
        </div>
        <div>
          <Label>Return policy</Label>
          <Input className="mt-1" value={data.return_policy} onChange={(e) => setData({ ...data, return_policy: e.target.value })} />
        </div>
        {[
          ["show_warranty", "Show warranty on receipt"],
          ["allow_discount", "Allow discount"],
          ["allow_price_override", "Allow price override"],
          ["require_customer", "Require customer"],
          ["require_opening_cash", "Require opening cash"],
          ["require_closing_cash", "Require closing cash"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="flex w-full items-center justify-between border border-border px-3 py-2 text-left"
            onClick={() => toggle(key as keyof PosSettings)}
          >
            <span>{label}</span>
            <span className="border border-border px-2 py-0.5">{data[key as keyof PosSettings] ? "On" : "Off"}</span>
          </button>
        ))}
        <p className="text-muted-foreground">Allow negative stock: {data.allow_negative_stock ? "On" : "Off"} (inventory policy)</p>
        <Button className="rounded-none" onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}
