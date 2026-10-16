"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  createSeoRedirect,
  updateSeoRedirect,
  type ApiSeoRedirect,
} from "@/lib/api/seo-redirects";
import type { RedirectStatus, RedirectType } from "@/lib/mock-data/seo";
import { formatQuantity } from "@/lib/utils";

const TYPE_OPTIONS: { value: RedirectType; label: string }[] = [
  { value: "301", label: "301 — moved permanently" },
  { value: "302", label: "302 — found (temporary)" },
  { value: "307", label: "307 — temporary redirect" },
  { value: "308", label: "308 — permanent redirect" },
  { value: "410", label: "410 — gone for good" },
];

const STATUS_OPTIONS: { value: RedirectStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "disabled", label: "Disabled" },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Create or edit one redirect rule. A 410 has no destination by design. */
export function SeoRedirectDrawer({
  open,
  onOpenChange,
  row,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create a new rule. */
  row: ApiSeoRedirect | null;
  onSaved?: () => void;
}) {
  const [fromPath, setFromPath] = useState(row?.from_path ?? "");
  const [toPath, setToPath] = useState(row?.to_path ?? "");
  const [type, setType] = useState<RedirectType>((row?.redirect_type as RedirectType) ?? "301");
  const [status, setStatus] = useState<RedirectStatus>(
    (row?.status as RedirectStatus) ?? "active",
  );
  const [note, setNote] = useState(row?.note ?? "");
  const [saving, setSaving] = useState(false);

  const gone = type === "410";

  const save = async () => {
    if (!fromPath.trim()) {
      toast.error("The source path is required");
      return;
    }
    if (!gone && !toPath.trim()) {
      toast.error("A destination is required for every type except 410");
      return;
    }
    setSaving(true);
    try {
      const input = { from: fromPath, to: toPath, type, status, note };
      if (row) {
        await updateSeoRedirect(row.id, input);
        toast.success(`${fromPath} updated`);
      } else {
        await createSeoRedirect(input);
        toast.success(`${fromPath} created`);
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the redirect");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[420px] flex-col gap-0 overflow-y-auto">
        <div className="border-b border-border pb-3">
          <h3 className="text-sm font-semibold">{row ? "Edit redirect" : "New redirect"}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sends visitors and search engines from an old path to the new one.
          </p>
        </div>

        <div className="flex-1 space-y-4 py-4">
          <Field label="From" hint="The old path, e.g. /old-laptops">
            <Input
              value={fromPath}
              onChange={(e) => setFromPath(e.target.value)}
              placeholder="/old-path"
              className="rounded-none font-mono text-[12px]"
            />
          </Field>

          <Field label="Type">
            <FilterSelect
              value={type}
              onChange={(next) => setType(next as RedirectType)}
              width="w-full"
              ariaLabel="Redirect type"
              options={TYPE_OPTIONS}
            />
          </Field>

          {!gone && (
            <Field label="To" hint="Where the visitor should land instead.">
              <Input
                value={toPath}
                onChange={(e) => setToPath(e.target.value)}
                placeholder="/new-path"
                className="rounded-none font-mono text-[12px]"
              />
            </Field>
          )}

          <Field label="Status">
            <FilterSelect
              value={status}
              onChange={(next) => setStatus(next as RedirectStatus)}
              width="w-full"
              ariaLabel="Status"
              options={STATUS_OPTIONS}
            />
          </Field>

          <Field label="Note" hint="Why this rule exists — useful months later.">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="rounded-none text-[12px]"
            />
          </Field>

          {row && row.hits_30d > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {formatQuantity(row.hits_30d)} hits in the last 30 days.
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border pt-3">
          <Button className="rounded-none" disabled={saving} onClick={save}>
            {saving ? "Saving…" : row ? "Save" : "Create"}
          </Button>
          <Button
            variant="outline"
            className="rounded-none"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
