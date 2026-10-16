"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import {
  type Review,
  type ReviewStatus,
} from "@/lib/mock-data/reviews";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import {
  createCatalogReview,
  updateCatalogReview,
} from "@/lib/api/use-catalog-reviews";
import {
  createCatalogMediaBatch,
  uploadCatalogMediaFiles,
  useCatalogMedia,
} from "@/lib/api/use-catalog-media";
import { useCatalogProducts } from "@/lib/api/use-catalog-products";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { ProductCombobox } from "@/components/products/product-combobox";
import { MediaGallery } from "@/components/products/media-gallery";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import * as SwitchPrimitive from "@radix-ui/react-switch";

type Mode = "create" | "edit" | "view";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  review?: Review | null;
  loading?: boolean;
  onSaved?: () => void;
  onEdit?: (review: Review) => void;
};

function isEnabledStatus(status: ReviewStatus) {
  return status === "approved";
}

function statusFromEnabled(enabled: boolean): ReviewStatus {
  return enabled ? "approved" : "archived";
}

type FormState = {
  productId: string;
  customerName: string;
  body: string;
  rating: number;
  status: ReviewStatus;
  isVerifiedPurchase: boolean;
};

function emptyForm(): FormState {
  return {
    productId: "",
    customerName: "",
    body: "",
    rating: 5,
    status: "pending",
    isVerifiedPurchase: false,
  };
}

function fromReview(review: Review): FormState {
  return {
    productId: review.product.id,
    customerName: review.customer.name,
    body: review.body,
    rating: review.rating,
    status: review.status,
    isVerifiedPurchase: review.isVerifiedPurchase,
  };
}

function mediaFromReview(review: Review | null | undefined): MediaLibraryItem[] {
  if (!review) return [];
  const fromMedia = review.media.map((item) => ({
    id: item.id,
    name: item.caption || item.id,
    title: item.caption || item.id,
    folder: "Reviews",
    url: item.url,
    type: item.type === "video" ? ("video" as const) : ("image" as const),
    mimeType: item.type === "video" ? "video/mp4" : "image/jpeg",
    sizeKb: 0,
    uploadedAt: review.createdAt,
  }));
  if (fromMedia.length) return fromMedia;
  if (review.customer.imageUrl) {
    return [
      {
        id: `${review.id}-customer-image`,
        name: "Customer photo",
        title: "Customer photo",
        folder: "Reviews",
        url: review.customer.imageUrl,
        type: "image",
        mimeType: "image/jpeg",
        sizeKb: 0,
        uploadedAt: review.createdAt,
      },
    ];
  }
  return [];
}

function titleFromBody(body: string, fallback: string) {
  const trimmed = body.trim().replace(/\s+/g, " ");
  if (!trimmed) return fallback;
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("block space-y-1", className)}>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function StarsPicker({
  value,
  onChange,
  readOnly,
}: {
  value: number;
  onChange?: (n: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          disabled={readOnly}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-none",
            !readOnly && "hover:bg-muted",
            readOnly && "cursor-default",
          )}
          onClick={() => onChange?.(s)}
          aria-label={`${s} stars`}
        >
          <Star
            className={cn(
              "h-4 w-4",
              s <= value ? "fill-yellow-400 text-yellow-400" : "text-muted",
            )}
          />
        </button>
      ))}
    </div>
  );
}

function ReadValue({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn("text-sm text-foreground", className)}>{children || "—"}</p>;
}

export function ReviewFormDialog({
  open,
  onOpenChange,
  mode,
  review,
  loading = false,
  onSaved,
  onEdit,
}: Props) {
  const canWrite = useAdminCanWrite();
  const { products } = useCatalogProducts({ channel: "catalog" });
  const { items: mediaItems, refetch: refetchMedia } = useCatalogMedia();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [reviewMedia, setReviewMedia] = useState<MediaLibraryItem[]>([]);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const isView = mode === "view";
  const isCreate = mode === "create";
  const isEdit = mode === "edit";

  useEffect(() => {
    if (!open) return;
    if (review && (isEdit || isView)) {
      setForm(fromReview(review));
      setReviewMedia(mediaFromReview(review));
    } else if (isCreate) {
      setForm(emptyForm());
      setReviewMedia([]);
    }
  }, [open, review, isEdit, isView, isCreate]);

  const sheetTitle =
    mode === "create"
      ? "Add review"
      : mode === "edit"
        ? `Edit review${review?.reviewId ? `: ${review.reviewId}` : ""}`
        : `Review${review?.reviewId ? `: ${review.reviewId}` : ""}`;

  const set =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) =>
      setForm((f) => ({ ...f, [key]: value }));

  const mediaPayload = reviewMedia.map((item) => ({
    id: item.id,
    url: item.url,
    name: item.name || item.title,
    mediaType: (item.type === "video" ? "video" : "image") as "image" | "video",
  }));

  const handleSave = async () => {
    if (!canWrite) return;
    if (!form.customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (!form.body.trim()) {
      toast.error("Review text is required");
      return;
    }
    if (isCreate && !form.productId) {
      toast.error("Select a product");
      return;
    }

    const autoTitle = titleFromBody(
      form.body,
      `${form.customerName.trim()}'s review`,
    );

    setSaving(true);
    try {
      if (isCreate) {
        await createCatalogReview({
          productId: form.productId,
          customerName: form.customerName.trim(),
          customerImageUrl: mediaPayload[0]?.url ?? null,
          media: mediaPayload,
          title: autoTitle,
          body: form.body.trim(),
          rating: form.rating,
          reviewType: "text",
          status: form.status,
          sentiment: "neutral",
          isVerifiedPurchase: form.isVerifiedPurchase,
        });
        toast.success("Review created");
      } else if (review) {
        await updateCatalogReview(review.id, {
          customerName: form.customerName.trim(),
          customerImageUrl: mediaPayload[0]?.url ?? null,
          media: mediaPayload,
          body: form.body.trim(),
          rating: form.rating,
          status: form.status,
          isVerifiedPurchase: form.isVerifiedPurchase,
          moderatedBy: form.status !== "pending" ? "Admin" : undefined,
        });
        toast.success("Review updated");
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          title={sheetTitle}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-full max-w-[100vw] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0 sm:w-[min(100%,32rem)] sm:min-w-[320px] sm:max-w-[720px]"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3 pr-10 sm:px-4">
              {loading && !review && !isCreate ? (
                <ContentDataSkeleton label="Loading review…" showFilters={false} rows={6} />
              ) : (
                <div className="space-y-4">
                  {!isCreate && review && (
                    <div className="flex min-w-0 items-center gap-3 rounded-none border border-input bg-muted/20 p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={review.product.imageUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{review.product.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {review.reviewId}
                          {review.product.sku ? ` · ${review.product.sku}` : ""}
                        </p>
                      </div>
                    </div>
                  )}

                  {isCreate && (
                    <Field label="Product">
                      <ProductCombobox
                        products={products}
                        value={form.productId}
                        onChange={set("productId")}
                        placeholder="Select product…"
                      />
                    </Field>
                  )}

                  <Field label="Customer">
                    {isView ? (
                      <ReadValue>{form.customerName}</ReadValue>
                    ) : (
                      <Input
                        className="h-8 rounded-none"
                        value={form.customerName}
                        onChange={(e) => set("customerName")(e.target.value)}
                        placeholder="Customer name"
                      />
                    )}
                  </Field>

                  <Field label="Rating">
                    <StarsPicker
                      value={form.rating}
                      readOnly={isView}
                      onChange={isView ? undefined : set("rating")}
                    />
                  </Field>

                  <Field label="Review">
                    {isView ? (
                      <p className="whitespace-pre-wrap text-sm text-foreground">
                        {form.body || "—"}
                      </p>
                    ) : (
                      <textarea
                        className="min-h-[120px] w-full rounded-none border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={form.body}
                        onChange={(e) => set("body")(e.target.value)}
                        placeholder="Review body"
                      />
                    )}
                  </Field>

                  <Field label="Photos">
                    {isView ? (
                      reviewMedia.length ? (
                        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                          {reviewMedia.map((item) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={item.id}
                              src={item.url}
                              alt={item.name}
                              className="aspect-square w-full object-cover"
                            />
                          ))}
                        </div>
                      ) : (
                        <ReadValue>—</ReadValue>
                      )
                    ) : reviewMedia.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => setMediaLibraryOpen(true)}
                        className="flex w-full flex-col items-center gap-1 rounded-none border border-dashed border-input bg-muted/20 px-3 py-6 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      >
                        <ImagePlus className="h-5 w-5" />
                        Add photos
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <MediaGallery
                          items={reviewMedia}
                          onReorder={setReviewMedia}
                          onRemove={(id) =>
                            setReviewMedia((prev) => prev.filter((item) => item.id !== id))
                          }
                          onAddMore={() => setMediaLibraryOpen(true)}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {reviewMedia.length} file{reviewMedia.length === 1 ? "" : "s"} · Drag to
                          reorder
                        </p>
                      </div>
                    )}
                  </Field>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Status">
                      {isView ? (
                        <ReadValue>
                          {isEnabledStatus(form.status) ? "Enable" : "Disable"}
                        </ReadValue>
                      ) : (
                        <label className="flex h-8 items-center gap-2 text-sm">
                          <SwitchPrimitive.Root
                            checked={isEnabledStatus(form.status)}
                            onCheckedChange={(next) => set("status")(statusFromEnabled(next))}
                            className={cn(
                              "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
                            )}
                          >
                            <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
                          </SwitchPrimitive.Root>
                          <span>
                            {isEnabledStatus(form.status) ? "Enable" : "Disable"}
                          </span>
                        </label>
                      )}
                    </Field>

                    <Field label="Verified purchase">
                      {isView ? (
                        <ReadValue>{form.isVerifiedPurchase ? "Yes" : "No"}</ReadValue>
                      ) : (
                        <label className="flex h-8 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={form.isVerifiedPurchase}
                            onChange={(e) => set("isVerifiedPurchase")(e.target.checked)}
                            className="h-3.5 w-3.5 rounded-none border border-input"
                          />
                          Verified
                        </label>
                      )}
                    </Field>
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
              {isView && canWrite && review && onEdit ? (
                <Button
                  size="sm"
                  className="rounded-none"
                  onClick={() => onEdit(review)}
                >
                  Edit
                </Button>
              ) : null}
              {!isView && canWrite ? (
                <Button
                  size="sm"
                  className="rounded-none"
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  {isCreate ? "Create" : "Save"}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="rounded-none"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <MediaLibraryModal
        open={mediaLibraryOpen}
        onOpenChange={(next) => {
          setMediaLibraryOpen(next);
          if (next) void refetchMedia();
        }}
        items={mediaItems}
        mode="multiple"
        title="Add review photos"
        accept={["image", "video"]}
        initialSelectedIds={reviewMedia.map((item) => item.id)}
        onSelect={(items) => {
          setReviewMedia((prev) => {
            const map = new Map(prev.map((item) => [item.id, item]));
            for (const item of items) map.set(item.id, item);
            return Array.from(map.values());
          });
        }}
        onUploadFiles={async (files) => {
          const uploaded = await uploadCatalogMediaFiles(files);
          await refetchMedia();
          return uploaded;
        }}
        onImportItems={async (items) => {
          const saved = await createCatalogMediaBatch(items);
          await refetchMedia();
          return saved;
        }}
      />
    </>
  );
}
