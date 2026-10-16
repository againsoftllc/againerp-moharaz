"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronsRight, SquarePen } from "lucide-react";
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
import { LiveEditDrawerSaveButton } from "@/components/website/live-edit/live-edit-drawer-save-button";
import { AgainFormRow } from "@/components/again/again-form-sheet";
import { WebsiteMenuFormDrawer } from "@/components/website/menus/website-menu-form-drawer";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWebsiteMenus } from "@/lib/api/use-website-menus";
import { fetchWebsiteMenu } from "@/lib/api/website-menus";
import { cn } from "@/lib/utils";
import type { WebsiteMenu, WebsiteMenuItem, MenuNavStyle } from "@/lib/website/website-menus";
import { autoTypeLabel } from "@/lib/website/website-menus";
import { Input } from "@/components/ui/input";
import {
  menuItemsToShopPreview,
  type ShopPreviewCategory,
} from "@/lib/website/shop-menu-preview";

const SHOP_SLOT = "catalog.shop";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After slot applied — reload storefront + open SHOP megamenu. */
  onApplied?: () => void;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
};

function MegamenuDesignPreview({ categories }: { categories: ShopPreviewCategory[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = categories[activeIndex] ?? null;

  useEffect(() => {
    setActiveIndex(0);
  }, [categories]);

  if (categories.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
        No visible items yet. Click the edit icon beside the menu to open its tree, or sync Auto
        Category under Website → Menus.
      </p>
    );
  }

  return (
    <div className="flex max-h-[360px] overflow-hidden rounded-md border border-border bg-background">
      <div className="w-[150px] shrink-0 overflow-y-auto border-r border-border py-1">
        <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Parents
        </p>
        {categories.map((cat, i) => (
          <button
            key={cat.id}
            type="button"
            onMouseEnter={() => setActiveIndex(i)}
            onClick={() => setActiveIndex(i)}
            className={cn(
              "flex w-full items-center justify-between gap-1 px-2.5 py-2 text-left text-[12px]",
              i === activeIndex
                ? "bg-[#fdecea] font-semibold text-[#d32f2f] dark:bg-[#d32f2f]/15"
                : "text-foreground hover:bg-muted/50",
            )}
          >
            <span className="truncate">{cat.name}</span>
            <span className="text-[10px] text-muted-foreground">›</span>
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {active ? `Under “${active.name}”` : "Children"}
        </p>
        {!active ? (
          <p className="text-[12px] text-muted-foreground">Hover a parent on the left.</p>
        ) : active.hasGroups ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {active.groups.map((group) => (
              <div key={group.id} className="min-w-0">
                <p className="mb-1 truncate text-[12px] font-semibold text-foreground">{group.name}</p>
                <ul className="m-0 list-none space-y-1 p-0">
                  {group.links.map((link) => (
                    <li key={link.id} className="truncate text-[11px] text-muted-foreground">
                      {link.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {active.sub.map((s) => (
              <span key={s.id} className="truncate text-[12px] text-foreground">
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LiveEditShopMenuDrawer({ open, onOpenChange, onApplied, onSave, saving = false }: Props) {
  const titleId = useId();
  const { menus, slots, loading, refetch, saveSlots, update } = useWebsiteMenus();
  const [menuId, setMenuId] = useState("");
  const [triggerTitle, setTriggerTitle] = useState("SHOP");
  const [navStyle, setNavStyle] = useState<MenuNavStyle>("megamenu");
  const [preview, setPreview] = useState<WebsiteMenu | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [menuEditorOpen, setMenuEditorOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<WebsiteMenu | null>(null);
  const [openingEditor, setOpeningEditor] = useState(false);

  const shopSlot = useMemo(
    () => slots.find((s) => s.slotKey === SHOP_SLOT),
    [slots],
  );

  const shopCategories = useMemo(
    () => (preview ? menuItemsToShopPreview(preview.items) : []),
    [preview],
  );

  const refreshPreview = async (id: string) => {
    const row = await fetchWebsiteMenu(id);
    setPreview(row);
    return row;
  };

  useEffect(() => {
    if (!open) {
      setMenuEditorOpen(false);
      setEditingMenu(null);
      return;
    }
    void refetch();
  }, [open, refetch]);

  useEffect(() => {
    if (!open) return;
    setMenuId(shopSlot?.menuId ?? "");
    setTriggerTitle((shopSlot?.title || "SHOP").trim() || "SHOP");
    setNavStyle(shopSlot?.navStyle === "dropdown" ? "dropdown" : "megamenu");
  }, [open, shopSlot?.menuId, shopSlot?.title, shopSlot?.navStyle]);

  useEffect(() => {
    if (!open || !menuId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    fetchWebsiteMenu(menuId)
      .then((row) => {
        if (!cancelled) setPreview(row);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, menuId]);

  const persistShopSlot = async (patch: {
    menuId?: string;
    title?: string;
    navStyle?: MenuNavStyle;
  }) => {
    const nextMenuId = patch.menuId ?? menuId;
    if (!nextMenuId) return;
    setApplying(true);
    try {
      const title = (patch.title ?? triggerTitle).trim() || "SHOP";
      const style = patch.navStyle ?? navStyle;
      const next = slots.map((s) =>
        s.slotKey === SHOP_SLOT
          ? {
              slotKey: s.slotKey,
              menuId: nextMenuId,
              title,
              navStyle: style,
            }
          : { slotKey: s.slotKey, menuId: s.menuId },
      );
      if (!next.some((s) => s.slotKey === SHOP_SLOT)) {
        next.push({
          slotKey: SHOP_SLOT,
          menuId: nextMenuId,
          title,
          navStyle: style,
        });
      }
      await saveSlots(next);
      toast.success("Shop menu updated");
      onApplied?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setApplying(false);
    }
  };

  const openMenuEditor = async () => {
    if (!menuId) {
      toast.error("Select a menu first");
      return;
    }
    setOpeningEditor(true);
    try {
      const full = await fetchWebsiteMenu(menuId);
      setEditingMenu(full);
      setMenuEditorOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load menu");
    } finally {
      setOpeningEditor(false);
    }
  };

  const handleMenuEditorSave = async (data: {
    name: string;
    source: WebsiteMenu["source"];
    autoType: WebsiteMenu["autoType"];
    autoShowNew: boolean;
    items: WebsiteMenuItem[];
  }) => {
    if (!editingMenu) return;
    await update(editingMenu.id, {
      name: data.name,
      source: data.source,
      autoType: data.autoType,
      autoShowNew: data.autoShowNew,
      items: data.items,
    });
    await refetch();
    await refreshPreview(editingMenu.id);
    // Keep this menu on Shop slot and refresh storefront megamenu.
    if (menuId === editingMenu.id) {
      onApplied?.();
    }
    toast.success("Menu saved — megamenu refreshed");
    setMenuEditorOpen(false);
    setEditingMenu(null);
  };

  return (
    <>
      <AgainDrawerPanel
        open={open}
        onOpenChange={onOpenChange}
        title="Shop menu"
        resizable
        defaultWidth={520}
        widthStorageKey="website-live-edit-drawer-width"
      >
        <AgainDrawerLayout>
          <AgainDrawerControlBar
            trailing={
              <LiveEditDrawerSaveButton onSave={onSave} saving={saving || applying} />
            }
          >
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
              Shop
            </span>
          </AgainDrawerControlBar>

          <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
            <div className="space-y-4">
              <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                <AgainFormRow label="Menu title" help="Header button label (e.g. SHOP)">
                  <Input
                    value={triggerTitle}
                    onChange={(e) => setTriggerTitle(e.target.value)}
                    onBlur={() => {
                      const next = triggerTitle.trim() || "SHOP";
                      setTriggerTitle(next);
                      if (menuId && next !== (shopSlot?.title || "SHOP")) {
                        void persistShopSlot({ title: next });
                      }
                    }}
                    className="h-8 text-[13px]"
                    placeholder="SHOP"
                    disabled={applying}
                  />
                </AgainFormRow>

                <AgainFormRow
                  label="Menu style"
                  help="Megamenu = wide panel · Dropdown = nested list with side flyouts"
                >
                  <Select
                    value={navStyle}
                    onValueChange={(v) => {
                      const next = v as MenuNavStyle;
                      setNavStyle(next);
                      if (menuId) void persistShopSlot({ navStyle: next });
                    }}
                    disabled={applying || !menuId}
                  >
                    <SelectTrigger className="h-8 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="megamenu">Megamenu</SelectItem>
                      <SelectItem value="dropdown">Dropdown</SelectItem>
                    </SelectContent>
                  </Select>
                </AgainFormRow>

                <AgainFormRow
                  label="Menu"
                  help="Content for this header button · icon opens menu editor"
                >
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={menuId || undefined}
                      onValueChange={(id) => {
                        setMenuId(id);
                        void persistShopSlot({ menuId: id });
                      }}
                      disabled={loading || applying}
                    >
                      <SelectTrigger className="h-8 min-w-0 flex-1 text-[13px]">
                        <SelectValue
                          placeholder={
                            loading ? "Loading…" : applying ? "Saving…" : "Select menu"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {menus.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                            {m.source === "auto"
                              ? ` · Auto · ${autoTypeLabel(m.autoType)}`
                              : " · Custom"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={!menuId || openingEditor || applying}
                      aria-label="Edit selected menu"
                      title="Edit this menu"
                      onClick={() => void openMenuEditor()}
                    >
                      <SquarePen className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </AgainFormRow>
              </div>

              <div className="space-y-2 rounded-md border border-border bg-card p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {navStyle === "dropdown" ? "Dropdown preview" : "Megamenu preview"}
                </p>
                {previewLoading ? (
                  <p className="py-6 text-center text-[12px] text-muted-foreground">Loading…</p>
                ) : navStyle === "dropdown" ? (
                  <div className="rounded-md border border-border bg-background p-2">
                    <p className="mb-2 text-[11px] text-muted-foreground">
                      Storefront: nested under “{triggerTitle || "SHOP"}”. Items with children open
                      to the side.
                    </p>
                    <ul className="m-0 list-none space-y-1 p-0 text-[12px]">
                      {(preview?.items ?? [])
                        .filter((i) => !i.hidden)
                        .slice(0, 8)
                        .map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-2 px-1 py-1">
                            <span className="truncate text-foreground">{item.label}</span>
                            {item.children.some((c) => !c.hidden) ? (
                              <span className="text-[10px] text-muted-foreground">›</span>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : (
                  <MegamenuDesignPreview categories={shopCategories} />
                )}
              </div>
            </div>
          </AgainDrawerScrollBody>
        </AgainDrawerLayout>
      </AgainDrawerPanel>

      <WebsiteMenuFormDrawer
        open={menuEditorOpen}
        onOpenChange={(next) => {
          setMenuEditorOpen(next);
          if (!next) setEditingMenu(null);
        }}
        mode="edit"
        menu={editingMenu}
        nested
        onSave={handleMenuEditorSave}
      />
    </>
  );
}
