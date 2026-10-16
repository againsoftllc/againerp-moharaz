"use client";

import type { ExplorerEndpointDef, ExplorerFieldDef } from "../../explorer/catalog";
import type { ExplorerFieldValues } from "../../explorer/executor";
import { Field, inputClassName, buttonClassName, Card } from "../ui";

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ExplorerFieldDef;
  value: string | number | boolean | File | null;
  onChange: (value: string | number | boolean | File | null) => void;
}) {
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <Field label={field.label} hint={field.hint}>
        <select
          className={inputClassName()}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  if (field.type === "file") {
    return (
      <Field label={field.label} hint={field.hint}>
        <input
          className={inputClassName("pt-1.5")}
          type="file"
          accept="image/*"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
        {value instanceof File ? (
          <span className="text-[11px] text-muted-foreground">{value.name}</span>
        ) : null}
      </Field>
    );
  }

  if (field.type === "textarea") {
    return (
      <Field label={field.label} hint={field.hint}>
        <textarea
          className={inputClassName("h-24 py-2")}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    );
  }

  return (
    <Field label={field.label} hint={field.hint}>
      <input
        className={inputClassName()}
        type={field.type === "number" ? "number" : "text"}
        value={value == null ? "" : String(value)}
        placeholder={field.placeholder}
        required={field.required}
        onChange={(e) =>
          onChange(field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
        }
      />
    </Field>
  );
}

export function RequestBuilder({
  endpoint,
  values,
  onChange,
  onExecute,
  executing,
}: {
  endpoint: ExplorerEndpointDef;
  values: ExplorerFieldValues;
  onChange: (key: string, value: string | number | boolean | File | null) => void;
  onExecute: () => void;
  executing: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
            {endpoint.method}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{endpoint.path}</span>
        </div>
        <h3 className="mt-2 text-sm font-semibold text-foreground">{endpoint.name}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{endpoint.description}</p>
      </div>

      {endpoint.fields.length === 0 ? (
        <p className="mb-3 text-xs text-muted-foreground">No input parameters for this endpoint.</p>
      ) : (
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          {endpoint.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={values[field.key] ?? (field.type === "file" ? null : "")}
              onChange={(v) => onChange(field.key, v)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className={buttonClassName("primary")}
        disabled={executing}
        onClick={onExecute}
      >
        {executing ? "Executing…" : "Execute Request"}
      </button>
    </Card>
  );
}
