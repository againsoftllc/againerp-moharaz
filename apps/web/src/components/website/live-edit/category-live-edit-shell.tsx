"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Monitor, Settings2, Smartphone, Tablet, Unlock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWebsiteCategoryPage } from "@/lib/api/use-website-category-page";
import type { CategoryPageContent } from "@/lib/website/website-category-page";
import { categoryPageContentToStorefrontPayload } from "@/lib/website/website-category-page";
import {
  getStorefrontBaseUrl,
  isEquivalentStorefrontOrigin,
  isLiveEditSelectMessage,
  LIVE_EDIT_MSG,
  loopbackAlternateOrigin,
  storefrontLiveEditUrl,
} from "@/lib/website/live-edit";
import {
  LiveEditCategoryDescriptionDrawer,
  LiveEditCategoryFiltersDrawer,
  LiveEditCategoryProductCardDrawer,
  LiveEditCategorySettingsDrawer,
  LiveEditCategorySortingDrawer,
  LiveEditCategoryStatsDrawer,
} from "@/components/website/live-edit/live-edit-category-plp-drawers";

type DeviceId = "desktop" | "tablet" | "mobile";

type SectionId =
  | "settings"
  | "sorting"
  | "filters"
  | "product_grid"
  | "stats"
  | "description";

const LOCK_STORAGE_KEY = "website-live-edit-category-locked";
const DEFAULT_CATEGORY_PATH = "/laptops";

const EDITABLE = new Set<string>([
  "settings",
  "sorting",
  "filters",
  "product_grid",
  "stats",
  "description",
]);

const DEVICES: { id: DeviceId; label: string; icon: typeof Monitor; width: string }[] = [
  { id: "desktop", label: "Desktop", icon: Monitor, width: "100%" },
  { id: "tablet", label: "Tablet", icon: Tablet, width: "768px" },
  { id: "mobile", label: "Mobile", icon: Smartphone, width: "390px" },
];

function readInitialLocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(LOCK_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function normalizeCategoryStorefrontPath(raw: string | null | undefined): string {
  const value = (raw || "").trim();
  if (!value) return DEFAULT_CATEGORY_PATH;
  let path = value.startsWith("/") ? value : `/${value}`;
  if (path.startsWith("/category/")) {
    const slug = path.slice("/category/".length).split("/")[0];
    path = slug ? `/${slug}` : DEFAULT_CATEGORY_PATH;
  }
  if (path === "/" || path === "/category") return DEFAULT_CATEGORY_PATH;
  return path;
}

export function CategoryLiveEditShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { content, error, saveContent } = useWebsiteCategoryPage();
  const [draft, setDraft] = useState<CategoryPageContent>(content);
  const [pageLocked, setPageLocked] = useState(false);
  const [device, setDevice] = useState<DeviceId>("desktop");
  const [saving, setSaving] = useState(false);
  const [selectedSection, setSelectedSection] = useState<SectionId | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const previewPath = useMemo(
    () => normalizeCategoryStorefrontPath(searchParams.get("path")),
    [searchParams],
  );
  const iframeSrc = useMemo(() => storefrontLiveEditUrl(previewPath), [previewPath]);

  useEffect(() => {
    setPageLocked(readInitialLocked());
  }, []);

  useEffect(() => {
    setDraft(content);
  }, [content]);

  const storefrontOrigin = (() => {
    try {
      return new URL(getStorefrontBaseUrl()).origin;
    } catch {
      return "http://localhost:3010";
    }
  })();

  const postToIframe = useCallback(
    (message: Record<string, unknown>) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      const targets = new Set<string>([storefrontOrigin]);
      const alt = loopbackAlternateOrigin(storefrontOrigin);
      if (alt) targets.add(alt);
      for (const target of targets) {
        try {
          win.postMessage(message, target);
        } catch {
          /* ignore */
        }
      }
    },
    [storefrontOrigin],
  );

  const postLock = useCallback(
    (locked: boolean) => {
      postToIframe({ type: LIVE_EDIT_MSG.lock, locked });
    },
    [postToIframe],
  );

  const postPreview = useCallback(
    (next: CategoryPageContent) => {
      postToIframe({
        type: LIVE_EDIT_MSG.categoryPreview,
        content: categoryPageContentToStorefrontPayload(next),
      });
    },
    [postToIframe],
  );

  const postHighlight = useCallback(
    (sectionId: string | null) => {
      postToIframe({ type: LIVE_EDIT_MSG.highlight, sectionId });
    },
    [postToIframe],
  );

  const postReload = useCallback(() => {
    postToIframe({ type: LIVE_EDIT_MSG.categoryReload });
  }, [postToIframe]);

  const setLocked = useCallback(
    (locked: boolean) => {
      setPageLocked(locked);
      try {
        window.sessionStorage.setItem(LOCK_STORAGE_KEY, locked ? "1" : "0");
      } catch {
        /* ignore */
      }
      postLock(locked);
      if (locked) {
        setDrawerOpen(false);
        setSelectedSection(null);
        postHighlight(null);
      }
    },
    [postLock, postHighlight],
  );

  useEffect(() => {
    postLock(pageLocked);
  }, [pageLocked, postLock]);

  useEffect(() => {
    const t = window.setTimeout(() => postPreview(draft), 120);
    return () => window.clearTimeout(t);
  }, [draft, postPreview]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isEquivalentStorefrontOrigin(event.origin, storefrontOrigin)) return;
      if (pageLocked) return;
      if (!isLiveEditSelectMessage(event.data)) return;
      const id = event.data.sectionId;
      if (!EDITABLE.has(id)) return;
      setSelectedSection(id as SectionId);
      setDrawerOpen(true);
      postHighlight(id);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [storefrontOrigin, pageLocked, postHighlight]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveContent(draft);
      postReload();
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const closeDrawer = (open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      setSelectedSection(null);
      postHighlight(null);
    }
  };

  const closeEditor = () => router.push("/website/pages");
  const deviceWidth = DEVICES.find((d) => d.id === device)?.width ?? "100%";

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <header className="relative flex h-11 shrink-0 items-center border-b border-border px-3">
        <div className="z-10 flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-8 bg-[#00a09d] px-3 text-[13px] text-white hover:bg-[#008f8c]"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className={cn(
              "h-8 w-8",
              pageLocked
                ? "border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400"
                : "text-muted-foreground",
            )}
            title={pageLocked ? "Unlock page" : "Lock page"}
            aria-label={pageLocked ? "Unlock page" : "Lock page"}
            aria-pressed={pageLocked}
            onClick={() => setLocked(!pageLocked)}
          >
            {pageLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 text-muted-foreground"
            title="Catalog settings"
            aria-label="Catalog settings"
            disabled={pageLocked}
            onClick={() => {
              setSelectedSection("settings");
              setDrawerOpen(true);
              postHighlight("settings");
            }}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <span className="hidden text-sm text-muted-foreground sm:inline">Category</span>
        </div>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
            {DEVICES.map((item) => {
              const Icon = item.icon;
              const active = device === item.id;
              return (
                <Button
                  key={item.id}
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8 text-muted-foreground",
                    active && "bg-background text-foreground shadow-sm",
                  )}
                  title={item.label}
                  aria-label={item.label}
                  aria-pressed={active}
                  onClick={() => setDevice(item.id)}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              );
            })}
          </div>
        </div>

        <div className="z-10 ml-auto flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Close live edit"
            onClick={closeEditor}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-hidden bg-muted/40 p-0">
        {error ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-6">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : null}
        <div
          className={cn(
            "h-full overflow-hidden bg-white transition-[width] duration-200 ease-out",
            device !== "desktop" && "my-3 rounded-md border border-border shadow-sm",
          )}
          style={{ width: deviceWidth, maxWidth: "100%" }}
        >
          <iframe
            ref={iframeRef}
            title="Category live edit"
            src={iframeSrc}
            className="h-full w-full border-0 bg-white"
            allow="clipboard-read; clipboard-write"
            onLoad={() => {
              postLock(pageLocked);
              postPreview(draft);
            }}
          />
        </div>
      </div>

      <LiveEditCategorySettingsDrawer
        open={!pageLocked && drawerOpen && selectedSection === "settings"}
        onOpenChange={closeDrawer}
        content={draft}
        onChange={setDraft}
        onSave={() => void handleSave()}
        saving={saving}
      />
      <LiveEditCategorySortingDrawer
        open={!pageLocked && drawerOpen && selectedSection === "sorting"}
        onOpenChange={closeDrawer}
        content={draft}
        onChange={setDraft}
        onSave={() => void handleSave()}
        saving={saving}
      />
      <LiveEditCategoryFiltersDrawer
        open={!pageLocked && drawerOpen && selectedSection === "filters"}
        onOpenChange={closeDrawer}
        content={draft}
        onChange={setDraft}
        onSave={() => void handleSave()}
        saving={saving}
      />
      <LiveEditCategoryProductCardDrawer
        open={!pageLocked && drawerOpen && selectedSection === "product_grid"}
        onOpenChange={closeDrawer}
        content={draft}
        onChange={setDraft}
        onSave={() => void handleSave()}
        saving={saving}
      />
      <LiveEditCategoryStatsDrawer
        open={!pageLocked && drawerOpen && selectedSection === "stats"}
        onOpenChange={closeDrawer}
        content={draft}
        onChange={setDraft}
        onSave={() => void handleSave()}
        saving={saving}
      />
      <LiveEditCategoryDescriptionDrawer
        open={!pageLocked && drawerOpen && selectedSection === "description"}
        onOpenChange={closeDrawer}
        content={draft}
        onChange={setDraft}
        onSave={() => void handleSave()}
        saving={saving}
      />
    </div>
  );
}
