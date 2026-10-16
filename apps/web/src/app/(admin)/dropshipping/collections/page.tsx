"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CollectionGrid } from "@/components/collections/collection-grid";
import { CollectionFormDialog } from "@/components/collections/collection-form-dialog";
import { ApiConnectionBadge } from "@/components/products/api-connection-badge";
import type { ProductCollection } from "@/lib/mock-data/collections";
import {
  createCatalogCollection,
  patchCatalogCollection,
  updateCatalogCollection,
  useCatalogCollections,
} from "@/lib/api/use-catalog-collections";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { cn, formatQuantity } from "@/lib/utils";

function buildUrl(params: URLSearchParams) {
  const q = params.toString();
  return q ? `/dropshipping/collections?${q}` : "/dropshipping/collections";
}

function CollectionListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { collections, total, loading, error, refetch } = useCatalogCollections();
  const canWrite = useAdminCanWrite();

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");

  const editCollection = useMemo(
    () => (editId ? collections.find((c) => c.id === editId) ?? null : null),
    [editId, collections],
  );

  useEffect(() => {
    if (error) {
      toast.error(`API: ${error}`, { id: "catalog-collections-api" });
    }
  }, [error]);

  const pushParams = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    mutate(p);
    router.push(buildUrl(p), { scroll: false });
  };

  const openCreate = () =>
    pushParams((p) => {
      p.delete("edit");
      p.set("create", "1");
    });

  const handleEdit = (collection: ProductCollection) =>
    pushParams((p) => {
      p.delete("create");
      p.set("edit", collection.id);
    });

  const closeForm = () =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
    });

  useViewerWriteUrlGuard(createOpen || !!editId, closeForm);

  useEffect(() => {
    if (editId && !loading && !editCollection) {
      toast.error("Collection not found");
      closeForm();
    }
  }, [editId, editCollection, loading]);

  const handleSave = async (data: Partial<ProductCollection>) => {
    try {
      if (createOpen) {
        await createCatalogCollection({
          name: data.name ?? "New Collection",
          slug: data.slug ?? "new-collection",
          type: data.type ?? "custom",
          status: data.status ?? "draft",
          ruleSummary: data.ruleSummary,
          heroImageUrl: data.heroImageUrl,
          description: data.description,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          scheduleStart: data.scheduleStart,
          scheduleEnd: data.scheduleEnd,
        });
        toast.success("Collection created");
      } else if (editCollection) {
        await updateCatalogCollection(editCollection.id, {
          name: data.name,
          slug: data.slug,
          type: data.type,
          status: data.status,
          ruleSummary: data.ruleSummary,
          heroImageUrl: data.heroImageUrl,
          description: data.description,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          scheduleStart: data.scheduleStart,
          scheduleEnd: data.scheduleEnd,
        });
        toast.success("Collection updated");
      }
      await refetch();
      closeForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleLiveChange = async (data: Partial<ProductCollection> & { id: string }) => {
    try {
      await patchCatalogCollection(data.id, data);
      await refetch();
    } catch {
      // silent while form is open
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-2.75rem-1.5rem)] flex-col lg:min-h-[calc(100vh-2.75rem-2rem)]">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title">
            Collections
            <span className="ml-2 text-base font-normal text-muted-foreground">
              ({loading ? "…" : formatQuantity(total)})
            </span>
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Merchandising sets — featured, dynamic rules, or manual product picks. Drag rows to set
            storefront display order.
          </p>
          <div className="mt-1.5">
            <ApiConnectionBadge loading={loading} error={error} productCount={total} />
          </div>
        </div>
        <div className="hidden gap-2 sm:flex">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.info("Import — coming soon")}>
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.info("Export — coming soon")}>
            Export
          </Button>
          {canWrite && (
            <Button size="sm" onClick={openCreate}>
              + Add Collection
            </Button>
          )}
        </div>
      </div>

      <CollectionGrid
        className="mt-3 min-h-0 flex-1"
        collections={collections}
        loading={loading}
        onCollectionsChanged={() => void refetch()}
        onEdit={handleEdit}
      />

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg sm:hidden"
          onClick={openCreate}
          aria-label="Add collection"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      {canWrite && (
        <CollectionFormDialog
          open={createOpen || !!editCollection}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          mode={createOpen ? "create" : "edit"}
          collection={editCollection}
          onSave={(data) => void handleSave(data)}
          onLiveChange={(data) => void handleLiveChange(data)}
        />
      )}
    </div>
  );
}

export default function CollectionsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading collections…</div>}>
      <CollectionListContent />
    </Suspense>
  );
}
