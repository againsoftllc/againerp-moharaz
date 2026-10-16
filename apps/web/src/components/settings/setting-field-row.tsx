"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { SettingItemDef } from "@/lib/settings/types";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

type Props = {
  item: SettingItemDef;
  value: string | boolean | number;
  dirty?: boolean;
  compact?: boolean;
  onChange: (v: string | boolean | number) => void;
};

export function SettingFieldRow({ item, value, dirty, compact, onChange }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
        dirty && "bg-primary/[0.04]",
        !compact && "border-b border-input/60 last:border-b-0",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{item.label}</p>
        {item.description && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>
        )}
      </div>
      <div className="shrink-0 sm:pl-4">
        <SettingFieldControl item={item} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function SettingFieldControl({
  item,
  value,
  onChange,
}: {
  item: SettingItemDef;
  value: string | boolean | number;
  onChange: (v: string | boolean | number) => void;
}) {
  if (item.type === "toggle") {
    return (
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] tabular-nums text-muted-foreground">{value ? "Enabled" : "Disabled"}</span>
        <SwitchPrimitive.Root
          checked={Boolean(value)}
          onCheckedChange={onChange}
        className="peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-none border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
      >
        <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-none bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
        </SwitchPrimitive.Root>
      </div>
    );
  }

  if (item.type === "text") {
    return (
      <Input
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-[200px] text-xs sm:w-64"
      />
    );
  }

  if (item.type === "textarea") {
    return (
      <textarea
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full min-w-[240px] resize-none rounded-none border border-input bg-background px-3 py-2 text-xs sm:w-72"
      />
    );
  }

  if (item.type === "number") {
    return (
      <Input
        type="number"
        value={Number(value)}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-9 w-full min-w-[120px] text-xs sm:w-36"
      />
    );
  }

  if (item.type === "select" && item.options) {
    return (
      <Select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-[160px] text-xs sm:w-44"
      >
        {item.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }

  return null;
}
