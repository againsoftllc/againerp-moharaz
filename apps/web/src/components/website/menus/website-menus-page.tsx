"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { WebsiteMenuGrid } from "@/components/website/menus/website-menu-grid";
import { WebsiteMenuFormDrawer } from "@/components/website/menus/website-menu-form-drawer";
import { LiveEditAboutDrawer } from "@/components/website/live-edit/live-edit-about-drawer";
import { LiveEditBannersDrawer } from "@/components/website/live-edit/live-edit-banners-drawer";
import { LiveEditBrandsDrawer } from "@/components/website/live-edit/live-edit-brands-drawer";
import { LiveEditCategoriesDrawer } from "@/components/website/live-edit/live-edit-categories-drawer";
import { LiveEditFeaturedDrawer } from "@/components/website/live-edit/live-edit-featured-drawer";
import { LiveEditFooterDrawer } from "@/components/website/live-edit/live-edit-footer-drawer";
import { LiveEditHeaderDrawer } from "@/components/website/live-edit/live-edit-header-drawer";
import { LiveEditHeroDrawer } from "@/components/website/live-edit/live-edit-hero-drawer";
import { LiveEditShopMenuDrawer } from "@/components/website/live-edit/live-edit-shop-menu-drawer";
import { LiveEditSideMenuDrawer } from "@/components/website/live-edit/live-edit-side-menu-drawer";
import { LiveEditSupportDrawer } from "@/components/website/live-edit/live-edit-support-drawer";
import { ApiRefreshButton } from "@/components/products/api-refresh-button";
import { Button } from "@/components/ui/button";
import { useWebsiteMenus } from "@/lib/api/use-website-menus";
import { useWebsiteHomepage } from "@/lib/api/use-website-homepage";
import { fetchWebsiteMenu } from "@/lib/api/website-menus";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import type { HomepageContent } from "@/lib/website/website-homepage";
import { HERO_SECTION_ASPECT } from "@/lib/website/website-homepage";
import type { WebsiteMenu, WebsiteMenuItem } from "@/lib/website/website-menus";
import { cn } from "@/lib/utils";

const HERO_PREVIEW_WIDTH = 520;
const HERO_SECTION_SIZE = {
  width: HERO_PREVIEW_WIDTH,
  height: Math.round(HERO_PREVIEW_WIDTH / HERO_SECTION_ASPECT),
};

type StorefrontSectionId =
  | "header"
  | "footer"
  | "toolbar"
  | "shop"
  | "hero"
  | "categories"
  | "banners"
  | "featured"
  | "brands"
  | "about"
  | "support";

const STOREFRONT_SECTIONS: {
  id: StorefrontSectionId;
  title: string;
  description: string;
}[] = [
  {
    id: "header",
    title: "Header",
    description: "Logo, search placeholder, Order Track, PC Builder — desktop & mobile",
  },
  {
    id: "footer",
    title: "Footer",
    description: "Logo, about, socials, membership, copyright, payment — desktop & mobile",
  },
  {
    id: "toolbar",
    title: "Toolbar",
    description: "Left floating rail — logo and icon links",
  },
  {
    id: "shop",
    title: "Shop",
    description: "Header Shop button menu (catalog.shop slot)",
  },
  {
    id: "hero",
    title: "Hero",
    description: "Homepage slider banners",
  },
  {
    id: "categories",
    title: "Categories",
    description: "Homepage category carousel pins",
  },
  {
    id: "banners",
    title: "Banners",
    description: "Dual banner strip under categories",
  },
  {
    id: "featured",
    title: "Featured",
    description: "Most Wanted tabs and product feeds",
  },
  {
    id: "brands",
    title: "Brands",
    description: "Brand slider pins",
  },
  {
    id: "about",
    title: "About",
    description: "About box title and HTML body",
  },
  {
    id: "support",
    title: "Support",
    description: "Support contacts and store locator card",
  },
];

function buildUrl(params: URLSearchParams) {
  const q = params.toString();
  return q ? `/website/menus?${q}` : "/website/menus";
}

function isStorefrontSection(id: string | null): id is StorefrontSectionId {
  return STOREFRONT_SECTIONS.some((s) => s.id === id);
}

function MenusListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { menus, loading, error, refetch, create, update, remove } = useWebsiteMenus();
  const {
    content,
    loading: homepageLoading,
    error: homepageError,
    saveContent,
    refetch: refetchHomepage,
  } = useWebsiteHomepage();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const sectionParam = searchParams.get("section");

  const [editing, setEditing] = useState<WebsiteMenu | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [draft, setDraft] = useState<HomepageContent>(content);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeSection = isStorefrontSection(sectionParam) ? sectionParam : null;

  useEffect(() => {
    setDraft(content);
    setDirty(false);
  }, [content]);

  const listEditMenu = useMemo(
    () => (editId ? menus.find((m) => m.id === editId) ?? null : null),
    [editId, menus],
  );

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "website-menus-api" });
  }, [error]);

  useEffect(() => {
    if (homepageError) toast.error(`Homepage: ${homepageError}`, { id: "website-homepage-api" });
  }, [homepageError]);

  const pushParams = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    mutate(p);
    router.push(buildUrl(p), { scroll: false });
  };

  const openCreate = () =>
    pushParams((p) => {
      p.delete("edit");
      p.delete("section");
      p.set("create", "1");
    });

  const handleEditMenu = (menu: WebsiteMenu) =>
    pushParams((p) => {
      p.delete("create");
      p.delete("section");
      p.set("edit", menu.id);
    });

  const openSection = (id: StorefrontSectionId) =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
      p.set("section", id);
    });

  const closeForm = () => {
    setEditing(null);
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
    });
  };

  const closeSection = () =>
    pushParams((p) => {
      p.delete("section");
    });

  useViewerWriteUrlGuard(createOpen || !!editId || !!activeSection, () => {
    closeForm();
    closeSection();
  });

  useEffect(() => {
    if (!editId) {
      setEditing(null);
      return;
    }
    let cancelled = false;
    setEditLoading(true);
    fetchWebsiteMenu(editId)
      .then((full) => {
        if (!cancelled) setEditing(full);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load menu");
          closeForm();
        }
      })
      .finally(() => {
        if (!cancelled) setEditLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  useEffect(() => {
    if (editId && !loading && !listEditMenu && !editLoading) {
      toast.error("Menu not found");
      closeForm();
    }
  }, [editId, listEditMenu, loading, editLoading]);

  const formOpen = createOpen || (!!editId && !!editing);

  const handleDraftChange = useCallback((next: HomepageContent) => {
    setDraft(next);
    setDirty(true);
  }, []);

  const persistDraft = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await saveContent(draft);
      setDirty(false);
      toast.success("Section saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [dirty, draft, saveContent]);

  const handleSectionOpenChange = (open: boolean) => {
    if (open) return;
    void (async () => {
      if (dirty) await persistDraft();
      closeSection();
    })();
  };

  const handleSaveMenu = async (data: {
    name: string;
    source: WebsiteMenu["source"];
    autoType: WebsiteMenu["autoType"];
    autoShowNew: boolean;
    items: WebsiteMenuItem[];
  }) => {
    if (createOpen) {
      await create({
        name: data.name,
        source: data.source,
        autoType: data.autoType,
        autoShowNew: data.autoShowNew,
        items: data.items,
      });
      toast.success("Menu created");
    } else if (editing) {
      await update(editing.id, {
        name: data.name,
        source: data.source,
        autoType: data.autoType,
        autoShowNew: data.autoShowNew,
        items: data.items,
      });
      toast.success("Menu saved");
    }
    await refetch();
    closeForm();
  };

  const handleDelete = async (menu: WebsiteMenu) => {
    if (menu.kind === "system") return;
    if (!window.confirm(`Delete menu “${menu.name}”?`)) return;
    try {
      await remove(menu.id);
      toast.success("Menu deleted");
      if (editId === menu.id) closeForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const headerRightActions = canWrite ? (
    <Button size="sm" className="h-8 gap-1.5" onClick={openCreate}>
      <Plus className="h-4 w-4" />
      Add
    </Button>
  ) : null;

  const footerLeftActions = (
    <>
      <span className="text-sm font-medium text-foreground">Menus</span>
      <ApiRefreshButton
        status={apiHealth.status}
        loading={loading}
        onRefresh={() => {
          void refetch();
          void refetchHomepage();
          apiHealth.recheck();
        }}
        disabled={loading}
      />
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-6">
        {/* Menu section */}
        <section className="space-y-3" aria-labelledby="website-section-menu">
          <div className="flex flex-wrap items-end justify-between gap-2 px-0.5">
            <div>
              <h2 id="website-section-menu" className="text-base font-semibold text-foreground">
                Menu
              </h2>
              <p className="text-[13px] text-muted-foreground">
                Auto or Custom menus used by Shop, Footer, and other slots.
              </p>
            </div>
            {dirty ? (
              <Button
                size="sm"
                className="h-8"
                disabled={saving || !canWrite}
                onClick={() => void persistDraft()}
              >
                {saving ? "Saving…" : "Save storefront"}
              </Button>
            ) : null}
          </div>

          {error && !loading ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <p className="font-medium text-destructive">Could not load menus from API</p>
              <p className="mt-1 text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <WebsiteMenuGrid
              menus={menus}
              loading={loading || (Boolean(editId) && editLoading)}
              canWrite={canWrite}
              onEdit={handleEditMenu}
              onDelete={canWrite ? (m) => void handleDelete(m) : undefined}
              footerLeftActions={footerLeftActions}
              headerRightActions={headerRightActions}
              className="h-[min(420px,50vh)] shrink-0"
            />
          )}
        </section>

        {/* Live-edit storefront sections */}
        <section className="space-y-3" aria-labelledby="website-section-storefront">
          <div className="px-0.5">
            <h2 id="website-section-storefront" className="text-base font-semibold text-foreground">
              Storefront sections
            </h2>
            <p className="text-[13px] text-muted-foreground">
              Same sections you edit in live preview — open each drawer here.
            </p>
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-card">
            {STOREFRONT_SECTIONS.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 px-3 py-3",
                  index > 0 && "border-t border-border",
                )}
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground">{item.title}</p>
                  <p className="text-[12px] text-muted-foreground">{item.description}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1"
                  disabled={!canWrite || homepageLoading}
                  onClick={() => openSection(item.id)}
                >
                  Edit
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {canWrite ? (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-[270] h-12 w-12 rounded-full p-0 shadow-lg md:hidden"
          onClick={openCreate}
          aria-label="Add menu"
        >
          <Plus className="h-5 w-5" />
        </Button>
      ) : null}

      {canWrite ? (
        <WebsiteMenuFormDrawer
          open={formOpen}
          mode={createOpen ? "create" : "edit"}
          menu={createOpen ? null : editing}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          onSave={handleSaveMenu}
        />
      ) : null}

      {canWrite ? (
        <>
          <LiveEditHeaderDrawer
            open={activeSection === "header"}
            onOpenChange={handleSectionOpenChange}
            content={draft}
            onChange={handleDraftChange}
          />
          <LiveEditFooterDrawer
            open={activeSection === "footer"}
            onOpenChange={handleSectionOpenChange}
            content={draft}
            onChange={handleDraftChange}
          />
          <LiveEditSideMenuDrawer
            open={activeSection === "toolbar"}
            onOpenChange={handleSectionOpenChange}
            content={draft}
            onChange={handleDraftChange}
          />
          <LiveEditShopMenuDrawer
            open={activeSection === "shop"}
            onOpenChange={handleSectionOpenChange}
          />
          <LiveEditHeroDrawer
            open={activeSection === "hero"}
            onOpenChange={handleSectionOpenChange}
            content={draft}
            sectionSize={HERO_SECTION_SIZE}
            onChange={handleDraftChange}
          />
          <LiveEditCategoriesDrawer
            open={activeSection === "categories"}
            onOpenChange={handleSectionOpenChange}
            content={draft}
            onChange={handleDraftChange}
          />
          <LiveEditBannersDrawer
            open={activeSection === "banners"}
            onOpenChange={handleSectionOpenChange}
            content={draft}
            onChange={handleDraftChange}
          />
          <LiveEditFeaturedDrawer
            open={activeSection === "featured"}
            onOpenChange={handleSectionOpenChange}
            content={draft}
            onChange={handleDraftChange}
          />
          <LiveEditBrandsDrawer
            open={activeSection === "brands"}
            onOpenChange={handleSectionOpenChange}
            content={draft}
            onChange={handleDraftChange}
          />
          <LiveEditAboutDrawer
            open={activeSection === "about"}
            onOpenChange={handleSectionOpenChange}
            content={draft}
            onChange={handleDraftChange}
          />
          <LiveEditSupportDrawer
            open={activeSection === "support"}
            onOpenChange={handleSectionOpenChange}
            content={draft}
            onChange={handleDraftChange}
          />
        </>
      ) : null}
    </div>
  );
}

export function WebsiteMenusPage() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Suspense
        fallback={
          <p className="flex flex-1 items-center text-sm text-muted-foreground">
            Loading menus…
          </p>
        }
      >
        <MenusListContent />
      </Suspense>
    </div>
  );
}
