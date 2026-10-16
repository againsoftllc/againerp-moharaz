"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CUSTOMER_SETTINGS_SECTIONS,
  mergeCustomerSettingsValues,
  type CustomerSettingKey,
  type CustomerSettingsValues,
} from "@/lib/customers/customer-settings";
import { useSettingsStore } from "@/lib/store/settings-store";
import { Button } from "@/components/ui/button";
import { FieldHelpTip } from "@/components/sales/field-help-tip";

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

/** Customers Configuration › Settings form. */
export function CustomerSettingsForm() {
  const storeValues = useSettingsStore((s) => s.values);
  const setValue = useSettingsStore((s) => s.setValue);
  const resetCategory = useSettingsStore((s) => s.resetCategory);

  const [draft, setDraft] = useState<CustomerSettingsValues>(() =>
    mergeCustomerSettingsValues(storeValues),
  );
  const [dirty, setDirty] = useState(false);

  const sections = useMemo(() => CUSTOMER_SETTINGS_SECTIONS, []);

  const patch = (key: CustomerSettingKey, value: boolean) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    for (const section of CUSTOMER_SETTINGS_SECTIONS) {
      for (const field of section.fields) {
        setValue(field.key, draft[field.key], { label: field.label });
      }
    }
    setDirty(false);
    toast.success("Customer settings saved");
  };

  const handleDiscard = () => {
    setDraft(mergeCustomerSettingsValues(storeValues));
    setDirty(false);
  };

  const handleReset = () => {
    const keys = CUSTOMER_SETTINGS_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));
    resetCategory(keys);
    setDraft(mergeCustomerSettingsValues(null));
    setDirty(false);
    toast.success("Customer settings reset to defaults");
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">Customer Settings</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Choose which customer options appear on the profile and in the Customers menu.
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
        {sections.map((section) => (
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
              {section.fields.map((field) => {
                const inputId = `customer-setting-${field.key}`;
                const checked = Boolean(draft[field.key]);
                return (
                  <div key={field.key} className="flex min-w-0 items-start">
                    <span className="flex w-9 shrink-0 justify-center pt-[3px]">
                      <SettingCheckbox
                        id={inputId}
                        checked={checked}
                        onChange={(next) => patch(field.key, next)}
                      />
                    </span>
                    <span
                      className="mr-3 w-px self-stretch"
                      style={{ backgroundColor: again.divider }}
                      aria-hidden
                    />
                    <div className="min-w-0 pb-1 pt-0">
                      <label htmlFor={inputId} className="cursor-pointer">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="text-[13px] font-bold leading-tight"
                            style={{ color: again.title }}
                          >
                            {field.label}
                          </span>
                          <FieldHelpTip label={field.help} />
                        </span>
                        <span
                          className="mt-0.5 block text-[13px] leading-[1.35]"
                          style={{ color: again.help }}
                        >
                          {field.help}
                        </span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
