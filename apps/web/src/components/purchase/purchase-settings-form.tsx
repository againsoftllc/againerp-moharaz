"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/shared/filter-select";
import { FieldHelpTip } from "@/components/sales/field-help-tip";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import {
  DEFAULT_PURCHASE_SETTINGS,
  PURCHASE_SETTINGS_SECTIONS,
  mergePurchaseSettings,
  readPurchaseSettings,
  writePurchaseSettings,
  type PurchaseSettingField,
  type PurchaseSettingKey,
  type PurchaseSettings,
} from "@/lib/purchase/purchase-settings";

const again = {
  headerBg: "var(--muted)",
  headerText: "var(--foreground)",
  bodyBg: "var(--card)",
  title: "var(--foreground)",
  help: "var(--muted-foreground)",
  border: "var(--border)",
  checkboxBorder: "var(--input)",
  accent: "#00a09d",
  divider: "var(--border)",
} as const;

function SettingCheckbox({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  id: string;
}) {
  return (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-[16px] w-[16px] shrink-0 cursor-pointer appearance-none rounded-none border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/40"
      style={{
        borderColor: checked ? again.accent : again.checkboxBorder,
        backgroundColor: checked ? again.accent : "var(--background)",
        backgroundImage: checked
          ? `url("data:image/svg+xml,%3Csvg viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 6.2 4.8 9 10 3' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`
          : undefined,
        backgroundSize: "12px 12px",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

function FieldShell({
  label,
  help,
  children,
  wide,
}: {
  label: string;
  help: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-full flex min-w-0 items-start" : "flex min-w-0 items-start"}>
      <span className="flex w-9 shrink-0" aria-hidden />
      <span className="mr-3 w-px self-stretch" style={{ backgroundColor: again.divider }} aria-hidden />
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] font-bold leading-tight" style={{ color: again.title }}>
            {label}
          </p>
          <FieldHelpTip label={help} />
        </div>
        <p className="mt-0.5 text-[13px] leading-[1.35]" style={{ color: again.help }}>
          {help}
        </p>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

function SettingField({
  field,
  values,
  warehouseOptions,
  onChange,
}: {
  field: PurchaseSettingField;
  values: PurchaseSettings;
  warehouseOptions: { value: string; label: string }[];
  onChange: (key: PurchaseSettingKey, value: string | number | boolean) => void;
}) {
  const inputId = `purchase-setting-${field.key}`;

  if (field.type === "boolean") {
    const checked = Boolean(values[field.key]);
    return (
      <div className="flex min-w-0 items-start">
        <span className="flex w-9 shrink-0 justify-center pt-[3px]">
          <SettingCheckbox
            id={inputId}
            checked={checked}
            onChange={(next) => onChange(field.key, next)}
          />
        </span>
        <span className="mr-3 w-px self-stretch" style={{ backgroundColor: again.divider }} aria-hidden />
        <div className="min-w-0 pb-1 pt-0">
          <label htmlFor={inputId} className="cursor-pointer">
            <span className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold leading-tight" style={{ color: again.title }}>
                {field.label}
              </span>
              <FieldHelpTip label={field.help} />
            </span>
            <span className="mt-0.5 block text-[13px] leading-[1.35]" style={{ color: again.help }}>
              {field.help}
            </span>
          </label>
        </div>
      </div>
    );
  }

  if (field.type === "warehouse") {
    return (
      <FieldShell label={field.label} help={field.help} wide>
        <FilterSelect
          value={String(values.defaultWarehouseId)}
          onChange={(value) => onChange("defaultWarehouseId", value)}
          width="w-full max-w-md"
          ariaLabel={field.label}
          options={[{ value: "", label: "Use inventory default" }, ...warehouseOptions]}
        />
      </FieldShell>
    );
  }

  if (field.type === "select") {
    return (
      <FieldShell label={field.label} help={field.help} wide>
        <FilterSelect
          value={String(values[field.key])}
          onChange={(value) => onChange(field.key, value)}
          width="w-full max-w-md"
          ariaLabel={field.label}
          options={field.options}
        />
      </FieldShell>
    );
  }

  return (
    <FieldShell label={field.label} help={field.help}>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="number"
          min={field.min}
          max={field.max}
          value={Number(values[field.key] ?? 0)}
          onChange={(e) => onChange(field.key, Number(e.target.value) || 0)}
          className="h-8 w-24 rounded-none border border-input bg-background px-2 text-[13px] tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/30"
        />
        {field.suffix ? (
          <span className="text-[13px] text-muted-foreground">{field.suffix}</span>
        ) : null}
      </div>
    </FieldShell>
  );
}

export function PurchaseSettingsForm() {
  const { warehouses } = useInventoryWarehouses();
  const [saved, setSaved] = useState<PurchaseSettings>(DEFAULT_PURCHASE_SETTINGS);
  const [draft, setDraft] = useState<PurchaseSettings>(DEFAULT_PURCHASE_SETTINGS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const next = readPurchaseSettings();
    setSaved(next);
    setDraft(next);
  }, []);

  const warehouseOptions = useMemo(
    () => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    [warehouses],
  );

  const patch = (key: PurchaseSettingKey, value: string | number | boolean) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    const next = mergePurchaseSettings(draft);
    writePurchaseSettings(next);
    setSaved(next);
    setDraft(next);
    setDirty(false);
    toast.success("Purchase settings saved");
  };

  const handleDiscard = () => {
    setDraft(saved);
    setDirty(false);
  };

  const handleReset = () => {
    const next = { ...DEFAULT_PURCHASE_SETTINGS };
    writePurchaseSettings(next);
    setSaved(next);
    setDraft(next);
    setDirty(false);
    toast.success("Purchase settings reset to defaults");
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">Purchase Settings</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Defaults for orders, receiving, three-way match, and RFQ award.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none"
            onClick={handleReset}
          >
            Reset
          </Button>
          {dirty ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none"
              onClick={handleDiscard}
            >
              Discard
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-none bg-[#714B67] text-white hover:bg-[#5f3f57]"
            disabled={!dirty}
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {PURCHASE_SETTINGS_SECTIONS.map((section) => (
          <section
            key={section.id}
            className="overflow-hidden rounded-none border border-border bg-card"
          >
            <div
              className="border-b border-border px-4 py-2.5"
              style={{ backgroundColor: again.headerBg }}
            >
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-foreground">
                {section.title}
              </h2>
            </div>
            <div className="grid gap-x-8 gap-y-4 p-4 sm:grid-cols-2">
              {section.fields.map((field) => (
                <SettingField
                  key={field.key}
                  field={field}
                  values={draft}
                  warehouseOptions={warehouseOptions}
                  onChange={patch}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
