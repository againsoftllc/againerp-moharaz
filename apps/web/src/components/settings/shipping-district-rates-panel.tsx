"use client";

import { Input } from "@/components/ui/input";

type Props = {
  zonesText: string;
  ratesJson: string;
  defaultRate: number;
  onChangeRates: (json: string) => void;
};

function parseZones(zonesText: string): string[] {
  return zonesText
    .split(/[,\n]/)
    .map((z) => z.trim())
    .filter(Boolean);
}

function parseRates(ratesJson: string): Record<string, number> {
  const out: Record<string, number> = {};
  const raw = (ratesJson || "").trim();
  if (!raw) return out;
  try {
    if (raw.startsWith("{")) {
      const data = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(data)) {
        const n = Number(v);
        if (k.trim() && Number.isFinite(n)) out[k.trim()] = n;
      }
      return out;
    }
  } catch {
    /* fall through */
  }
  for (const part of raw.split(/[,\n]/)) {
    const chunk = part.trim();
    if (!chunk) continue;
    const sep = chunk.includes(":") ? ":" : chunk.includes("=") ? "=" : "";
    if (!sep) continue;
    const [name, amount] = chunk.split(sep, 2);
    const n = Number(amount);
    if (name?.trim() && Number.isFinite(n)) out[name.trim()] = n;
  }
  return out;
}

export function ShippingDistrictRatesPanel({
  zonesText,
  ratesJson,
  defaultRate,
  onChangeRates,
}: Props) {
  const zones = parseZones(zonesText);
  const rates = parseRates(ratesJson);

  const setRate = (district: string, value: number) => {
    const next = { ...rates };
    for (const z of zones) {
      if (!(z in next)) next[z] = defaultRate;
    }
    next[district] = Number.isFinite(value) ? value : 0;
    onChangeRates(JSON.stringify(next));
  };

  if (zones.length === 0) {
    return (
      <div className="overflow-hidden rounded-none border border-border bg-card">
        <div className="border-b border-border bg-muted/30 px-4 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            District Delivery Prices (BDT)
          </p>
        </div>
        <p className="px-4 py-3 text-xs text-muted-foreground">
          Add districts in “Checkout Districts” first (comma-separated).
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-none border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/30 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          District Delivery Prices (BDT)
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Home Delivery charge on checkout follows the selected district.
        </p>
      </div>
      <div className="divide-y divide-border">
        {zones.map((district) => (
          <div
            key={district}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm font-medium">{district}</p>
            <Input
              type="number"
              min={0}
              step={1}
              value={rates[district] ?? defaultRate}
              onChange={(e) => setRate(district, parseFloat(e.target.value) || 0)}
              className="h-9 w-full min-w-[120px] rounded-none text-xs sm:w-36"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
