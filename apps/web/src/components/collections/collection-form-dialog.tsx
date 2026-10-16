"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SlugInput } from "@/components/ui/slug-input";
import {
  COLLECTION_TYPE_LABELS,
  type CollectionStatus,
  type CollectionType,
  type ProductCollection,
} from "@/lib/mock-data/collections";
import { validateSlug } from "@/lib/url-slug/validate-slug";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  collection?: ProductCollection | null;
  onSave: (data: Partial<ProductCollection>) => void;
  onLiveChange?: (data: Partial<ProductCollection> & { id: string }) => void;
};

const TYPE_OPTIONS: CollectionType[] = [
  "custom",
  "rules",
  "dynamic",
  "featured",
  "new_arrivals",
  "best_sellers",
  "trending",
];

const STATUS_OPTIONS: CollectionStatus[] = ["draft", "active", "inactive", "archived"];

export function CollectionFormDialog({
  open,
  onOpenChange,
  mode = "create",
  collection,
  onSave,
  onLiveChange,
}: Props) {
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<CollectionType>("custom");
  const [status, setStatus] = useState<CollectionStatus>("draft");
  const [ruleSummary, setRuleSummary] = useState("");
  const [description, setDescription] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState<string | undefined>();

  const isSystem = collection?.isSystem === true;

  useEffect(() => {
    if (open) {
      setSlug(collection?.slug ?? "");
      setType(collection?.type ?? "custom");
      setStatus(collection?.status ?? "draft");
      setRuleSummary(collection?.ruleSummary ?? "");
      setDescription(collection?.description ?? "");
      setHeroImageUrl(collection?.heroImageUrl);
    }
  }, [open, collection]);

  const pushLiveChange = useCallback(
    (next: Partial<Pick<ProductCollection, "status" | "type">>) => {
      if (mode === "edit" && collection?.id && onLiveChange) {
        onLiveChange({ id: collection.id, ...next });
      }
    },
    [collection, mode, onLiveChange],
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const slugValidation = validateSlug(slug, collection?.id ? { id: collection.id } : undefined);
    if (slug.trim() && !slugValidation.isValid) {
      toast.error(slugValidation.message ?? "Invalid slug");
      return;
    }
    const fd = new FormData(e.currentTarget);
    onSave({
      name: String(fd.get("name") ?? ""),
      slug,
      type: isSystem ? collection!.type : type,
      status,
      ruleSummary: ruleSummary || undefined,
      description: description || undefined,
      metaTitle: String(fd.get("metaTitle") ?? "") || undefined,
      metaDescription: String(fd.get("metaDescription") ?? "") || undefined,
      scheduleStart: String(fd.get("scheduleStart") ?? "") || undefined,
      scheduleEnd: String(fd.get("scheduleEnd") ?? "") || undefined,
      heroImageUrl,
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(640px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-input bg-background shadow-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-input px-5 py-4">
            <Dialog.Title className="text-base font-semibold">
              {mode === "create" ? "Add Collection" : "Edit Collection"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {isSystem && (
                <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  System collection — type and rules are managed automatically.
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="col-name">Name</Label>
                <Input
                  id="col-name"
                  name="name"
                  defaultValue={collection?.name}
                  required
                  placeholder="Summer Sale 2026"
                />
              </div>

              <div className="space-y-2">
                <Label>Slug</Label>
                <SlugInput value={slug} onChange={setSlug} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={type}
                    onChange={(e) => {
                      const v = e.target.value as CollectionType;
                      setType(v);
                      pushLiveChange({ type: v });
                    }}
                    disabled={isSystem}
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {COLLECTION_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={status}
                    onChange={(e) => {
                      const v = e.target.value as CollectionStatus;
                      setStatus(v);
                      pushLiveChange({ status: v });
                    }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {!isSystem && (
                <div className="space-y-2">
                  <Label>Rule summary</Label>
                  <Textarea
                    value={ruleSummary}
                    onChange={(e) => setRuleSummary(e.target.value)}
                    rows={2}
                    placeholder="brand = UrbanWear AND category = Electronics"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional merchandising notes"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="scheduleStart">Schedule start</Label>
                  <Input
                    id="scheduleStart"
                    name="scheduleStart"
                    type="date"
                    defaultValue={collection?.scheduleStart}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scheduleEnd">Schedule end</Label>
                  <Input
                    id="scheduleEnd"
                    name="scheduleEnd"
                    type="date"
                    defaultValue={collection?.scheduleEnd}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Hero image</Label>
                <div className="flex items-center gap-3">
                  {heroImageUrl ? (
                    <img src={heroImageUrl} alt="" className="h-14 w-20 rounded object-cover" />
                  ) : (
                    <span className="flex h-14 w-20 items-center justify-center rounded border border-dashed border-input bg-muted/40">
                      <ImagePlus className="h-5 w-5 text-muted-foreground" />
                    </span>
                  )}
                  <Input
                    value={heroImageUrl ?? ""}
                    onChange={(e) => setHeroImageUrl(e.target.value || undefined)}
                    placeholder="Image URL (mock)"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="metaTitle">SEO title</Label>
                <Input id="metaTitle" name="metaTitle" defaultValue={collection?.metaTitle} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="metaDescription">SEO description</Label>
                <Textarea
                  id="metaDescription"
                  name="metaDescription"
                  rows={2}
                  defaultValue={collection?.metaDescription}
                />
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-input px-5 py-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">{mode === "create" ? "Create" : "Save"}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
