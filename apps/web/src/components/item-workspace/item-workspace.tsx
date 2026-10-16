"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@/lib/mock-data/products";
import type { ProductDetail } from "@/lib/api/catalog-products";
import { ProductDetailContent } from "@/components/products/product-detail-content";
import { ProductMediaGallery } from "@/components/products/product-media-gallery";
import { ProductSupplierSourcing } from "@/components/products/product-supplier-sourcing";
import { ItemWorkspaceSidebar } from "@/components/item-workspace/item-workspace-sidebar";
import { MentionCommentComposer } from "@/components/activity/mention-comment-composer";
import { CommentBody } from "@/components/activity/comment-body";
import { ActivityAvatar } from "@/components/activity/activity-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  addCollabLabel,
  COLLAB_ACTION_LABELS,
  COLLAB_ENTITY_ITEM,
  createCollabComment,
  createCollabFile,
  removeCollabLabel,
  updateCollabApproval,
  type CollabActivity,
  type CollabAiNote,
  type CollabComment,
  type CollabFile,
} from "@/lib/api/collaboration";
import { EcommercePublishPanel } from "@/components/item-workspace/ecommerce-publish-panel";
import { fetchEcommerceItem, type ApiEcommerceItem } from "@/lib/api/ecommerce-items";
import { fetchItemStockLevels, type ApiStockLevel } from "@/lib/api/inventory";
import { useItemWorkspace } from "@/lib/hooks/use-item-workspace";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useMentionableUsers } from "@/lib/api/use-mentionable-users";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { resolveMentionedUserIds } from "@/lib/activity/mentions";
import { cn, formatCurrency, formatTimeAgo } from "@/lib/utils";

const WORKSPACE_TABS = [
  "Overview",
  "Inventory",
  "Ecommerce",
  "Pricing",
  "Suppliers",
  "Media",
  "Files",
  "Activity",
  "Comments",
  "AI Insights",
] as const;

type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

type Props = {
  product: ProductDetail;
  onBack?: () => void;
  onEdit?: () => void;
};

function ActivityTimelineItem({ entry }: { entry: CollabActivity }) {
  return (
    <div className="flex gap-2.5 border-b border-border/60 py-3 last:border-0">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-bold">
        {(COLLAB_ACTION_LABELS[entry.action] ?? entry.action)[0]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">
          {COLLAB_ACTION_LABELS[entry.action] ?? entry.action}
        </p>
        {(entry.old_value || entry.new_value) && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {entry.old_value ? <span className="line-through">{entry.old_value}</span> : null}
            {entry.old_value && entry.new_value ? " → " : null}
            {entry.new_value ? <span className="font-medium text-foreground">{entry.new_value}</span> : null}
          </p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">
          {entry.performed_by ? `User ${entry.performed_by.slice(0, 8)}…` : "System"} ·{" "}
          {formatTimeAgo(entry.created_at)}
        </p>
      </div>
    </div>
  );
}

function CommentRow({ comment }: { comment: CollabComment }) {
  const isAi = comment.author_type === "ai";
  return (
    <div className="flex gap-2 border-b border-border/60 py-3 last:border-0">
      <ActivityAvatar
        initials={isAi ? "AI" : "U"}
        name={isAi ? "AI Assistant" : "User"}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-xs font-semibold">{isAi ? "AI Note" : "Team member"}</p>
          <Badge variant="outline" className="px-1 py-0 text-[8px] capitalize">
            {comment.visibility}
          </Badge>
        </div>
        <CommentBody body={comment.comment} className="mt-1" />
        <p className="mt-1 text-[10px] text-muted-foreground">{formatTimeAgo(comment.created_at)}</p>
      </div>
    </div>
  );
}

function FilesPanel({
  files,
  canWrite,
  onAdd,
}: {
  files: CollabFile[];
  canWrite: boolean;
  onAdd: () => void;
}) {
  const grouped = useMemo(() => {
    const map: Record<string, CollabFile[]> = { image: [], document: [], certificate: [], other: [] };
    for (const f of files) {
      const key = f.file_type in map ? f.file_type : "other";
      map[key].push(f);
    }
    return map;
  }, [files]);

  const sections = [
    { key: "image", title: "Images" },
    { key: "document", title: "Documents" },
    { key: "certificate", title: "Certificates" },
    { key: "other", title: "Other" },
  ] as const;

  return (
    <div className="space-y-4">
      {canWrite ? (
        <Button variant="outline" size="sm" onClick={onAdd}>
          Register file reference
        </Button>
      ) : null}
      {sections.map(({ key, title }) =>
        grouped[key].length ? (
          <section key={key} className="rounded-lg border border-input p-4">
            <h3 className="text-sm font-medium">{title}</h3>
            <ul className="mt-2 space-y-2">
              {grouped[key].map((file) => (
                <li key={file.id} className="flex items-center justify-between text-xs">
                  <span className="font-medium">{file.filename}</span>
                  <span className="text-muted-foreground">{formatTimeAgo(file.created_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
      {!files.length ? (
        <p className="text-sm text-muted-foreground">No files attached yet.</p>
      ) : null}
    </div>
  );
}

function AiInsightsPanel({ notes }: { notes: CollabAiNote[] }) {
  if (!notes.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-input py-12 text-center">
        <Sparkles className="mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">No AI insights yet</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          SEO suggestions, attribute analysis, and QC notes will appear here when AI agents run on this item.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <div key={note.id} className="rounded-lg border border-purple-200/60 bg-purple-50/30 p-4 dark:border-purple-900/40 dark:bg-purple-950/20">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <p className="text-sm font-semibold">{note.title ?? note.note_type}</p>
            <Badge variant="outline" className="ml-auto text-[10px] capitalize">
              {note.status}
            </Badge>
          </div>
          {note.content.summary ? (
            <p className="mt-2 text-xs text-muted-foreground">{String(note.content.summary)}</p>
          ) : null}
          <p className="mt-2 text-[10px] text-muted-foreground">{formatTimeAgo(note.created_at)}</p>
        </div>
      ))}
    </div>
  );
}

export function ItemWorkspace({ product, onBack, onEdit }: Props) {
  const itemId = product.itemId ?? product.id;
  const canWrite = useAdminCanWrite();
  const auth = useAdminAuth();
  const mentionUsers = useMentionableUsers();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("Overview");
  const [commentDraft, setCommentDraft] = useState("");
  const [inventory, setInventory] = useState<ApiStockLevel[] | null>(null);
  const [ecommerce, setEcommerce] = useState<ApiEcommerceItem | null>(null);
  const [moduleLoading, setModuleLoading] = useState(false);

  const {
    summary,
    activity,
    comments,
    files,
    aiNotes,
    loading: collabLoading,
    refetch,
    refetchComments,
    refetchActivity,
  } = useItemWorkspace(itemId);

  const loadModuleTab = async (tab: WorkspaceTab) => {
    if (tab === "Inventory" && !inventory) {
      setModuleLoading(true);
      try {
        setInventory(await fetchItemStockLevels(itemId));
      } catch {
        setInventory([]);
      } finally {
        setModuleLoading(false);
      }
    }
    if (tab === "Ecommerce" && !ecommerce) {
      setModuleLoading(true);
      try {
        setEcommerce(await fetchEcommerceItem(itemId));
      } catch {
        setEcommerce(null);
      } finally {
        setModuleLoading(false);
      }
    }
  };

  const handleTabChange = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    void loadModuleTab(tab);
  };

  const handleSubmitComment = async () => {
    const text = commentDraft.trim();
    if (!text) return;
    try {
      const mentions = resolveMentionedUserIds(text, mentionUsers);
      await createCollabComment(COLLAB_ENTITY_ITEM, itemId, {
        comment: text,
        visibility: "internal",
        mentions,
      });
      setCommentDraft("");
      await refetchComments();
      toast.success("Comment added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add comment");
    }
  };

  const handleLabelToggle = async (label: string, active: boolean) => {
    try {
      if (active) {
        await addCollabLabel(COLLAB_ENTITY_ITEM, itemId, label);
      } else {
        await removeCollabLabel(COLLAB_ENTITY_ITEM, itemId, label);
      }
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Label update failed");
    }
  };

  const handleApprovalChange = async (status: string) => {
    try {
      await updateCollabApproval(COLLAB_ENTITY_ITEM, itemId, status);
      await refetch();
      await refetchActivity();
      toast.success("Approval status updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval update failed");
    }
  };

  const handleAddFile = async () => {
    const filename = window.prompt("File name");
    const storageRef = window.prompt("Storage URL or path");
    if (!filename?.trim() || !storageRef?.trim()) return;
    const fileType = window.prompt("Type: image | document | certificate", "document") ?? "document";
    try {
      await createCollabFile(COLLAB_ENTITY_ITEM, itemId, {
        filename: filename.trim(),
        storage_ref: storageRef.trim(),
        file_type: fileType.trim(),
      });
      await refetch();
      toast.success("File registered");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add file");
    }
  };

  const mediaLinks = (product as Product & { mediaLinks?: { media_id: string; url: string; media_type: string; is_primary: boolean; sort_order: number }[] }).mediaLinks ?? [];
  const galleryMedia = mediaLinks
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => ({
      id: m.media_id,
      type: (m.media_type === "video" ? "video" : "image") as "video" | "image",
      url: m.url,
      isPrimary: m.is_primary,
      variantId: "default",
    }));

  const tabPanel = (() => {
    switch (activeTab) {
      case "Overview":
        return (
          <ProductDetailContent
            product={product}
            simpleCatalog
            embedded
            onEdit={onEdit ? () => onEdit() : undefined}
          />
        );
      case "Inventory":
        if (moduleLoading) return <p className="text-sm text-muted-foreground">Loading inventory…</p>;
        if (!inventory?.length) {
          return <p className="text-sm text-muted-foreground">No stock levels recorded for this item.</p>;
        }
        return (
          <div className="overflow-hidden rounded-lg border border-input">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Warehouse</th>
                  <th className="px-3 py-2 font-medium">On hand</th>
                  <th className="px-3 py-2 font-medium">Available</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="px-3 py-2">{row.warehouse_name}</td>
                    <td className="px-3 py-2">{row.on_hand}</td>
                    <td className="px-3 py-2">{row.available}</td>
                    <td className="px-3 py-2 capitalize">{row.status.replace("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "Ecommerce":
        if (moduleLoading) return <p className="text-sm text-muted-foreground">Loading ecommerce…</p>;
        if (!ecommerce) {
          return (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Ecommerce extension not synced yet. Save the catalog product or sync from the
                Overview tab, then return here.
              </p>
              {canWrite ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setModuleLoading(true);
                    void fetchEcommerceItem(itemId)
                      .then(setEcommerce)
                      .catch(() => setEcommerce(null))
                      .finally(() => setModuleLoading(false));
                  }}
                >
                  Retry load
                </Button>
              ) : null}
            </div>
          );
        }
        return (
          <EcommercePublishPanel
            itemId={itemId}
            ecommerce={ecommerce}
            canWrite={canWrite}
            onUpdated={setEcommerce}
          />
        );
      case "Pricing":
        return (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-input p-4">
              <p className="text-xs text-muted-foreground">Selling price</p>
              <p className="mt-1 text-lg font-semibold">{formatCurrency(product.price)}</p>
            </div>
            <div className="rounded-lg border border-input p-4">
              <p className="text-xs text-muted-foreground">Compare at</p>
              <p className="mt-1 text-lg font-semibold">
                {product.compareAtPrice ? formatCurrency(product.compareAtPrice) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-input p-4">
              <p className="text-xs text-muted-foreground">Catalog status</p>
              <p className="mt-1 text-lg font-semibold capitalize">{product.status}</p>
            </div>
          </div>
        );
      case "Suppliers":
        return (
          <ProductSupplierSourcing
            productId={product.id}
            productName={product.name}
            productSku={product.sku}
            variantId="default"
          />
        );
      case "Media":
        return galleryMedia.length ? (
          <ProductMediaGallery media={galleryMedia} productName={product.name} />
        ) : (
          <p className="text-sm text-muted-foreground">No media linked to this product.</p>
        );
      case "Files":
        return <FilesPanel files={files} canWrite={canWrite} onAdd={() => void handleAddFile()} />;
      case "Activity":
        return activity.length ? (
          <div className="rounded-lg border border-input p-4">
            {activity.map((entry) => (
              <ActivityTimelineItem key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        );
      case "Comments":
        return (
          <div className="space-y-4">
            {canWrite ? (
              <MentionCommentComposer
                value={commentDraft}
                onChange={setCommentDraft}
                onSubmit={() => void handleSubmitComment()}
                placeholder="Add an internal note… Use @ to mention"
                users={mentionUsers}
                currentUserId={auth.user?.id}
                userName={auth.user?.name ?? "You"}
                userInitials={(auth.user?.name ?? "YO").slice(0, 2).toUpperCase()}
              />
            ) : null}
            <div className="rounded-lg border border-input p-4">
              {comments.length ? (
                comments.map((c) => <CommentRow key={c.id} comment={c} />)
              ) : (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              )}
            </div>
          </div>
        );
      case "AI Insights":
        return <AiInsightsPanel notes={aiNotes} />;
      default:
        return null;
    }
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-start gap-2">
        {onBack ? (
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="page-subtitle">AgainERP › Ecommerce › Catalog › Products</p>
          <h1 className="page-title">{product.name}</h1>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{product.sku}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {onEdit ? (
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          <Badge className="capitalize">{product.status}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-input pb-0">
        {WORKSPACE_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabChange(tab)}
            className={cn(
              "relative px-3 py-2 text-sm font-medium transition-colors",
              activeTab === tab
                ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab}
            {tab === "Comments" && summary?.comment_count ? (
              <span className="ml-1 text-[10px] text-muted-foreground">({summary.comment_count})</span>
            ) : null}
            {tab === "AI Insights" && summary?.pending_ai_notes ? (
              <span className="ml-1 rounded-full bg-purple-500/15 px-1.5 text-[10px] text-purple-600">
                {summary.pending_ai_notes}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">{tabPanel}</div>
        <ItemWorkspaceSidebar
          productStatus={product.status}
          productUpdatedAt={product.updatedAt}
          summary={summary}
          loading={collabLoading}
          canWrite={canWrite}
          onApprovalChange={canWrite ? (s) => void handleApprovalChange(s) : undefined}
          onLabelToggle={canWrite ? (l, a) => void handleLabelToggle(l, a) : undefined}
        />
      </div>
    </div>
  );
}
