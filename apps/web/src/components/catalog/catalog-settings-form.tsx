"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CATALOG_SETTINGS_SECTIONS,
  defaultCatalogSettingsValues,
  type CatalogSettingField,
  type CatalogSettingsValues,
} from "@/lib/mock-data/catalog-settings";
import { Button } from "@/components/ui/button";
import { FieldHelpTip } from "@/components/sales/field-help-tip";

/** Again settings palette — CSS vars follow light/dark theme. */
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

function SettingCard({
  field,
  values,
  onChange,
}: {
  field: CatalogSettingField;
  values: CatalogSettingsValues;
  onChange: (key: string, value: boolean | string | number) => void;
}) {
  const router = useRouter();
  if (field.visibleWhen && !values[field.visibleWhen]) return null;

  const value = values[field.key];
  const inputId = `catalog-setting-${field.key}`;

  const runAction = (label: string, href?: string) => {
    if (href) {
      router.push(href);
      return;
    }
    toast.info(`${label} — mock`);
  };

  if (field.type === "inline_number") {
    return (
      <div className="flex min-w-0 items-start">
        <span className="flex w-9 shrink-0" aria-hidden />
        <span
          className="mr-3 w-px self-stretch"
          style={{ backgroundColor: again.divider }}
          aria-hidden
        />
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
          <p className="mt-0.5 text-[13px] leading-[1.35]" style={{ color: again.help }}>
            {field.help}
          </p>
        </div>
      </div>
    );
  }

  if (field.type === "boolean") {
    const checked = Boolean(value);
    return (
      <div
        className={
          field.actionButton || field.actionLink
            ? "col-span-full flex min-w-0 items-start"
            : "flex min-w-0 items-start"
        }
      >
        <span className="flex w-9 shrink-0 justify-center pt-[3px]">
          <SettingCheckbox
            id={inputId}
            checked={checked}
            onChange={(next) => onChange(field.key, next)}
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
              {field.infoTip ? <InfoTip text={field.help} /> : null}
            </span>
            <span
              className="mt-0.5 block text-[13px] leading-[1.35]"
              style={{ color: again.help }}
            >
              {field.help}
            </span>
          </label>
          {field.actionButton || field.actionLink ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {field.actionButton ? (
                <button
                  type="button"
                  className="h-8 rounded-[3px] px-3 text-[13px] font-bold text-white hover:opacity-90"
                  style={{ backgroundColor: "#714B67" }}
                  onClick={() => runAction(field.actionButton!.label, field.actionButton!.href)}
                >
                  {field.actionButton.label}
                </button>
              ) : null}
              {field.actionLink ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[13px] font-bold hover:underline"
                  style={{ color: again.accent }}
                  onClick={() => runAction(field.actionLink!.label, field.actionLink!.href)}
                >
                  <span aria-hidden>→</span>
                  {field.actionLink.label}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (field.type === "select" && field.asRadio) {
    const selected = String(value);
    return (
      <div className="flex min-w-0 items-start">
        <span className="flex w-9 shrink-0" aria-hidden />
        <span
          className="mr-3 w-px self-stretch"
          style={{ backgroundColor: again.divider }}
          aria-hidden
        />
        <div className="min-w-0 pb-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[13px] font-bold leading-tight" style={{ color: again.title }}>
              {field.label}
            </p>
            {field.infoTip ? <InfoTip text={field.help} /> : null}
          </div>
          <p className="mt-0.5 text-[13px] leading-[1.35]" style={{ color: again.help }}>
            {field.help}
          </p>
          <div className="mt-3 space-y-2.5" role="radiogroup" aria-label={field.label}>
            {field.options.map((opt) => {
              const isOn = selected === opt.value;
              return (
                <label key={opt.value} className="flex cursor-pointer items-start gap-2.5">
                  <span
                    className="mt-[2px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border-2"
                    style={{
                      borderColor: isOn ? again.accent : again.checkboxBorder,
                    }}
                  >
                    {isOn ? (
                      <span
                        className="h-[8px] w-[8px] rounded-full"
                        style={{ backgroundColor: again.accent }}
                      />
                    ) : null}
                  </span>
                  <input
                    type="radio"
                    name={field.key}
                    value={opt.value}
                    checked={isOn}
                    onChange={() => onChange(field.key, opt.value)}
                    className="sr-only"
                  />
                  <span
                    className="text-[13px] font-normal leading-snug"
                    style={{ color: again.title }}
                  >
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

  if (field.type === "text") {
    return (
      <div className="col-span-full flex min-w-0 items-start">
        <span className="flex w-9 shrink-0" aria-hidden />
        <span
          className="mr-3 w-px self-stretch"
          style={{ backgroundColor: again.divider }}
          aria-hidden
        />
        <div className="min-w-0 flex-1 pb-1">
          <p className="text-[13px] font-bold leading-tight" style={{ color: again.title }}>
            {field.label}
          </p>
          <p className="mt-0.5 text-[13px] leading-[1.35]" style={{ color: again.help }}>
            {field.help}
          </p>
          <div className="mt-2">
            <input
              type="text"
              value={String(value ?? "")}
              placeholder={field.placeholder}
              onChange={(e) => onChange(field.key, e.target.value)}
              className="h-8 w-full max-w-md rounded-[3px] border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/30"
              style={{ borderColor: again.checkboxBorder, color: again.title }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="col-span-full flex min-w-0 items-start">
      <span className="flex w-9 shrink-0" aria-hidden />
      <span
        className="mr-3 w-px self-stretch"
        style={{ backgroundColor: again.divider }}
        aria-hidden
      />
      <div className="min-w-0 flex-1 pb-1">
        <p className="text-[13px] font-bold leading-tight" style={{ color: again.title }}>
          {field.label}
        </p>
        <p className="mt-0.5 text-[13px] leading-[1.35]" style={{ color: again.help }}>
          {field.help}
        </p>
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

/** Catalog settings form — same layout as sales settings, catalog-focused fields. */
export function CatalogSettingsForm() {
  const [values, setValues] = useState<CatalogSettingsValues>(() =>
    defaultCatalogSettingsValues(),
  );
  const [dirty, setDirty] = useState(false);

  const sections = useMemo(() => CATALOG_SETTINGS_SECTIONS, []);

  const patch = (key: string, value: boolean | string | number) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    setDirty(false);
    toast.success("Catalog settings saved (mock)");
  };

  const handleDiscard = () => {
    setValues(defaultCatalogSettingsValues());
    setDirty(false);
    toast.message("Changes discarded");
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-1 pb-8 pt-2 sm:px-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[1.3rem] font-bold leading-tight" style={{ color: again.title }}>
            Settings
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: again.help }}>
            Catalog
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <Button variant="outline" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty}
            className="bg-[#714B67] text-white hover:bg-[#5c3d54]"
          >
            Save
          </Button>
        </div>
      </div>

      <div className="space-y-5" data-key="catalog_management">
        {sections.map((section) => {
          const visibleFields = section.fields.filter(
            (f) => !("visibleWhen" in f && f.visibleWhen) || values[f.visibleWhen!],
          );

          return (
            <section
              key={section.id}
              id={section.id}
              className="overflow-hidden rounded-sm border"
              style={{ borderColor: again.border, backgroundColor: again.bodyBg }}
            >
              <div className="px-4 py-2" style={{ backgroundColor: again.headerBg }}>
                <h2
                  className="text-[13px] font-bold leading-none"
                  style={{ color: again.headerText }}
                >
                  {section.title}
                </h2>
              </div>

              <div className="px-4 py-5 sm:px-5" style={{ backgroundColor: again.bodyBg }}>
                <div className="grid grid-cols-1 gap-x-12 gap-y-7 sm:grid-cols-2">
                  {visibleFields.map((field) => (
                    <SettingCard
                      key={field.key}
                      field={field}
                      values={values}
                      onChange={patch}
                    />
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
