"use client";

import { useEffect, useState } from "react";
import { FileStack } from "lucide-react";
import { CONFIGURATOR_STATUSES, STATUS_LABELS, type ConfiguratorTemplate } from "@/lib/configurator/types";
import { useConfiguratorProfiles } from "@/lib/api/use-configurator-profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type SaveData = {
  profileId: string;
  name: string;
  slug?: string;
  description?: string;
  components: ConfiguratorTemplate["components"];
  isFeatured: boolean;
  status: ConfiguratorTemplate["status"];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: ConfiguratorTemplate | null;
  defaultProfileId: string;
  onSave: (data: SaveData) => void;
};

export function ConfiguratorTemplateFormSheet({
  open,
  onOpenChange,
  template,
  defaultProfileId,
  onSave,
}: Props) {
  const { profiles } = useConfiguratorProfiles();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [profileId, setProfileId] = useState(defaultProfileId);
  const [status, setStatus] = useState<ConfiguratorTemplate["status"]>("draft");
  const [isFeatured, setIsFeatured] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setSlug(template?.slug ?? "");
    setDescription(template?.description ?? "");
    setProfileId(template?.profileId ?? defaultProfileId);
    setStatus(template?.status ?? "draft");
    setIsFeatured(template?.isFeatured ?? false);
  }, [open, template, defaultProfileId]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      profileId,
      name: name.trim(),
      slug: slug.trim() || undefined,
      description: description.trim() || undefined,
      components: template?.components ?? [],
      status,
      isFeatured,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <div className="flex items-center gap-2 border-b border-input pb-3">
          <FileStack className="h-5 w-5 text-indigo-600" />
          <h2 className="text-base font-semibold">{template ? "Edit template" : "Create template"}</h2>
        </div>
        <div className="mt-4 space-y-3">
          <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Slug</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} /></div>
          <div className="space-y-1">
            <Label className="text-xs">Profile</Label>
            <Select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="h-9 text-xs">
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as ConfiguratorTemplate["status"])} className="h-9 text-xs">
              {CONFIGURATOR_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="flex items-center gap-2">
            <Switch checked={isFeatured} onCheckedChange={setIsFeatured} id="tpl-featured" />
            <Label htmlFor="tpl-featured" className="text-xs">Featured on storefront</Label>
          </div>
          {template && template.components.length > 0 && (
            <div className="rounded-md border border-input bg-muted/20 p-2 text-[11px]">
              <p className="font-medium">{template.components.length} pre-selected components</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {template.components.map((c, i) => (
                  <li key={i}>{c.categoryName}: {c.productName ?? "—"} ×{c.quantity}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="mt-auto flex gap-2 border-t border-input pt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave}>{template ? "Save" : "Create"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
