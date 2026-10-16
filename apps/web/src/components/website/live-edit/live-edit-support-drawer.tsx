"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { ChevronsRight, ImageUp } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { getApiBaseUrl } from "@/lib/api/client";
import { useCatalogMedia, uploadCatalogMediaFiles } from "@/lib/api/use-catalog-media";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { getStorefrontBaseUrl } from "@/lib/website/live-edit";
import type { HomepageContent, SupportSection } from "@/lib/website/website-homepage";
import { defaultSupportSection } from "@/lib/website/website-homepage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: HomepageContent;
  onChange?: (content: HomepageContent) => void;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
};

type ImageField = "phoneIconUrl" | "agentImageUrl" | "storeIconUrl";

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

export function LiveEditSupportDrawer({ open, onOpenChange, content, onChange, onSave, saving = false }: Props) {
  const titleId = useId();
  const [section, setSection] = useState<SupportSection>(
    content.support ?? defaultSupportSection(),
  );
  const [picker, setPicker] = useState<ImageField | null>(null);
  const { items: mediaItems, refetch: refetchMedia } = useCatalogMedia();

  useEffect(() => {
    if (open) setSection(content.support ?? defaultSupportSection());
  }, [open, content.support]);

  const pushSection = useCallback(
    (next: SupportSection) => {
      setSection(next);
      queueMicrotask(() => {
        onChange?.({ ...content, support: next });
      });
    },
    [content, onChange],
  );

  const handleMediaSelect = (items: MediaLibraryItem[]) => {
    if (!picker || items.length === 0) {
      setPicker(null);
      return;
    }
    pushSection({ ...section, [picker]: items[0].url });
    setPicker(null);
  };

  return (
    <>
      <AgainDrawerPanel
        open={open}
        onOpenChange={onOpenChange}
        title="Support section"
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
              Support
            </span>
          </AgainDrawerControlBar>
          <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
            <div className="space-y-4">
              <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Common
                </p>
                <AgainFormRow label="Title">
                  <Input
                    value={section.title}
                    onChange={(e) => pushSection({ ...section, title: e.target.value })}
                    className="h-8 text-[13px]"
                    placeholder="Support"
                  />
                </AgainFormRow>
                <AgainFormRow label="Sub Title">
                  <Input
                    value={section.subtitle}
                    onChange={(e) => pushSection({ ...section, subtitle: e.target.value })}
                    className="h-8 text-[13px]"
                    placeholder="Official distributor of trusted brands."
                  />
                </AgainFormRow>
              </div>

              <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Phone card
                </p>
                <AgainFormRow label="Phone">
                  <Input
                    value={section.phone}
                    onChange={(e) => pushSection({ ...section, phone: e.target.value })}
                    className="h-8 text-[13px]"
                    placeholder="+8801332-812759"
                  />
                </AgainFormRow>
                <AgainFormRow label="Phone link">
                  <Input
                    value={section.phoneHref}
                    onChange={(e) => pushSection({ ...section, phoneHref: e.target.value })}
                    className="h-8 text-[13px]"
                    placeholder="tel:+8801332812759"
                  />
                </AgainFormRow>
                <AgainFormRow label="WhatsApp">
                  <Input
                    value={section.whatsapp}
                    onChange={(e) => pushSection({ ...section, whatsapp: e.target.value })}
                    className="h-8 text-[13px]"
                    placeholder="+8801332-812764"
                  />
                </AgainFormRow>
                <AgainFormRow label="WhatsApp link">
                  <Input
                    value={section.whatsappHref}
                    onChange={(e) => pushSection({ ...section, whatsappHref: e.target.value })}
                    className="h-8 text-[13px]"
                    placeholder="https://wa.me/8801332812764"
                  />
                </AgainFormRow>
                <AgainFormRow label="Hours">
                  <Input
                    value={section.hours}
                    onChange={(e) => pushSection({ ...section, hours: e.target.value })}
                    className="h-8 text-[13px]"
                    placeholder="10:00 AM - 08:00 PM"
                  />
                </AgainFormRow>
                <ImagePickField
                  label="Phone icon"
                  url={section.phoneIconUrl}
                  aspectClass="aspect-square max-w-[120px]"
                  onPick={() => {
                    void refetchMedia();
                    setPicker("phoneIconUrl");
                  }}
                />
              </div>

              <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Center image
                </p>
                <ImagePickField
                  label="Agent image"
                  url={section.agentImageUrl}
                  aspectClass="aspect-square max-w-[160px]"
                  onPick={() => {
                    void refetchMedia();
                    setPicker("agentImageUrl");
                  }}
                />
              </div>

              <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Store card
                </p>
                <AgainFormRow label="Label">
                  <Input
                    value={section.storeLabel}
                    onChange={(e) => pushSection({ ...section, storeLabel: e.target.value })}
                    className="h-8 text-[13px]"
                    placeholder="Store Locator"
                  />
                </AgainFormRow>
                <AgainFormRow label="Title">
                  <Input
                    value={section.storeTitle}
                    onChange={(e) => pushSection({ ...section, storeTitle: e.target.value })}
                    className="h-8 text-[13px]"
                    placeholder="Find our Stores"
                  />
                </AgainFormRow>
                <AgainFormRow label="Link">
                  <Input
                    value={section.storeHref}
                    onChange={(e) => pushSection({ ...section, storeHref: e.target.value })}
                    className="h-8 text-[13px]"
                    placeholder="/outlets"
                  />
                </AgainFormRow>
                <ImagePickField
                  label="Store icon"
                  url={section.storeIconUrl}
                  aspectClass="aspect-square max-w-[120px]"
                  onPick={() => {
                    void refetchMedia();
                    setPicker("storeIconUrl");
                  }}
                />
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
        title="Change support image"
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
