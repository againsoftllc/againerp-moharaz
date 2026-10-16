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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api/client";
import { useCatalogMedia, uploadCatalogMediaFiles } from "@/lib/api/use-catalog-media";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { getStorefrontBaseUrl } from "@/lib/website/live-edit";
import type {
  HeaderLinkItem,
  HeaderMobileSection,
  HeaderSection,
  HomepageContent,
} from "@/lib/website/website-homepage";
import { defaultHeaderMobileSection, defaultHeaderSection } from "@/lib/website/website-homepage";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: HomepageContent;
  onChange?: (content: HomepageContent) => void;
  /** Prefill Desktop vs Mobile tab (e.g. from live-edit device preview). */
  initialTab?: HeaderTabId;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
};

export type HeaderTabId = "desktop" | "mobile";

type PickerMode = "logo" | "orderTrackIcon" | "mobileLogo" | null;

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

export function LiveEditHeaderDrawer({ open,
  onOpenChange,
  content,
  onChange,
  initialTab = "desktop", onSave, saving = false }: Props) {
  const titleId = useId();
  const [section, setSection] = useState<HeaderSection>(
    content.header ?? defaultHeaderSection(),
  );
  const [tab, setTab] = useState<HeaderTabId>(initialTab);
  const [picker, setPicker] = useState<PickerMode>(null);
  const { items: mediaItems, refetch: refetchMedia } = useCatalogMedia();

  useEffect(() => {
    if (open) {
      setSection(content.header ?? defaultHeaderSection());
      setTab(initialTab);
    }
  }, [open, content.header, initialTab]);

  const pushSection = useCallback(
    (next: HeaderSection) => {
      setSection(next);
      queueMicrotask(() => {
        onChange?.({ ...content, header: next });
      });
    },
    [content, onChange],
  );

  const pushLink = (key: "orderTrack" | "pcBuilder", patch: Partial<HeaderLinkItem>) => {
    pushSection({
      ...section,
      [key]: { ...section[key], ...patch },
    });
  };

  const pushMobile = (patch: Partial<HeaderMobileSection>) => {
    const mobile = section.mobile ?? defaultHeaderMobileSection();
    pushSection({
      ...section,
      mobile: { ...mobile, ...patch },
    });
  };

  const handleMediaSelect = (items: MediaLibraryItem[]) => {
    if (!picker || items.length === 0) {
      setPicker(null);
      return;
    }
    const url = items[0].url;
    if (picker === "logo") {
      pushSection({ ...section, logoUrl: url });
    } else if (picker === "mobileLogo") {
      pushMobile({ logoUrl: url });
    } else {
      pushLink("orderTrack", { iconUrl: url, icon: "" });
    }
    setPicker(null);
  };

  const mobile = section.mobile ?? defaultHeaderMobileSection();

  return (
    <>
      <AgainDrawerPanel
        open={open}
        onOpenChange={onOpenChange}
        title="Header"
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
              Header
            </span>
          </AgainDrawerControlBar>
          <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
            <div className="space-y-4">
              <div
                role="tablist"
                aria-label="Header device"
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

              {tab === "desktop" ? (
                <>
                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Desktop header
                    </p>
                    <AgainFormRow
                      label="Enabled"
                      help="Off = hide the desktop header chrome on the storefront"
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
                    <ImagePickField
                      label="Logo image"
                      url={section.logoUrl}
                      aspectClass="aspect-[180/44] max-w-[220px]"
                      onPick={() => {
                        void refetchMedia();
                        setPicker("logo");
                      }}
                    />
                    <AgainFormRow label="Logo link">
                      <Input
                        value={section.logoHref}
                        onChange={(e) => pushSection({ ...section, logoHref: e.target.value })}
                        className="h-8 text-[13px]"
                        placeholder="/"
                      />
                    </AgainFormRow>
                  </div>

                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Search
                    </p>
                    <AgainFormRow label="Placeholder">
                      <Input
                        value={section.searchPlaceholder}
                        onChange={(e) =>
                          pushSection({ ...section, searchPlaceholder: e.target.value })
                        }
                        className="h-8 text-[13px]"
                        placeholder="Search Products"
                      />
                    </AgainFormRow>
                  </div>

                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Order Track
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">Show</span>
                        <Switch
                          checked={!section.orderTrack.hidden}
                          onCheckedChange={(checked) =>
                            pushLink("orderTrack", { hidden: !checked })
                          }
                        />
                      </div>
                    </div>
                    <AgainFormRow label="Label">
                      <Input
                        value={section.orderTrack.label}
                        onChange={(e) => pushLink("orderTrack", { label: e.target.value })}
                        className="h-8 text-[13px]"
                        placeholder="Order Track"
                      />
                    </AgainFormRow>
                    <AgainFormRow label="Link">
                      <Input
                        value={section.orderTrack.href}
                        onChange={(e) => pushLink("orderTrack", { href: e.target.value })}
                        className="h-8 text-[13px]"
                        placeholder="/order-track"
                      />
                    </AgainFormRow>
                    <ImagePickField
                      label="Icon"
                      url={section.orderTrack.iconUrl}
                      aspectClass="aspect-square max-w-[80px]"
                      onPick={() => {
                        void refetchMedia();
                        setPicker("orderTrackIcon");
                      }}
                    />
                  </div>

                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        PC Builder
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">Show</span>
                        <Switch
                          checked={!section.pcBuilder.hidden}
                          onCheckedChange={(checked) =>
                            pushLink("pcBuilder", { hidden: !checked })
                          }
                        />
                      </div>
                    </div>
                    <AgainFormRow label="Label">
                      <Input
                        value={section.pcBuilder.label}
                        onChange={(e) => pushLink("pcBuilder", { label: e.target.value })}
                        className="h-8 text-[13px]"
                        placeholder="PC Builder"
                      />
                    </AgainFormRow>
                    <AgainFormRow label="Link">
                      <Input
                        value={section.pcBuilder.href}
                        onChange={(e) => pushLink("pcBuilder", { href: e.target.value })}
                        className="h-8 text-[13px]"
                        placeholder="/pc-builder"
                      />
                    </AgainFormRow>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Mobile header
                    </p>
                    <AgainFormRow
                      label="Enabled"
                      help="Off = hide the mobile header bar on the storefront"
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
                      Logo
                    </p>
                    <ImagePickField
                      label="Logo image"
                      url={mobile.logoUrl}
                      aspectClass="aspect-[140/34] max-w-[180px]"
                      onPick={() => {
                        void refetchMedia();
                        setPicker("mobileLogo");
                      }}
                    />
                    <AgainFormRow label="Logo link">
                      <Input
                        value={mobile.logoHref}
                        onChange={(e) => pushMobile({ logoHref: e.target.value })}
                        className="h-8 text-[13px]"
                        placeholder="/"
                      />
                    </AgainFormRow>
                  </div>

                  <div className="space-y-3 rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Search
                    </p>
                    <AgainFormRow label="Placeholder">
                      <Input
                        value={mobile.searchPlaceholder}
                        onChange={(e) => pushMobile({ searchPlaceholder: e.target.value })}
                        className="h-8 text-[13px]"
                        placeholder="Search Products"
                      />
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
          picker === "orderTrackIcon"
            ? "Change Order Track icon"
            : picker === "mobileLogo"
              ? "Change mobile header logo"
              : "Change header logo"
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
    </>
  );
}
