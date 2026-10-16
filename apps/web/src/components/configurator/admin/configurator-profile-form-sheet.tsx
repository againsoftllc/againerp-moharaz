"use client";

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { toast } from "sonner";
import {
  CONFIGURATOR_PROFILE_TYPES,
  PROFILE_TYPE_LABELS,
  CONFIGURATOR_STATUSES,
  STATUS_LABELS,
  type ConfiguratorProfile,
} from "@/lib/configurator/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type SavePayload = {
  name: string;
  slug?: string;
  profileType: ConfiguratorProfile["profileType"];
  status: ConfiguratorProfile["status"];
  description?: string;
  isDefault: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: ConfiguratorProfile | null;
  onSave: (data: SavePayload) => void | Promise<void>;
};

export function ConfiguratorProfileFormSheet({ open, onOpenChange, profile, onSave }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [profileType, setProfileType] = useState<ConfiguratorProfile["profileType"]>("pc_builder");
  const [status, setStatus] = useState<ConfiguratorProfile["status"]>("draft");
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(profile?.name ?? "");
    setSlug(profile?.slug ?? "");
    setDescription(profile?.description ?? "");
    setProfileType(profile?.profileType ?? "pc_builder");
    setStatus(profile?.status ?? "draft");
    setIsDefault(profile?.isDefault ?? false);
  }, [open, profile]);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    void onSave({
      name: name.trim(),
      slug: slug.trim() || undefined,
      description: description.trim() || undefined,
      profileType,
      status,
      isDefault,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <div className="flex items-center gap-2 border-b border-input pb-3">
          <Layers className="h-5 w-5 text-indigo-600" />
          <h2 className="text-base font-semibold">{profile ? "Edit profile" : "Create profile"}</h2>
        </div>

        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="PC Builder" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="pc-builder" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select
              value={profileType}
              onChange={(e) => {
                const next = e.target.value as ConfiguratorProfile["profileType"];
                setProfileType(next);
                if (!profile && !slug.trim()) {
                  const suggested = next.replace(/_/g, "-");
                  setSlug(suggested);
                }
              }}
              className="h-9 text-xs"
              disabled={Boolean(profile)}
            >
              {CONFIGURATOR_PROFILE_TYPES.map((t) => (
                <option key={t} value={t}>{PROFILE_TYPE_LABELS[t]}</option>
              ))}
            </Select>
            {!profile && (
              <p className="text-[10px] text-muted-foreground">
                Creating a typed profile auto-seeds its slot pack (PC, CCTV, Laptop, …).
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as ConfiguratorProfile["status"])} className="h-9 text-xs">
              {CONFIGURATOR_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isDefault} onCheckedChange={setIsDefault} id="profile-default" />
            <Label htmlFor="profile-default" className="text-xs">Default profile for this type</Label>
          </div>
        </div>

        <div className="mt-auto flex gap-2 border-t border-input pt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave}>{profile ? "Save" : "Create"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
