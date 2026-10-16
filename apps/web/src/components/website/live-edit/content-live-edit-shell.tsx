"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Monitor, Smartphone, Tablet, Unlock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchWebsitePage,
  updateWebsitePage,
} from "@/lib/api/website-pages";
import {
  getStorefrontBaseUrl,
  isEquivalentStorefrontOrigin,
  isLiveEditSelectMessage,
  LIVE_EDIT_MSG,
  loopbackAlternateOrigin,
  storefrontLiveEditUrl,
} from "@/lib/website/live-edit";
import { LiveEditContentBodyDrawer } from "@/components/website/live-edit/live-edit-content-body-drawer";

type DeviceId = "desktop" | "tablet" | "mobile";

const LOCK_STORAGE_KEY = "website-live-edit-content-locked";
const BODY_SECTION = "body";

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

export function ContentLiveEditShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const pageId = (searchParams.get("pageId") || "").trim();
  const previewPath = useMemo(() => {
    const raw = (searchParams.get("path") || "/about").trim();
    return raw.startsWith("/") ? raw : `/${raw}`;
  }, [searchParams]);

  const [pageName, setPageName] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageLocked, setPageLocked] = useState(false);
  const [device, setDevice] = useState<DeviceId>("desktop");
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const iframeSrc = useMemo(() => storefrontLiveEditUrl(previewPath), [previewPath]);

  useEffect(() => {
    setPageLocked(readInitialLocked());
  }, []);

  useEffect(() => {
    if (!pageId) {
      setLoadError("Missing pageId");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetchWebsitePage(pageId)
      .then((page) => {
        if (cancelled) return;
        setPageName(page.name);
        setBodyHtml(page.bodyHtml ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load page");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

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
    (name: string, html: string) => {
      postToIframe({
        type: LIVE_EDIT_MSG.contentPreview,
        name,
        bodyHtml: html,
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
    postToIframe({ type: LIVE_EDIT_MSG.contentReload });
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
        postHighlight(null);
      }
    },
    [postLock, postHighlight],
  );

  useEffect(() => {
    postLock(pageLocked);
  }, [pageLocked, postLock]);

  useEffect(() => {
    if (loading) return;
    const t = window.setTimeout(() => postPreview(pageName, bodyHtml), 120);
    return () => window.clearTimeout(t);
  }, [pageName, bodyHtml, loading, postPreview]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isEquivalentStorefrontOrigin(event.origin, storefrontOrigin)) return;
      if (pageLocked) return;
      if (!isLiveEditSelectMessage(event.data)) return;
      if (event.data.sectionId !== BODY_SECTION) return;
      setDrawerOpen(true);
      postHighlight(BODY_SECTION);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [storefrontOrigin, pageLocked, postHighlight]);

  const handleSave = async () => {
    if (!pageId) return;
    setSaving(true);
    try {
      await updateWebsitePage(pageId, { name: pageName, bodyHtml });
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
    if (!open) postHighlight(null);
  };

  const closeEditor = () => router.push("/website/pages");
  const deviceWidth = DEVICES.find((d) => d.id === device)?.width ?? "100%";
  const error = loadError || (!pageId ? "Missing pageId" : null);

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <header className="relative flex h-11 shrink-0 items-center border-b border-border px-3">
        <div className="z-10 flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-8 bg-[#00a09d] px-3 text-[13px] text-white hover:bg-[#008f8c]"
            disabled={saving || !!error}
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
          <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground sm:inline">
            {pageName || "Content"}
          </span>
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
            title="Content live edit"
            src={iframeSrc}
            className="h-full w-full border-0 bg-white"
            allow="clipboard-read; clipboard-write"
            onLoad={() => {
              postLock(pageLocked);
              postPreview(pageName, bodyHtml);
            }}
          />
        </div>
      </div>

      <LiveEditContentBodyDrawer
        open={!pageLocked && drawerOpen}
        onOpenChange={closeDrawer}
        pageName={pageName}
        bodyHtml={bodyHtml}
        onChange={(next) => {
          if (next.name !== undefined) setPageName(next.name);
          if (next.bodyHtml !== undefined) setBodyHtml(next.bodyHtml);
        }}
        onSave={() => void handleSave()}
        saving={saving}
      />
    </div>
  );
}
