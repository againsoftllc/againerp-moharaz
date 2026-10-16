"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ChevronsRight, ImageUp, Plus, SquarePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AGAIN_DRAWER_MODULE_LABEL_CLASS,
  AGAIN_DRAWER_RECORD_LABEL_CLASS,
} from "@/components/again/again-drawer";
import { LiveEditDrawerSaveButton } from "@/components/website/live-edit/live-edit-drawer-save-button";
import { AgainFormRow } from "@/components/again/again-form-sheet";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import { WebsiteMenuFormDrawer } from "@/components/website/menus/website-menu-form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api/client";
import { useCatalogMedia, uploadCatalogMediaFiles } from "@/lib/api/use-catalog-media";
import { useWebsiteMenus } from "@/lib/api/use-website-menus";
import { fetchWebsiteMenu } from "@/lib/api/website-menus";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { getStorefrontBaseUrl } from "@/lib/website/live-edit";
import type {
  FooterMobileSection,
  FooterSection,
  FooterSocialItem,
  HomepageContent,
} from "@/lib/website/website-homepage";
import {
  defaultFooterSection,
  defaultFooterSocialItem,
} from "@/lib/website/website-homepage";
import type { WebsiteMenu, WebsiteMenuItem } from "@/lib/website/website-menus";
import { autoTypeLabel } from "@/lib/website/website-menus";

const FOOTER_SLOT = "footer.links";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: HomepageContent;
  onChange?: (content: HomepageContent) => void;
  initialTab?: FooterTabId;
  /** After menu slot applied — reload storefront iframe. */
  onMenuApplied?: () => void;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
};

export type FooterTabId = "desktop" | "mobile";

type PickerMode = "logo" | "membershipLogo" | "payment" | "mobileLogo" | null;

function previewUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) return `${getApiBaseUrl()}${url}`;
  return `${getStorefrontBaseUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
}

function ImagePickField({
  label,
  url,
  aspectClass,
  onPick,
}: {
  label: string;
  url: string;
  aspectClass: string;
  onPick: () => void;
}) {
  const src = previewUrl(url);
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-medium text-foreground">{label}</p>
      <div className={`relative overflow-hidden rounded-md border border-border bg-muted/40 ${aspectClass}`}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} className="h-full w-full object-contain p-2" />
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
            No image
          </div>
        )}
        <div className="absolute left-2 top-2 z-[2]">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
            aria-label={`Change ${label}`}
            title={`Change ${label}`}
            onClick={onPick}
          >
            <ImageUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function LiveEditFooterDrawer({ open,
  onOpenChange,
  content,
  onChange,
  initialTab = "desktop",
  onMenuApplied, onSave, saving = false }: Props) {
  const titleId = useId();
  const [section, setSection] = useState<FooterSection>(
    content.footer ?? defaultFooterSection(),
  );
  const [tab, setTab] = useState<FooterTabId>(initialTab);
  const [picker, setPicker] = useState<PickerMode>(null);
  const { items: mediaItems, refetch: refetchMedia } = useCatalogMedia();
  const { menus, slots, loading, refetch, saveSlots, update } = useWebsiteMenus();
  const [menuId, setMenuId] = useState("");
  const [applying, setApplying] = useState(false);
  const [menuEditorOpen, setMenuEditorOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<WebsiteMenu | null>(null);
  const [openingEditor, setOpeningEditor] = useState(false);
  const [linkPreview, setLinkPreview] = useState<WebsiteMenuItem[]>([]);

  const footerSlot = useMemo(
    () => slots.find((s) => s.slotKey === FOOTER_SLOT),
    [slots],
  );

  useEffect(() => {
    if (open) {
      setSection(content.footer ?? defaultFooterSection());
      setTab(initialTab);
      void refetch();
    } else {
      setMenuEditorOpen(false);
      setEditingMenu(null);
    }
  }, [open, content.footer, initialTab, refetch]);

  useEffect(() => {
    if (!open) return;
    setMenuId(footerSlot?.menuId ?? "");
  }, [open, footerSlot?.menuId]);

  useEffect(() => {
    if (!open || !menuId) {
      setLinkPreview([]);
      return;
    }
    let cancelled = false;
    fetchWebsiteMenu(menuId)
      .then((row) => {
        if (!cancelled) setLinkPreview(row.items.filter((i) => !i.hidden));
      })
      .catch(() => {
        if (!cancelled) setLinkPreview([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, menuId]);

  const pushSection = useCallback(
    (next: FooterSection) => {
      setSection(next);
      queueMicrotask(() => {
        onChange?.({ ...content, footer: next });
      });
    },
    [content, onChange],
  );

  const pushMobile = (patch: Partial<FooterMobileSection>) => {
    pushSection({
      ...section,
      mobile: { ...section.mobile, ...patch },
    });
  };

  const updateSocial = (index: number, patch: Partial<FooterSocialItem>) => {
    const socials = section.socials.map((s, i) => (i === index ? { ...s, ...patch } : s));
    pushSection({ ...section, socials });
  };

  const removeSocial = (index: number) => {
    pushSection({
      ...section,
      socials: section.socials.filter((_, i) => i !== index),
    });
  };

  const addSocial = () => {
    pushSection({
      ...section,
      socials: [...section.socials, defaultFooterSocialItem()],
    });
  };

  const handleMediaSelect = (items: MediaLibraryItem[]) => {
    if (!picker || items.length === 0) {
      setPicker(null);
      return;
    }
    const url = items[0].url;
    if (picker === "logo") pushSection({ ...section, logoUrl: url });
    else if (picker === "membershipLogo") pushSection({ ...section, membershipLogoUrl: url });
    else if (picker === "payment") pushSection({ ...section, paymentImageUrl: url });
    else if (picker === "mobileLogo") pushMobile({ logoUrl: url });
    setPicker(null);
  };

  const persistFooterSlot = async (nextMenuId: string) => {
    if (!nextMenuId) return;
    setApplying(true);
    try {
      const next = slots.map((s) =>
        s.slotKey === FOOTER_SLOT
          ? { slotKey: s.slotKey, menuId: nextMenuId }
          : { slotKey: s.slotKey, menuId: s.menuId },
      );
      if (!next.some((s) => s.slotKey === FOOTER_SLOT)) {
        next.push({ slotKey: FOOTER_SLOT, menuId: nextMenuId });
      }
      await saveSlots(next);
      toast.success("Footer menu updated");
      onMenuApplied?.();
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
    setLinkPreview(data.items.filter((i) => !i.hidden));
    if (menuId === editingMenu.id) onMenuApplied?.();
    toast.success("Menu saved — footer links refreshed");
    setMenuEditorOpen(false);
    setEditingMenu(null);
  };

  const mobile = section.mobile;

  return (
    <>
      <AgainDrawerPanel
        open={open}
        onOpenChange={onOpenChange}
        title="Footer"
        resizable
        defaultWidth={520}
        widthStorageKey="website-live-edit-drawer-width"
      >
        <AgainDrawerLayout>
          <AgainDrawerControlBar
            trailing={<LiveEditDrawerSaveButton onSave={onSave} saving={saving} />}
          >
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close drawer"
              title="Close"
              onClick={() => onOpenChange(false)}
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
            <span className={AGAIN_DRAWER_MODULE_LABEL_CLASS}>Website</span>
            <span className="text-muted-foreground">/</span>
            <span className={AGAIN_DRAWER_RECORD_LABEL_CLASS} id={titleId}>
              Footer
            </span>
          </AgainDrawerControlBar>
          <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
            <div className="space-y-4">
              <div
                role="tablist"
                aria-label="Footer device"
                className="flex rounded-md border border-border bg-muted/40 p-0.5"
              >
                {(
                  [
                    { id: "desktop" as const, label: "Desktop" },
                    { id: "mobile" as const, label: "Mobile" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.id}
                    className={cn(
                      "flex-1 rounded-[5px] px-3 py-1.5 text-[12px] font-medium transition-colors",
                      tab === item.id
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setTab(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Important Links menu
                </p>
                <AgainFormRow
                  label="Menu"
                  help="Shared slot footer.links · used on desktop and mobile"
                >
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={menuId || undefined}
                      onValueChange={(id) => {
                        setMenuId(id);
                        void persistFooterSlot(id);
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
                {linkPreview.length > 0 ? (
                  <ul className="m-0 max-h-28 list-none space-y-1 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-[12px]">
                    {linkPreview.slice(0, 12).map((item) => (
                      <li key={item.id} className="truncate text-foreground">
                        {item.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-muted-foreground">
                    No visible links yet. Pick a menu or edit its items.
                  </p>
                )}
              </div>

              {tab === "desktop" ? (
                <>
                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Desktop footer
                    </p>
                    <AgainFormRow
                      label="Enabled"
                      help="Off = hide the footer on the storefront"
                    >
                      <div className="flex h-8 items-center">
                        <Switch
                          checked={section.enabled !== false}
                          onCheckedChange={(checked) =>
                            pushSection({ ...section, enabled: checked })
                          }
                        />
                      </div>
                    </AgainFormRow>
                  </div>

                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Brand
                    </p>
                    <ImagePickField
                      label="Logo"
                      url={section.logoUrl}
                      aspectClass="aspect-[180/50] max-w-[200px]"
                      onPick={() => {
                        void refetchMedia();
                        setPicker("logo");
                      }}
                    />
                    <AgainFormRow label="About text">
                      <Textarea
                        value={section.aboutText}
                        onChange={(e) =>
                          pushSection({ ...section, aboutText: e.target.value })
                        }
                        className="min-h-[88px] text-[13px]"
                        rows={4}
                      />
                    </AgainFormRow>
                  </div>

                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Social links
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-[12px]"
                        onClick={addSocial}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                    {section.socials.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground">No social links.</p>
                    ) : (
                      <div className="space-y-2">
                        {section.socials.map((s, index) => (
                          <div
                            key={s.id}
                            className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/20 p-2"
                          >
                            <Input
                              value={s.icon}
                              onChange={(e) => updateSocial(index, { icon: e.target.value })}
                              className="h-8 w-[140px] text-[12px]"
                              placeholder="fa-facebook-f"
                            />
                            <Input
                              value={s.href}
                              onChange={(e) => updateSocial(index, { href: e.target.value })}
                              className="h-8 min-w-0 flex-1 text-[12px]"
                              placeholder="https://..."
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              aria-label="Remove social"
                              onClick={() => removeSocial(index)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Links column
                    </p>
                    <AgainFormRow label="Title">
                      <Input
                        value={section.linksTitle}
                        onChange={(e) =>
                          pushSection({ ...section, linksTitle: e.target.value })
                        }
                        className="h-8 text-[13px]"
                        placeholder="Important Links"
                      />
                    </AgainFormRow>
                  </div>

                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Membership
                    </p>
                    <AgainFormRow label="Title">
                      <Input
                        value={section.membershipTitle}
                        onChange={(e) =>
                          pushSection({ ...section, membershipTitle: e.target.value })
                        }
                        className="h-8 text-[13px]"
                        placeholder="Membership"
                      />
                    </AgainFormRow>
                    <ImagePickField
                      label="Membership logo"
                      url={section.membershipLogoUrl}
                      aspectClass="aspect-[160/60] max-w-[160px]"
                      onPick={() => {
                        void refetchMedia();
                        setPicker("membershipLogo");
                      }}
                    />
                    <AgainFormRow label="Head office">
                      <Textarea
                        value={section.headOfficeText}
                        onChange={(e) =>
                          pushSection({ ...section, headOfficeText: e.target.value })
                        }
                        className="min-h-[72px] text-[13px]"
                        rows={3}
                      />
                    </AgainFormRow>
                  </div>

                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Bottom bar
                    </p>
                    <AgainFormRow label="Copyright">
                      <Input
                        value={section.copyrightText}
                        onChange={(e) =>
                          pushSection({ ...section, copyrightText: e.target.value })
                        }
                        className="h-8 text-[13px]"
                      />
                    </AgainFormRow>
                    <ImagePickField
                      label="Payment strip"
                      url={section.paymentImageUrl}
                      aspectClass="aspect-[12/1] max-w-full"
                      onPick={() => {
                        void refetchMedia();
                        setPicker("payment");
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Mobile footer
                    </p>
                    <AgainFormRow
                      label="Enabled"
                      help="Off = hide footer on mobile viewport"
                    >
                      <div className="flex h-8 items-center">
                        <Switch
                          checked={mobile.enabled !== false}
                          onCheckedChange={(checked) => pushMobile({ enabled: checked })}
                        />
                      </div>
                    </AgainFormRow>
                  </div>

                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Overrides
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Empty logo / about fall back to desktop values.
                    </p>
                    <ImagePickField
                      label="Logo"
                      url={mobile.logoUrl || section.logoUrl}
                      aspectClass="aspect-[180/50] max-w-[180px]"
                      onPick={() => {
                        void refetchMedia();
                        setPicker("mobileLogo");
                      }}
                    />
                    <AgainFormRow label="About text">
                      <Textarea
                        value={mobile.aboutText}
                        onChange={(e) => pushMobile({ aboutText: e.target.value })}
                        className="min-h-[88px] text-[13px]"
                        rows={4}
                        placeholder={section.aboutText}
                      />
                    </AgainFormRow>
                    <AgainFormRow label="Hide socials">
                      <div className="flex h-8 items-center">
                        <Switch
                          checked={Boolean(mobile.hideSocials)}
                          onCheckedChange={(checked) => pushMobile({ hideSocials: checked })}
                        />
                      </div>
                    </AgainFormRow>
                    <AgainFormRow label="Hide membership">
                      <div className="flex h-8 items-center">
                        <Switch
                          checked={Boolean(mobile.hideMembership)}
                          onCheckedChange={(checked) =>
                            pushMobile({ hideMembership: checked })
                          }
                        />
                      </div>
                    </AgainFormRow>
                    <AgainFormRow label="Hide payment strip">
                      <div className="flex h-8 items-center">
                        <Switch
                          checked={Boolean(mobile.hidePayment)}
                          onCheckedChange={(checked) => pushMobile({ hidePayment: checked })}
                        />
                      </div>
                    </AgainFormRow>
                  </div>
                </>
              )}
            </div>
          </AgainDrawerScrollBody>
        </AgainDrawerLayout>
      </AgainDrawerPanel>

      <MediaLibraryModal
        open={picker !== null}
        onOpenChange={(next) => {
          if (!next) setPicker(null);
          else void refetchMedia();
        }}
        items={mediaItems}
        mode="single"
        title={
          picker === "membershipLogo"
            ? "Change membership logo"
            : picker === "payment"
              ? "Change payment strip"
              : picker === "mobileLogo"
                ? "Change mobile footer logo"
                : "Change footer logo"
        }
        accept={["image"]}
        initialSelectedIds={[]}
        onSelect={(items) => {
          handleMediaSelect(items);
        }}
        onUploadFiles={async (files) => {
          const uploaded = await uploadCatalogMediaFiles(files);
          await refetchMedia();
          return uploaded;
        }}
      />

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
