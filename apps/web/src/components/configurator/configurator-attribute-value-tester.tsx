"use client";

import { useMemo, useState } from "react";
import { validateProfileValues } from "@/lib/attributes/validate-attribute-values";
import type { ConfiguratorAttributeField } from "@/lib/mock-data/configurator-attributes";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";

type Props = {
  fields: ConfiguratorAttributeField[];
};

export function ConfiguratorAttributeValueTester({ fields }: Props) {
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const rawInputs = useMemo(
    () =>
      fields.map((f) => ({
        fieldId: f.id,
        value: inputs[f.id] ?? "",
        optionIds:
          f.fieldType === "dropdown" || f.fieldType === "multi_select"
            ? inputs[f.id]
              ? [inputs[f.id]]
              : []
            : undefined,
      })),
    [fields, inputs],
  );

  const result = useMemo(() => validateProfileValues(fields, rawInputs), [fields, rawInputs]);

  return (
    <div className="rounded-lg border border-input bg-muted/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Validation tester
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Enter sample component values — normalized columns: text_value, number_value, boolean_value,
        option_ids
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {fields
          .filter((f) => f.active)
          .map((field) => (
            <div key={field.id} className="space-y-1">
              <Label className="text-xs">
                {field.name}
                {field.isRequired && <span className="text-destructive"> *</span>}
              </Label>
              {field.fieldType === "boolean" ? (
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={inputs[field.id] === "true"}
                    onCheckedChange={(v) =>
                      setInputs((prev) => ({ ...prev, [field.id]: v ? "true" : "false" }))
                    }
                  />
                  {inputs[field.id] === "true" ? "Yes" : "No"}
                </label>
              ) : field.fieldType === "dropdown" && field.options?.length ? (
                <Select
                  value={inputs[field.id] ?? ""}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  className="h-8 text-xs"
                >
                  <option value="">—</option>
                  {field.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={inputs[field.id] ?? ""}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={field.unit ? `e.g. 65 ${field.unit}` : "Value"}
                  className="h-8 text-xs"
                />
              )}
            </div>
          ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant={result.valid ? "success" : "warning"}>
          {result.valid ? "Valid" : `${result.issues.filter((i) => i.severity === "error").length} errors`}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {result.normalized.length} normalized value(s)
        </span>
      </div>

      {result.issues.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-destructive">
          {result.issues.map((issue, i) => (
            <li key={i}>
              {issue.fieldName}: {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
