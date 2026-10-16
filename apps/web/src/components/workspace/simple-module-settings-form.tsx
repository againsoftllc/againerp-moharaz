"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  SIMPLE_MODULE_SETTINGS,
  defaultSimpleModuleValues,
  readSimpleModuleSettings,
  writeSimpleModuleSettings,
  type SimpleSettingField,
  type SimpleSettingsValues,
} from "@/lib/workspace/simple-module-settings";

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
      className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        borderColor: checked ? "#00a09d" : "var(--input)",
        backgroundColor: checked ? "#00a09d" : "var(--background)",
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

function FieldShell({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{help}</p>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

function SettingField({
  field,
  value,
  onChange,
}: {
  field: SimpleSettingField;
  value: boolean | string | number;
  onChange: (key: string, next: boolean | string | number) => void;
}) {
  const id = `module-setting-${field.key}`;

  if (field.type === "boolean") {
    return (
      <div className="flex min-w-0 items-start gap-3">
        <SettingCheckbox id={id} checked={Boolean(value)} onChange={(next) => onChange(field.key, next)} />
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          <p className="text-[13px] font-semibold text-foreground">{field.label}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{field.help}</p>
        </label>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <FieldShell label={field.label} help={field.help}>
        <select
          id={id}
          value={String(value)}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="h-8 w-full max-w-md rounded-none border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FieldShell>
    );
  }

  if (field.type === "number") {
    return (
      <FieldShell label={field.label} help={field.help}>
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="number"
            min={field.min}
            max={field.max}
            value={Number(value)}
            onChange={(e) => onChange(field.key, Number(e.target.value) || 0)}
            className="h-8 w-28 rounded-none border border-input bg-background px-2 text-[13px] tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {field.suffix ? <span className="text-[12px] text-muted-foreground">{field.suffix}</span> : null}
        </div>
      </FieldShell>
    );
  }

  return (
    <FieldShell label={field.label} help={field.help}>
      <input
        id={id}
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(field.key, e.target.value)}
        className="h-8 w-full max-w-md rounded-none border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </FieldShell>
  );
}

export function SimpleModuleSettingsForm({ moduleId }: { moduleId: string }) {
  const def = SIMPLE_MODULE_SETTINGS[moduleId];
  const [draft, setDraft] = useState<SimpleSettingsValues>(() => defaultSimpleModuleValues(moduleId));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(readSimpleModuleSettings(moduleId));
    setDirty(false);
  }, [moduleId]);

  const sections = useMemo(() => def?.sections ?? [], [def]);

  if (!def) {
    return <p className="p-4 text-xs text-muted-foreground">No settings for this module.</p>;
  }

  const patch = (key: string, value: boolean | string | number) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    writeSimpleModuleSettings(moduleId, draft);
    setDirty(false);
    toast.success(`${def.title} saved`);
  };

  const handleDiscard = () => {
    setDraft(readSimpleModuleSettings(moduleId));
    setDirty(false);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">{def.title}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{def.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {dirty ? (
            <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={handleDiscard}>
              Discard
            </Button>
          ) : null}
          <Button type="button" size="sm" className="rounded-none" disabled={!dirty} onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {sections.map((section) => (
          <section key={section.id} className="overflow-hidden rounded-none border border-border bg-card">
            <div className="border-b border-border bg-muted px-4 py-2">
              <h2 className="text-[13px] font-semibold text-foreground">{section.title}</h2>
            </div>
            <div className="space-y-5 px-4 py-4">
              {section.fields.map((field) => (
                <SettingField
                  key={field.key}
                  field={field}
                  value={draft[field.key] ?? field.defaultValue}
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
