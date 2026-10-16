"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const PRICE_FLOOR = 0;
export const PRICE_STEP = 100;
export const DEFAULT_PRICE_CEILING = 200000;

type Props = {
  valueMin: string;
  valueMax: string;
  onChange: (min: string, max: string) => void;
  className?: string;
  /** Dynamic ceiling from loaded product list. */
  priceCeiling?: number;
};

function parseValue(raw: string, fallback: number) {
  const n = Number(raw);
  return raw !== "" && Number.isFinite(n) ? n : fallback;
}

function DualRangeSlider({
  min,
  max,
  low,
  high,
  step,
  onChange,
}: {
  min: number;
  max: number;
  low: number;
  high: number;
  step: number;
  onChange: (low: number, high: number) => void;
}) {
  const fillLeft = ((low - min) / (max - min)) * 100;
  const fillWidth = ((high - low) / (max - min)) * 100;

  const handleLow = (next: number) => {
    onChange(Math.min(next, high - step), high);
  };

  const handleHigh = (next: number) => {
    onChange(low, Math.max(next, low + step));
  };

  return (
    <div className="dual-range-slider px-0.5 pt-1">
      <div className="relative h-5">
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-muted" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary/70"
          style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={low}
          onChange={(e) => handleLow(Number(e.target.value))}
          className="dual-range-thumb absolute inset-0 z-20 w-full appearance-none bg-transparent"
          aria-label="Minimum price"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={high}
          onChange={(e) => handleHigh(Number(e.target.value))}
          className="dual-range-thumb absolute inset-0 z-30 w-full appearance-none bg-transparent"
          aria-label="Maximum price"
        />
      </div>
    </div>
  );
}

export function PriceRangeFilter({ valueMin, valueMax, onChange, className, priceCeiling = DEFAULT_PRICE_CEILING }: Props) {
  const [open, setOpen] = useState(false);

  const isActive = valueMin !== "" || valueMax !== "";

  const low = parseValue(valueMin, PRICE_FLOOR);
  const high = parseValue(valueMax, priceCeiling);

  const label = useMemo(() => {
    if (!isActive) return "Price";
    if (valueMin && valueMax) {
      return `${formatCurrency(low)} – ${formatCurrency(high)}`;
    }
    if (valueMin) return `${formatCurrency(low)}+`;
    return `Up to ${formatCurrency(high)}`;
  }, [high, isActive, low, valueMax, valueMin]);

  const applyRange = (nextLow: number, nextHigh: number) => {
    const atFloor = nextLow <= PRICE_FLOOR;
    const atCeiling = nextHigh >= priceCeiling;
    if (atFloor && atCeiling) {
      onChange("", "");
      return;
    }
    onChange(atFloor ? "" : String(nextLow), atCeiling ? "" : String(nextHigh));
  };

  const clear = () => {
    onChange("", "");
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1 font-normal", isActive && "border-primary/40", className)}
        >
          <span className="max-w-[160px] truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-3" onCloseAutoFocus={(e) => e.preventDefault()}>
        <p className="text-xs font-medium">Price range</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {formatCurrency(low)} – {formatCurrency(high)}
        </p>
        <DualRangeSlider
          min={PRICE_FLOOR}
          max={priceCeiling}
          low={low}
          high={high}
          step={PRICE_STEP}
          onChange={applyRange}
        />
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{formatCurrency(PRICE_FLOOR)}</span>
          <span>{formatCurrency(priceCeiling)}</span>
        </div>
        {isActive && (
          <Button variant="ghost" size="sm" className="mt-2 h-7 w-full text-xs" onClick={clear}>
            Clear price filter
          </Button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
