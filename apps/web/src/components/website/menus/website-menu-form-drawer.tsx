"use client";

import { useEffect, useId, useState } from "react";
import { ChevronsRight, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AGAIN_DRAWER_MODULE_LABEL_CLASS,
  AGAIN_DRAWER_RECORD_LABEL_CLASS,
} from "@/components/again/again-drawer";
import { AgainFormRow } from "@/components/again/again-form-sheet";
import { CatalogAutoMenuTree } from "@/components/website/menus/catalog-auto-menu-tree";
import { CustomMenuTree } from "@/components/website/menus/custom-menu-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCatalogBrands } from "@/lib/api/use-catalog-brands";
import { useCatalogCategories } from "@/lib/api/use-catalog-categories";
import { useWebsitePages } from "@/lib/api/use-website-pages";
import type { Brand } from "@/lib/mock-data/brands";
import type { Category } from "@/lib/mock-data/categories";
import { buildCategoryTree } from "@/lib/mock-data/categories";
import { cn } from "@/lib/utils";
import type {
  MenuAutoType,
  MenuSource,
  WebsiteMenu,
  WebsiteMenuItem,
} from "@/lib/website/website-menus";
import { autoTypeLabel } from "@/lib/website/website-menus";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  menu: WebsiteMenu | null;
  /** Stack above another drawer (e.g. live-edit Shop). */
  nested?: boolean;
  onSave: (data: {
    name: string;
    source: MenuSource;
    autoType: MenuAutoType;
    autoShowNew: boolean;
    items: WebsiteMenuItem[];
  }) => Promise<void>;
};

function hrefFromSlug(slug: string): string {
  const cleaned = slug.replace(/^\//, "");
  return cleaned ? `/${cleaned}` : "/";
}

function categoryNodeToItem(node: {
  id: string;
  name: string;
  slug: string;
  children: { id: string; name: string; slug: string; children: unknown[] }[];
}): WebsiteMenuItem {
  return {
    id: `cat-${node.id}`,
    label: node.name,
    linkType: "category",
    linkRefId: node.id,
    href: hrefFromSlug(node.slug),
    hidden: false,
    children: (node.children as typeof node[]).map(categoryNodeToItem),
  };
}

function buildClientAutoPreview(
  autoType: MenuAutoType,
  categories: Category[],
  brands: Brand[],
  pages: { id: string; name: string; url: string }[],
): WebsiteMenuItem[] {
  if (autoType === "brand") {
    return brands.map((b) => ({
      id: `brand-${b.id}`,
      label: b.name,
      linkType: "brand" as const,
      linkRefId: b.id,
      href: hrefFromSlug(b.slug),
      hidden: false,
      children: [],
    }));
  }
  if (autoType === "page") {
    return pages.map((p) => ({
      id: `page-${p.id}`,
      label: p.name,
      linkType: "page" as const,
      linkRefId: p.id,
      href: p.url || "/",
      hidden: false,
      children: [],
    }));
  }
  return buildCategoryTree(categories).map(categoryNodeToItem);
}

export function WebsiteMenuFormDrawer({
  open,
  onOpenChange,
  mode,
  menu,
  nested,
  onSave,
}: Props) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [source, setSource] = useState<MenuSource>("custom");
  const [autoType, setAutoType] = useState<MenuAutoType>("category");
  const [autoShowNew, setAutoShowNew] = useState(true);
  const [items, setItems] = useState<WebsiteMenuItem[]>([]);
  const [saving, setSaving] = useState(false);

  const { categories } = useCatalogCategories({ channel: "dropshipping" });
  const { brands } = useCatalogBrands({ channel: "dropshipping" });
  const { pages } = useWebsitePages();

  const pageOptions = pages.map((p) => ({ id: p.id, name: p.name, url: p.url }));

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && menu) {
      setName(menu.name);
      setSource(menu.source);
      setAutoType(menu.autoType || "category");
      setAutoShowNew(menu.autoShowNew !== false);
      const tree =
        menu.source === "auto"
          ? menu.items.length > 0
            ? menu.items
            : menu.autoPreview
          : menu.items;
      setItems(tree);
    } else {
      setName("");
      setSource("custom");
      setAutoType("category");
      setAutoShowNew(true);
      setItems([]);
    }
  }, [open, mode, menu]);

  const applyAutoPreview = (nextType: MenuAutoType) => {
    if (menu && menu.autoType === nextType && menu.source === "auto") {
      const tree = menu.items.length > 0 ? menu.items : menu.autoPreview;
      if (tree.length > 0) {
        setItems(tree);
        return;
      }
    }
    setItems(buildClientAutoPreview(nextType, categories, brands, pageOptions));
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: trimmed,
        source,
        autoType,
        autoShowNew,
        items,
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "New menu" : "Edit menu"}
      nested={nested}
      resizable
      defaultWidth={520}
      widthStorageKey="website-menu-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close drawer"
            onClick={() => onOpenChange(false)}
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
          <span className={AGAIN_DRAWER_MODULE_LABEL_CLASS}>Website</span>
          <span className="text-muted-foreground">/</span>
          <span className={AGAIN_DRAWER_RECORD_LABEL_CLASS} id={titleId}>
            {mode === "create" ? "New menu" : menu?.name || "Menu"}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(AGAIN_DRAWER_ACTION_BTN, "h-7")}
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn(AGAIN_DRAWER_ACTION_BTN, "h-7 bg-[#714B67] text-white hover:bg-[#714B67]/90")}
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="space-y-4">
            <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
              <AgainFormRow label="Name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 text-[13px]"
                  placeholder="Menu name"
                />
              </AgainFormRow>

              <AgainFormRow
                label="Source"
                help="Custom = build links yourself · Auto on = sync live list · eye open = new items visible · eye closed = new items sync hidden until you show them"
              >
                <div className="flex h-8 items-center gap-2">
                  <span
                    className={cn(
                      "text-[12px]",
                      source === "custom" ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    Custom
                  </span>
                  <Switch
                    checked={source === "auto"}
                    onCheckedChange={(checked) => {
                      const next = checked ? "auto" : "custom";
                      setSource(next);
                      if (next === "auto") applyAutoPreview(autoType);
                    }}
                  />
                  <span
                    className={cn(
                      "text-[12px]",
                      source === "auto" ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    Auto
                  </span>
                  <button
                    type="button"
                    disabled={source !== "auto"}
                    className={cn(
                      "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      source === "auto"
                        ? "text-foreground hover:bg-muted"
                        : "cursor-not-allowed text-muted-foreground/40",
                    )}
                    aria-label={
                      autoShowNew
                        ? "New synced items auto-visible"
                        : "New synced items start hidden"
                    }
                    title={
                      source !== "auto"
                        ? "Enable Auto to control new-item visibility"
                        : autoShowNew
                          ? "New catalog items appear visible — click to start them hidden"
                          : "New catalog items start hidden — click to auto-show them"
                    }
                    onClick={() => setAutoShowNew((v) => !v)}
                  >
                    {autoShowNew ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </AgainFormRow>

              {source === "auto" ? (
                <AgainFormRow
                  label="Auto from"
                  help="Choose what this menu syncs. New entities appear automatically; reorder/hide are kept."
                >
                  <Select
                    value={autoType}
                    onValueChange={(value) => {
                      const next = value as MenuAutoType;
                      setAutoType(next);
                      applyAutoPreview(next);
                    }}
                  >
                    <SelectTrigger className="h-8 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="category">Category</SelectItem>
                      <SelectItem value="brand">Brand</SelectItem>
                      <SelectItem value="page">Page</SelectItem>
                    </SelectContent>
                  </Select>
                </AgainFormRow>
              ) : null}
            </div>

            {source === "auto" ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {autoTypeLabel(autoType)} tree (live)
                </p>
                <CatalogAutoMenuTree
                  key={`${menu?.id ?? "new"}-auto-${autoType}`}
                  items={items}
                  onChange={setItems}
                  autoType={autoType}
                  newItemsHidden={!autoShowNew}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Menu tree
                </p>
                <CustomMenuTree
                  key={`${menu?.id ?? "new"}-custom`}
                  items={items}
                  onChange={setItems}
                  pages={pageOptions}
                  categories={categories}
                  brands={brands}
                />
              </div>
            )}
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
