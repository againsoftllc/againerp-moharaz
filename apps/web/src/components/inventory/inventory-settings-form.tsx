"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FieldHelpTip } from "@/components/sales/field-help-tip";
import {
  INVENTORY_SETTINGS_SECTIONS,
  defaultInventorySettingsValues,
  clearLegacyInventorySettings,
  mergeInventorySettings,
  readLegacyInventorySettings,
  type InventorySettingField,
  type InventorySettingsValues,
} from "@/lib/inventory/inventory-settings";
import { fetchModuleSettings, saveModuleSettings } from "@/lib/api/module-settings";

/** Again settings palette — same tokens as catalog-settings-form.tsx, CSS vars
 * follow light/dark theme. */
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

function InfoTip({ text }: { text: string }) {
  return <FieldHelpTip label={text} />;
}

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
      className="h-[16px] w-[16px] shrink-0 cursor-pointer appearance-none rounded-[2px] border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/40"
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

function FieldHelpBlock({ field }: { field: InventorySettingField }) {
  return (
    <>
      {field.help ? (
        <span className="mt-0.5 block text-[13px] leading-[1.35]" style={{ color: again.help }}>
          {field.help}
        </span>
      ) : null}
      {"helpLink" in field && field.helpLink ? (
        <a
          href={field.helpLink.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-[13px] font-medium underline-offset-2 hover:underline"
          style={{ color: again.accent }}
        >
          {field.helpLink.label}
        </a>
      ) : null}
    </>
  );
}

function SettingCard({
  field,
  values,
  onChange,
}: {
  field: InventorySettingField;
  values: InventorySettingsValues;
  onChange: (key: string, value: boolean | string | number) => void;
}) {
  if (field.visibleWhen && !values[field.visibleWhen]) return null;

  const value = values[field.key];
  const inputId = `inventory-setting-${field.key}`;

  if (field.type === "inline_number") {
    return (
      <div className="flex min-w-0 items-start">
        <span className="flex w-9 shrink-0" aria-hidden />
        <span className="mr-3 w-px self-stretch" style={{ backgroundColor: again.divider }} aria-hidden />
        <div className="min-w-0 pb-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[13px] font-bold leading-tight" style={{ color: again.title }}>
              {field.label}
            </span>
            <span className="inline-flex items-baseline gap-1.5 text-[13px]" style={{ color: again.title }}>
              <input
                type="number"
                min={0}
                value={Number(value)}
                onChange={(e) => onChange(field.key, Number(e.target.value) || 0)}
                className="w-10 border-0 border-b bg-transparent px-0.5 text-center text-[13px] font-bold tabular-nums outline-none focus:border-[#00a09d]"
                style={{ borderBottomColor: again.checkboxBorder, color: again.title }}
              />
              <span>{field.suffix}</span>
            </span>
          </div>
          <FieldHelpBlock field={field} />
        </div>
      </div>
    );
  }

  if (field.type === "inline_date") {
    return (
      <div className="flex min-w-0 items-start">
        <span className="flex w-9 shrink-0" aria-hidden />
        <span className="mr-3 w-px self-stretch" style={{ backgroundColor: again.divider }} aria-hidden />
        <div className="min-w-0 pb-1">
          <span className="text-[13px] font-bold leading-tight" style={{ color: again.title }}>
            {field.label}
          </span>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={31}
              value={Number(values.annual_inventory_day ?? field.defaultDay)}
              onChange={(e) => onChange("annual_inventory_day", Number(e.target.value) || 1)}
              className="h-8 w-14 rounded-[3px] border border-input bg-background px-2 text-[13px] tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/30"
              style={{ borderColor: again.checkboxBorder, color: again.title }}
            />
            <select
              value={String(values.annual_inventory_month ?? field.defaultMonth)}
              onChange={(e) => onChange("annual_inventory_month", e.target.value)}
              className="h-8 rounded-[3px] border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/30"
              style={{ borderColor: again.checkboxBorder, color: again.title }}
            >
              {field.monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <FieldHelpBlock field={field} />
        </div>
      </div>
    );
  }

  if (field.type === "boolean") {
    const checked = Boolean(value);
    return (
      <div className={field.subGroupLabel ? "col-span-full flex min-w-0 flex-col gap-3" : "flex min-w-0 items-start"}>
        <div className="flex min-w-0 items-start">
          <span className="flex w-9 shrink-0 justify-center pt-[3px]">
            <SettingCheckbox id={inputId} checked={checked} onChange={(next) => onChange(field.key, next)} />
          </span>
          <span className="mr-3 w-px self-stretch" style={{ backgroundColor: again.divider }} aria-hidden />
          <div className="min-w-0 flex-1 pb-1 pt-0">
            <label htmlFor={inputId} className="cursor-pointer">
              <span className="flex items-center gap-1.5">
                <span className="text-[13px] font-bold leading-tight" style={{ color: again.title }}>
                  {field.label}
                </span>
                {field.infoTip ? <InfoTip text={field.help} /> : null}
              </span>
              <FieldHelpBlock field={field} />
            </label>
            {checked && field.subFields && !field.subGroupLabel ? (
              <div className="mt-3 space-y-3">
                {field.subFields.map((sub) => (
                  <SettingCard key={sub.key} field={sub} values={values} onChange={onChange} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {checked && field.subFields && field.subGroupLabel ? (
          <div className="ml-9 space-y-3 border-l pl-4" style={{ borderColor: again.divider }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: again.help }}>
              {field.subGroupLabel}
            </p>
            {field.subFields.map((sub) => (
              <SettingCard key={sub.key} field={sub} values={values} onChange={onChange} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (field.type === "select" && field.asRadio) {
    const selected = String(value);
    return (
      <div className="flex min-w-0 items-start">
        <span className="flex w-9 shrink-0" aria-hidden />
        <span className="mr-3 w-px self-stretch" style={{ backgroundColor: again.divider }} aria-hidden />
        <div className="min-w-0 pb-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[13px] font-bold leading-tight" style={{ color: again.title }}>
              {field.label}
            </p>
            {field.infoTip ? <InfoTip text={field.help} /> : null}
          </div>
          <FieldHelpBlock field={field} />
          <div className="mt-3 space-y-2.5" role="radiogroup" aria-label={field.label}>
            {field.options.map((opt) => {
              const isOn = selected === opt.value;
              return (
                <label key={opt.value} className="flex cursor-pointer items-start gap-2.5">
                  <span
                    className="mt-[2px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border-2"
                    style={{ borderColor: isOn ? again.accent : again.checkboxBorder }}
                  >
                    {isOn ? <span className="h-[8px] w-[8px] rounded-full" style={{ backgroundColor: again.accent }} /> : null}
                  </span>
                  <input
                    type="radio"
                    name={field.key}
                    value={opt.value}
                    checked={isOn}
                    onChange={() => onChange(field.key, opt.value)}
                    className="sr-only"
                  />
                  <span className="text-[13px] font-normal leading-snug" style={{ color: again.title }}>
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Plain select or number.
  return (
    <div className="col-span-full flex min-w-0 items-start">
      <span className="flex w-9 shrink-0" aria-hidden />
      <span className="mr-3 w-px self-stretch" style={{ backgroundColor: again.divider }} aria-hidden />
      <div className="min-w-0 flex-1 pb-1">
        <p className="text-[13px] font-bold leading-tight" style={{ color: again.title }}>
          {field.label}
        </p>
        <FieldHelpBlock field={field} />
        <div className="mt-2">
          {field.type === "select" ? (
            <select
              value={String(value)}
              onChange={(e) => onChange(field.key, e.target.value)}
              className="h-8 w-full max-w-md rounded-[3px] border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/30"
              style={{ borderColor: again.checkboxBorder, color: again.title }}
            >
              {field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              min={0}
              value={Number(value)}
              onChange={(e) => onChange(field.key, Number(e.target.value) || 0)}
              className="h-8 w-28 rounded-[3px] border border-input bg-background px-2 text-[13px] tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/30"
              style={{ borderColor: again.checkboxBorder, color: again.title }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Inventory settings — same layout/tokens as catalog-settings-form.tsx (/website/settings). Saved per company:
 * the Product Settings toggles gate real fields in the Add Product drawer for every user. */
export function InventorySettingsForm() {
  const [saved, setSaved] = useState<InventorySettingsValues>(() => defaultInventorySettingsValues());
  const [values, setValues] = useState<InventorySettingsValues>(() => saved);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchModuleSettings("inventory");
      const next = mergeInventorySettings(res.values);
      setSaved(next);
      // Never saved for this company: start from what this browser kept before settings moved to the server.
      const legacy = res.saved ? null : readLegacyInventorySettings();
      setValues(legacy ? mergeInventorySettings(legacy) : next);
      setDirty(Boolean(legacy));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load inventory settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (next: InventorySettingsValues, message: string) => {
    setSaving(true);
    try {
      const res = await saveModuleSettings("inventory", next);
      const stored = mergeInventorySettings(res.values);
      setSaved(stored);
      setValues(stored);
      setDirty(false);
      clearLegacyInventorySettings();
      toast.success(message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save inventory settings");
    } finally {
      setSaving(false);
    }
  };
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const patch = (key: string, value: boolean | string | number) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => void persist(mergeInventorySettings(values), "Inventory settings saved");

  const handleDiscard = () => {
    setValues(saved);
    setDirty(false);
    toast.message("Changes discarded");
  };

  const handleReset = () => void persist(defaultInventorySettingsValues(), "Inventory settings reset to defaults");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-1 pb-8 pt-2 sm:px-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[1.3rem] font-bold leading-tight" style={{ color: again.title }}>
            Settings
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: again.help }}>
            Inventory
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={saving || loading}>
            Reset to defaults
          </Button>
          {dirty ? (
            <Button variant="outline" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || saving || loading}
            className="bg-[#714B67] text-white hover:bg-[#5c3d54]"
          >
            Save
          </Button>
        </div>
      </div>

      <div className={cn("space-y-5", loading && "pointer-events-none opacity-60")} aria-busy={loading}>
        {INVENTORY_SETTINGS_SECTIONS.map((section) => {
          const visibleFields = section.fields.filter((f) => !f.visibleWhen || Boolean(values[f.visibleWhen]));
          const collapsed = collapsedSections.has(section.id);
          return (
            <section
              key={section.id}
              id={section.id}
              className="overflow-hidden rounded-sm border"
              style={{ borderColor: again.border, backgroundColor: again.bodyBg }}
            >
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                aria-expanded={!collapsed}
                className="flex w-full items-center justify-between px-4 py-2 text-left"
                style={{ backgroundColor: again.headerBg }}
              >
                <h2 className="text-[13px] font-bold leading-none" style={{ color: again.headerText }}>
                  {section.title}
                </h2>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 shrink-0 transition-transform", collapsed && "-rotate-90")}
                  style={{ color: again.help }}
                  aria-hidden
                />
              </button>
              {!collapsed ? (
                <div className="px-4 py-5 sm:px-5" style={{ backgroundColor: again.bodyBg }}>
                  <div className="grid grid-cols-1 gap-x-12 gap-y-7 sm:grid-cols-2">
                    {visibleFields.map((field) => (
                      <SettingCard key={field.key} field={field} values={values} onChange={patch} />
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
