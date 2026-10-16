"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { PluginFieldDef } from "@/lib/settings/plugins/types";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

type Props = {
  field: PluginFieldDef;
  value: string | boolean | number;
  dirty?: boolean;
  onChange: (v: string | boolean | number) => void;
};

export function PluginFieldRow({ field, value, dirty, onChange }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
        dirty && "bg-primary/[0.04]",
        "border-b border-input/60 last:border-b-0",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">
          {field.label}
          {field.required && <span className="ml-1 text-destructive">*</span>}
        </p>
        {field.description && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{field.description}</p>
        )}
      </div>
      <div className="shrink-0 sm:pl-4">
        <PluginFieldControl field={field} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function PluginFieldControl({
  field,
  value,
  onChange,
}: {
  field: PluginFieldDef;
  value: string | boolean | number;
  onChange: (v: string | boolean | number) => void;
}) {
  if (field.type === "toggle") {
    return (
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] tabular-nums text-muted-foreground">{value ? "Enabled" : "Disabled"}</span>
        <SwitchPrimitive.Root
          checked={Boolean(value)}
          onCheckedChange={onChange}
          className="peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
        >
          <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
        </SwitchPrimitive.Root>
      </div>
    );
  }

  if (field.type === "password") {
    return (
      <Input
        type="password"
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="h-9 w-full min-w-[220px] text-xs sm:w-72"
      />
    );
  }

  if (field.type === "url") {
    return (
      <Input
        type="url"
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="h-9 w-full min-w-[220px] font-mono text-xs sm:w-80"
      />
    );
  }

  if (field.type === "number") {
    return (
      <Input
        type="number"
        value={Number(value)}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        placeholder={field.placeholder}
        className="h-9 w-full min-w-[120px] text-xs sm:w-36"
      />
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <Select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-[160px] text-xs sm:w-48"
      >
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }

  return (
    <Input
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className="h-9 w-full min-w-[220px] text-xs sm:w-72"
    />
  );
}

function PluginBrandMark({ name, color }: { name: string; color: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
      style={{ backgroundColor: color }}
    >
      {initial}
    </div>
  );
}

export { PluginBrandMark };
