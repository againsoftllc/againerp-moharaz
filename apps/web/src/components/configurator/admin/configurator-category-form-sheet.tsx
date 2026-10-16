"use client";

import { useEffect, useState } from "react";
import { FolderTree } from "lucide-react";
import { CONFIGURATOR_STATUSES, STATUS_LABELS, type ConfiguratorCategory } from "@/lib/configurator/types";
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
  sortOrder: number;
  isRequired: boolean;
  selectionMode: ConfiguratorCategory["selectionMode"];
  status: ConfiguratorCategory["status"];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: ConfiguratorCategory | null;
  defaultProfileId: string;
  profileName: string;
  onSave: (data: SaveData) => void;
};

export function ConfiguratorCategoryFormSheet({
  open,
  onOpenChange,
  category,
  defaultProfileId,
  profileName,
  onSave,
}: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(1);
  const [isRequired, setIsRequired] = useState(true);
  const [selectionMode, setSelectionMode] = useState<"single" | "multiple">("single");
  const [status, setStatus] = useState<ConfiguratorCategory["status"]>("draft");

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setSlug(category?.slug ?? "");
    setDescription(category?.description ?? "");
    setSortOrder(category?.sortOrder ?? 1);
    setIsRequired(category?.isRequired ?? true);
    setSelectionMode(category?.selectionMode ?? "single");
    setStatus(category?.status ?? "draft");
  }, [open, category]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      profileId: category?.profileId ?? defaultProfileId,
      name: name.trim(),
      slug: slug.trim() || undefined,
      description: description.trim() || undefined,
      sortOrder,
      isRequired,
      selectionMode,
      status,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <div className="flex items-center gap-2 border-b border-input pb-3">
          <FolderTree className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold">{category ? "Edit category" : "Create category"}</h2>
            <p className="text-[11px] text-muted-foreground">{profileName}</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1">
            <Label className="text-xs">Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
            <p className="text-[10px] text-muted-foreground">
              Must match a Catalog category slug so products appear in this slot.{" "}
              <a href="/website/categories" className="underline hover:text-foreground">
                Open catalog categories
              </a>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">Sort order</Label><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} /></div>
            <div className="space-y-1">
              <Label className="text-xs">Selection</Label>
              <Select value={selectionMode} onChange={(e) => setSelectionMode(e.target.value as "single" | "multiple")} className="h-9 text-xs">
                <option value="single">Single</option><option value="multiple">Multiple</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as ConfiguratorCategory["status"])} className="h-9 text-xs">
              {CONFIGURATOR_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="flex items-center gap-2">
            <Switch checked={isRequired} onCheckedChange={setIsRequired} id="cat-required" />
            <Label htmlFor="cat-required" className="text-xs">Required slot in builder</Label>
          </div>
        </div>
        <div className="mt-auto flex gap-2 border-t border-input pt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave}>{category ? "Save" : "Create"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
