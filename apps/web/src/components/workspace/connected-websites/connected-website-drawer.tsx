"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  normalizeStorefrontBaseUrl,
  useConnectedWebsitesStore,
  type ConnectedWebsite,
  type WebsiteEnvironment,
} from "@/lib/store/connected-websites-store";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  website?: ConnectedWebsite | null;
};

export function ConnectedWebsiteDrawer({ open, onOpenChange, website }: Props) {
  const add = useConnectedWebsitesStore((s) => s.add);
  const update = useConnectedWebsitesStore((s) => s.update);
  const isEdit = Boolean(website);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [environment, setEnvironment] = useState<WebsiteEnvironment>("live");
  const [notes, setNotes] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (website) {
      setName(website.name);
      setBaseUrl(website.baseUrl);
      setEnvironment(website.environment);
      setNotes(website.notes ?? "");
      setIsPrimary(website.isPrimary);
    } else {
      setName("");
      setBaseUrl("");
      setEnvironment("live");
      setNotes("");
      setIsPrimary(true);
    }
  }, [open, website]);

  const handleSave = () => {
    const normalized = normalizeStorefrontBaseUrl(baseUrl);
    if (!normalized) {
      toast.error("Enter a valid http:// or https:// URL");
      return;
    }
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      if (isEdit && website) {
        update(website.id, {
          name: name.trim(),
          baseUrl: normalized,
          environment,
          notes,
          isPrimary,
          status: "connected",
        });
        toast.success("Website updated");
      } else {
        add({
          name: name.trim(),
          baseUrl: normalized,
          environment,
          notes,
          isPrimary,
          status: "connected",
        });
        toast.success("Website connected");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save website");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <h2 className="pr-8 text-base font-semibold">
          {isEdit ? "Edit website" : "Connect website"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Register a separate storefront project by URL — local (e.g. localhost) or live
          (e.g. againerp.vercel.app).
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="AgainERP"
              className="rounded-none"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Base URL</span>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://againerp.vercel.app"
              className="rounded-none font-mono text-xs"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Local example: http://localhost:3000 · Live: https://againerp.com
            </span>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Environment</span>
            <Select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as WebsiteEnvironment)}
              className="w-full rounded-none"
            >
              <option value="local">Local</option>
              <option value="live">Live</option>
            </Select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Notes</span>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — staging, custom domain…"
              className="rounded-none"
            />
          </label>

          <div>
            <Label className="sr-only">Primary storefront</Label>
            <Switch
              label="Set as primary"
              description="Primary URL is used for live edit and storefront previews"
              checked={isPrimary}
              onCheckedChange={setIsPrimary}
            />
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Connect"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
