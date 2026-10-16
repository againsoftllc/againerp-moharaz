"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronsRight,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  ImageUp,
  Plus,
  Trash2,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getApiBaseUrl } from "@/lib/api/client";
import { useCatalogMedia, uploadCatalogMediaFiles } from "@/lib/api/use-catalog-media";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { cn } from "@/lib/utils";
import { getStorefrontBaseUrl } from "@/lib/website/live-edit";
import {
  SIDE_MENU_FA_ICONS,
  ensureFontAwesomeCss,
} from "@/lib/website/side-menu-fa-icons";
import type { HomepageContent, SideMenuItem, SideMenuSection } from "@/lib/website/website-homepage";
import { defaultSideMenuItem, defaultSideMenuSection } from "@/lib/website/website-homepage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: HomepageContent;
  onChange?: (content: HomepageContent) => void;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
};

function previewUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) return `${getApiBaseUrl()}${url}`;
  return `${getStorefrontBaseUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
}

function SideMenuIconPreview({
  item,
  active,
  className,
}: {
  item: SideMenuItem;
  active?: boolean;
  className?: string;
}) {
  if (item.icon) {
    return (
      <i
        className={cn(item.icon, className, active ? "text-white" : "text-foreground")}
        aria-hidden
      />
    );
  }
  const thumb = previewUrl(item.iconUrl);
  if (thumb) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumb}
        alt=""
        className={cn("h-5 w-5 object-contain", active && "brightness-0 invert", className)}
      />
    );
  }
  return <span className="text-[10px] text-muted-foreground">—</span>;
}

function SortableSideMenuRow({
  item,
  index,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
  onDuplicate,
  onToggleHidden,
  onChangeImage,
  onSetActive,
}: {
  item: SideMenuItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<SideMenuItem>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggleHidden: () => void;
  onChangeImage: () => void;
  onSetActive: (active: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const isHidden = Boolean(item.hidden);
  const isActive = Boolean(item.active);
  const usingFa = Boolean(item.icon?.trim());
  const iconQuery = (item.icon || "").toLowerCase();
  const imageThumb = previewUrl(item.iconUrl);
  const [faOpen, setFaOpen] = useState(false);

  useEffect(() => {
    if (!expanded) setFaOpen(false);
  }, [expanded]);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "overflow-hidden rounded-md border border-border bg-card",
        isDragging && "z-10 opacity-90 shadow-md ring-1 ring-[#00a09d]/40",
        expanded && "border-[#00a09d]/40",
        isHidden && "opacity-60",
      )}
    >
      <div className="flex items-stretch gap-1 p-1.5">
        <button
          type="button"
          className="inline-flex shrink-0 touch-none items-center px-0.5 text-muted-foreground hover:text-foreground"
          aria-label={`Drag item ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 cursor-grab active:cursor-grabbing" />
        </button>

        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none hover:bg-muted/40"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <div
            className={cn(
              "relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border text-[18px]",
              isActive ? "bg-[#d92128]" : "bg-muted/40",
            )}
          >
            <SideMenuIconPreview item={item} active={isActive} />
          </div>
          <div className="min-w-0 flex-1 py-0.5">
            <p className="truncate text-[12px] font-medium text-foreground">
              {item.label || `Item ${index + 1}`}
              {isHidden ? (
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                  (hidden)
                </span>
              ) : null}
              {isActive ? (
                <span className="ml-1.5 text-[10px] font-normal text-[#d92128]">(highlight)</span>
              ) : null}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {usingFa ? item.icon : item.href || "#"}
            </p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>

        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Duplicate item ${index + 1}`}
          title="Duplicate"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-md px-1.5 hover:bg-muted",
            isHidden ? "text-muted-foreground" : "text-foreground",
          )}
          aria-label={isHidden ? `Show item ${index + 1}` : `Hide item ${index + 1}`}
          title={isHidden ? "Show" : "Hide"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden();
          }}
        >
          {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
          aria-label={`Remove item ${index + 1}`}
          title="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Icon image
            </p>
            <div className="relative mx-auto aspect-square w-16 overflow-hidden rounded-full border border-border bg-muted/40">
              {imageThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageThumb} alt="" className="h-full w-full object-contain p-3" />
              ) : (
                <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                  No image
                </div>
              )}
              <div className="absolute left-1.5 top-1.5">
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
                  aria-label="Change icon image"
                  title="Change icon image"
                  onClick={onChangeImage}
                >
                  <ImageUp className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <p className="text-center text-[10px] text-muted-foreground">
              {usingFa
                ? "Font Awesome override is active — clear it below to use this image"
                : "Default storefront icon (image)"}
            </p>
          </div>

          <div className="rounded-md border border-border bg-muted/20">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/40"
              aria-expanded={faOpen}
              onClick={() => setFaOpen((v) => !v)}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Font Awesome (optional)
                {usingFa ? (
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-[#00a09d]">
                    · active
                  </span>
                ) : null}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  faOpen && "rotate-180",
                )}
              />
            </button>
            {faOpen ? (
              <div className="space-y-2 border-t border-border p-2.5">
                <div className="flex items-center justify-end">
                  {usingFa ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => onUpdate({ icon: "" })}
                    >
                      Use image
                    </Button>
                  ) : null}
                </div>
                <AgainFormRow label="Class" help="Optional — overrides the image when set">
                  <Input
                    value={item.icon}
                    onChange={(e) => onUpdate({ icon: e.target.value })}
                    className="h-8 font-mono text-[12px]"
                    placeholder="fa-solid fa-phone"
                  />
                </AgainFormRow>
                <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                  {SIDE_MENU_FA_ICONS.map((fa) => {
                    const selected = iconQuery === fa.className.toLowerCase();
                    return (
                      <button
                        key={fa.className}
                        type="button"
                        title={fa.label}
                        aria-label={fa.label}
                        aria-pressed={selected}
                        className={cn(
                          "flex h-9 items-center justify-center rounded-md border text-[15px] transition-colors",
                          selected
                            ? "border-[#00a09d] bg-[#00a09d]/10 text-foreground"
                            : "border-border bg-background text-foreground hover:bg-muted",
                        )}
                        onClick={() => onUpdate({ icon: fa.className })}
                      >
                        <i className={fa.className} aria-hidden />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <AgainFormRow label="Label">
            <Input
              value={item.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              className="h-8 text-[13px]"
              placeholder="Phone"
            />
          </AgainFormRow>
          <AgainFormRow label="Link">
            <Input
              value={item.href}
              onChange={(e) => onUpdate({ href: e.target.value })}
              className="h-8 text-[13px]"
              placeholder="/compare"
            />
          </AgainFormRow>
          <AgainFormRow label="Highlight" help="Red circle on the storefront rail">
            <div className="flex h-8 items-center">
              <Switch checked={isActive} onCheckedChange={onSetActive} />
            </div>
          </AgainFormRow>
        </div>
      ) : null}
    </div>
  );
}

export function LiveEditSideMenuDrawer({ open, onOpenChange, content, onChange, onSave, saving = false }: Props) {
  const titleId = useId();
  const [section, setSection] = useState<SideMenuSection>(
    content.sideMenu ?? defaultSideMenuSection(),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ kind: "logo" } | { kind: "item"; index: number } | null>(
    null,
  );
  const { items: mediaItems, refetch: refetchMedia } = useCatalogMedia();

  useEffect(() => {
    if (open) ensureFontAwesomeCss();
  }, [open]);

  useEffect(() => {
    if (open) {
      setSection(content.sideMenu ?? defaultSideMenuSection());
      setExpandedId(null);
    }
  }, [open, content.sideMenu]);

  const pushSection = useCallback(
    (next: SideMenuSection) => {
      setSection(next);
      queueMicrotask(() => {
        onChange?.({ ...content, sideMenu: next });
      });
    },
    [content, onChange],
  );

  const itemIds = useMemo(() => section.items.map((item) => item.id), [section.items]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = section.items.findIndex((item) => item.id === active.id);
    const newIndex = section.items.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    pushSection({ ...section, items: arrayMove(section.items, oldIndex, newIndex) });
  };

  const updateItem = (index: number, patch: Partial<SideMenuItem>) => {
    const items = section.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    pushSection({ ...section, items });
  };

  const setActiveItem = (index: number, active: boolean) => {
    const items = section.items.map((item, i) => ({
      ...item,
      active: active ? i === index : false,
    }));
    pushSection({ ...section, items });
  };

  const handleMediaSelect = (items: MediaLibraryItem[]) => {
    if (!picker || items.length === 0) {
      setPicker(null);
      return;
    }
    const url = items[0].url;
    if (picker.kind === "logo") {
      pushSection({ ...section, logoUrl: url });
    } else {
      // Custom/original image — clear FA override so image shows.
      updateItem(picker.index, { iconUrl: url, icon: "" });
    }
    setPicker(null);
  };

  const logoPreview = previewUrl(section.logoUrl);

  return (
    <>
      <AgainDrawerPanel
        open={open}
        onOpenChange={onOpenChange}
        title="Toolbar"
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
              Toolbar
            </span>
          </AgainDrawerControlBar>
          <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
            <div className="space-y-4">
              <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Toolbar
                </p>
                <AgainFormRow
                  label="Enabled"
                  help="Off = hide the left toolbar on the storefront"
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
                  Logo
                </p>
                <div className="relative mx-auto aspect-square w-16 overflow-hidden rounded-md border border-border bg-muted/40">
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoPreview} alt="" className="h-full w-full object-contain p-1.5" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                      No logo
                    </div>
                  )}
                  <div className="absolute left-1.5 top-1.5">
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
                      aria-label="Change logo"
                      title="Change logo"
                      onClick={() => {
                        void refetchMedia();
                        setPicker({ kind: "logo" });
                      }}
                    >
                      <ImageUp className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <AgainFormRow label="Logo link">
                  <Input
                    value={section.logoHref}
                    onChange={(e) => pushSection({ ...section, logoHref: e.target.value })}
                    className="h-8 text-[13px]"
                    placeholder="/"
                  />
                </AgainFormRow>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Items ({section.items.length})
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[12px]"
                    onClick={() => {
                      const next = defaultSideMenuItem({ label: `Item ${section.items.length + 1}` });
                      pushSection({ ...section, items: [...section.items, next] });
                      setExpandedId(next.id);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {section.items.map((item, index) => (
                        <SortableSideMenuRow
                          key={item.id}
                          item={item}
                          index={index}
                          expanded={expandedId === item.id}
                          onToggle={() =>
                            setExpandedId((cur) => (cur === item.id ? null : item.id))
                          }
                          onUpdate={(patch) => updateItem(index, patch)}
                          onRemove={() =>
                            pushSection({
                              ...section,
                              items: section.items.filter((_, i) => i !== index),
                            })
                          }
                          onDuplicate={() => {
                            const copy = defaultSideMenuItem({
                              label: `${item.label || "Item"} copy`,
                              href: item.href,
                              icon: item.icon,
                              iconUrl: item.iconUrl,
                              active: false,
                              hidden: Boolean(item.hidden),
                            });
                            const items = [...section.items];
                            items.splice(index + 1, 0, copy);
                            pushSection({ ...section, items });
                            setExpandedId(copy.id);
                          }}
                          onToggleHidden={() => updateItem(index, { hidden: !item.hidden })}
                          onChangeImage={() => {
                            void refetchMedia();
                            setPicker({ kind: "item", index });
                          }}
                          onSetActive={(active) => setActiveItem(index, active)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
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
        title={picker?.kind === "item" ? "Change toolbar icon image" : "Change toolbar logo"}
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
    </>
  );
}
