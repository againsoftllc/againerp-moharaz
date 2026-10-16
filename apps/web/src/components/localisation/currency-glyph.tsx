"use client";

import { cn } from "@/lib/utils";
import type { CurrencyOption } from "@/lib/localisation/currency-options";

/** Text currency symbol — not a media/image icon. */
export function CurrencyGlyph({
  currency,
  className,
}: {
  currency: Pick<CurrencyOption, "code" | "symbol">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 font-medium tabular-nums leading-none text-foreground",
        className,
      )}
      aria-hidden
    >
      {currency.symbol?.trim() || currency.code}
    </span>
  );
}
