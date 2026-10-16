"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Cpu, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CONFIGURATOR_FIELD_TYPE_LABELS } from "@/lib/attributes/field-types";
import { validateProfileValues } from "@/lib/attributes/validate-attribute-values";
import { countConfiguratorProfileFields, ensureFieldSortOrder } from "@/lib/mock-data/configurator-attributes";
import { useConfiguratorAttributeStore } from "@/lib/store/configurator-attribute-store";
import { ConfiguratorFieldFormDialog } from "@/components/configurator/configurator-field-form-dialog";
import { ConfiguratorAttributeValueTester } from "@/components/configurator/configurator-attribute-value-tester";
import { ConfiguratorSortableList } from "@/components/configurator/configurator-sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  profileId: string;
};

export function ConfiguratorAttributeProfileBuilder({ profileId }: Props) {
  const profile = useConfiguratorAttributeStore((s) => s.profiles.find((p) => p.id === profileId));
  const allFields = useConfiguratorAttributeStore((s) => s.fields);
  const fields = useMemo(
    () => ensureFieldSortOrder(allFields.filter((f) => f.profileId === profileId)),
    [allFields, profileId],
  );
  const upsertField = useConfiguratorAttributeStore((s) => s.upsertField);
  const deleteFields = useConfiguratorAttributeStore((s) => s.deleteFields);
  const reorderFields = useConfiguratorAttributeStore((s) => s.reorderFields);

  const [formOpen, setFormOpen] = useState(false);
  const [editField, setEditField] = useState<(typeof fields)[0] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const fieldCount = useMemo(
    () => countConfiguratorProfileFields(profileId, allFields),
    [profileId, allFields],
  );

  const validationPreview = useMemo(() => {
    return validateProfileValues(fields, []);
  }, [fields]);

  if (!profile) {
    return (
      <div className="rounded-lg border border-dashed border-input p-8 text-center">
        <p className="text-sm font-medium">Profile not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href="/configurator/attributes">Back to profiles</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/configurator/attributes">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Profiles
          </Link>
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <Cpu className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold">{profile.name}</h2>
            <p className="text-xs text-muted-foreground">
              {profile.categoryName} · {fieldCount} attributes · normalized storage
            </p>
          </div>
          <Badge variant={profile.active ? "success" : "muted"}>{profile.active ? "Active" : "Inactive"}</Badge>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen((v) => !v)}>
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            {previewOpen ? "Hide validation" : "Validation preview"}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditField(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add attribute
          </Button>
        </div>
      </div>

      {previewOpen && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 text-xs dark:border-indigo-900/50 dark:bg-indigo-950/20">
          <p className="font-medium text-foreground">Validation layer (empty values)</p>
          <p className="mt-1 text-muted-foreground">
            Required fields without values:{" "}
            {validationPreview.issues.length === 0
              ? "none (no product values loaded)"
              : validationPreview.issues.map((i) => i.fieldCode).join(", ")}
          </p>
        </div>
      )}

      <div className="rounded-lg border border-input bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Component attributes — drag to reorder
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Reuses AgainERP attribute field types. Values stored in normalized columns: text, number, boolean,
          option_ids.
        </p>

        <div className="mt-3">
          <ConfiguratorSortableList
            items={fields}
            onReorder={(ids) => reorderFields(profileId, ids)}
            onAdd={() => {
              setEditField(null);
              setFormOpen(true);
            }}
            addLabel="Add attribute"
            emptyLabel="No attributes — add Socket, TDP, RAM Type, etc."
            renderItem={(field) => (
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{field.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {field.code} · {CONFIGURATOR_FIELD_TYPE_LABELS[field.fieldType]}
                    {field.unit ? ` · ${field.unit}` : ""}
                    {field.isRequired ? " · required" : ""}
                  </p>
                </div>
                {field.options && field.options.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {field.options.length} options
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => {
                    setEditField(field);
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive"
                  onClick={() => {
                    deleteFields([field.id]);
                    toast.success("Field deleted");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          />
        </div>
      </div>

      {previewOpen && <ConfiguratorAttributeValueTester fields={fields} />}

      <ConfiguratorFieldFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        profileId={profileId}
        field={editField}
        onSave={(data) => upsertField(data)}
      />
    </div>
  );
}
