"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  FILTER_DISPLAY_LABELS,
  type CatalogFacetFilter,
  type FilterDisplayType,
  type FilterSource,
} from "@/lib/mock-data/catalog-filters";

type AttributeOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  filter?: CatalogFacetFilter | null;
  attributeOptions?: AttributeOption[];
  onSave: (data: Partial<CatalogFacetFilter>) => void;
  onLiveChange?: (data: Partial<CatalogFacetFilter> & { id: string }) => void;
};

const DISPLAY_TYPES: FilterDisplayType[] = [
  "multi_select",
  "range",
  "boolean",
  "color",
  "dynamic",
];

const CATEGORY_SCOPES = [
  "All categories",
  "Electronics",
  "Laptops",
  "Phones & Tablets",
  "Fashion",
  "Home & Living",
];

export function CatalogFilterFormDialog({
  open,
  onOpenChange,
  mode = "create",
  filter,
  attributeOptions = [],
  onSave,
  onLiveChange,
}: Props) {
  const [displayType, setDisplayType] = useState<FilterDisplayType>("multi_select");
  const [source, setSource] = useState<FilterSource>("attribute");
  const [attributeId, setAttributeId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [storefrontVisible, setStorefrontVisible] = useState(true);
  const [categoryScope, setCategoryScope] = useState("All categories");

  const isSystem = filter?.isSystem === true;

  useEffect(() => {
    if (open) {
      setDisplayType(filter?.displayType ?? "multi_select");
      setSource(filter?.source ?? "attribute");
      setAttributeId(filter?.attributeId ?? "");
      setIsActive(filter?.isActive ?? true);
      setStorefrontVisible(filter?.storefrontVisible ?? true);
      setCategoryScope(filter?.categoryScope ?? "All categories");
    }
  }, [open, filter]);

  const pushLiveChange = useCallback(
    (next: Partial<Pick<CatalogFacetFilter, "isActive" | "storefrontVisible">>) => {
      if (mode === "edit" && filter?.id && onLiveChange) {
        onLiveChange({ id: filter.id, ...next });
      }
    },
    [filter, mode, onLiveChange],
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "");
    const paramKey = String(fd.get("paramKey") ?? "");
    const attr = attributeOptions.find((a) => a.id === attributeId);

    onSave({
      name,
      paramKey,
      displayType: isSystem ? filter!.displayType : displayType,
      source: isSystem ? filter!.source : source,
      attributeId: attr?.id,
      attributeName: attr?.name ?? (source === "built_in" ? String(fd.get("attributeName") ?? "—") : "—"),
      isActive,
      storefrontVisible,
      categoryScope,
      urlExample: `?${paramKey}=`,
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
              {mode === "create" ? "Add Filter" : "Edit Filter"}
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
                  System filter — display type and source are fixed.
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="flt-name">Name</Label>
                <Input
                  id="flt-name"
                  name="name"
                  defaultValue={filter?.name}
                  required
                  placeholder="Brand"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="flt-param">URL parameter</Label>
                <Input
                  id="flt-param"
                  name="paramKey"
                  defaultValue={filter?.paramKey}
                  required
                  placeholder="brand"
                  disabled={isSystem}
                />
                <p className="text-xs text-muted-foreground">
                  Storefront query key — e.g. <code className="text-[11px]">?brand=apple</code>
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Display type</Label>
                  <Select
                    value={displayType}
                    onChange={(e) => setDisplayType(e.target.value as FilterDisplayType)}
                    disabled={isSystem}
                  >
                    {DISPLAY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {FILTER_DISPLAY_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select
                    value={source}
                    onChange={(e) => setSource(e.target.value as FilterSource)}
                    disabled={isSystem}
                  >
                    <option value="attribute">Attribute</option>
                    <option value="built_in">Built-in</option>
                  </Select>
                </div>
              </div>

              {source === "attribute" ? (
                <div className="space-y-2">
                  <Label>Linked attribute</Label>
                  <Select
                    value={attributeId}
                    onChange={(e) => setAttributeId(e.target.value)}
                    disabled={isSystem}
                  >
                    <option value="">Select attribute…</option>
                    {attributeOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="attributeName">Built-in field</Label>
                  <Input
                    id="attributeName"
                    name="attributeName"
                    defaultValue={filter?.attributeName}
                    placeholder="Selling price"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Category scope</Label>
                <Select value={categoryScope} onChange={(e) => setCategoryScope(e.target.value)}>
                  {CATEGORY_SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">Show in admin preview and API</p>
                </div>
                <Switch
                  checked={isActive}
                  onCheckedChange={(v) => {
                    setIsActive(v);
                    pushLiveChange({ isActive: v });
                  }}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Storefront visible</p>
                  <p className="text-xs text-muted-foreground">Display in shop filter panel</p>
                </div>
                <Switch
                  checked={storefrontVisible}
                  onCheckedChange={(v) => {
                    setStorefrontVisible(v);
                    pushLiveChange({ storefrontVisible: v });
                  }}
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
