"use client";

import Link from "next/link";
import { ArrowLeft, Camera, CheckCircle2, Edit2, ExternalLink, ImageIcon, Loader2, MessageSquare, Shield, Star, ThumbsDown, ThumbsUp, Video, XCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import { useReviewStore } from "@/lib/store/review-store";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { REVIEW_STATUS_LABELS, type Review, type ReviewStatus } from "@/lib/mock-data/reviews";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReviewAiPanel } from "@/components/reviews/review-ai-panel";
import { useState } from "react";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-input bg-card">
      <div className="flex items-center gap-2 border-b border-input px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={cn(cls, s <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted")} />
      ))}
    </div>
  );
}

function statusVariant(s: ReviewStatus): "success" | "warning" | "muted" | "outline" {
  if (s === "approved") return "success";
  if (s === "rejected" || s === "spam") return "warning";
  if (s === "pending") return "outline";
  return "muted";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function timelineIcon(type: string) {
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px]";
  if (type === "submitted") return <span className={`${base} bg-blue-100 dark:bg-blue-900/30`}>📝</span>;
  if (type === "ai_analyzed") return <span className={`${base} bg-violet-100 dark:bg-violet-900/30`}>🤖</span>;
  if (type === "approved") return <span className={`${base} bg-emerald-100 dark:bg-emerald-900/30`}>✅</span>;
  if (type === "rejected") return <span className={`${base} bg-red-100 dark:bg-red-900/30`}>❌</span>;
  if (type === "reported") return <span className={`${base} bg-orange-100 dark:bg-orange-900/30`}>🚩</span>;
  return <span className={`${base} bg-muted`}>📌</span>;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  reviewId: string;
  review?: Review | null;
  adminNotes?: string | null;
  loading?: boolean;
  error?: string | null;
  onStatusChange?: (id: string, status: ReviewStatus) => void | Promise<void>;
};

export function ReviewDetailWorkspace({
  reviewId,
  review: reviewProp,
  adminNotes,
  loading = false,
  error = null,
  onStatusChange,
}: Props) {
  const moduleBase = useCatalogModuleBasePath();

  const storeReview = useReviewStore((s) => s.getById(reviewId));
  const storeUpdateStatus = useReviewStore((s) => s.updateStatus);
  const addNote = useReviewStore((s) => s.addNote);
  const addTimelineEntry = useReviewStore((s) => s.addTimelineEntry);
  const review = reviewProp ?? storeReview;
  const canWrite = useAdminCanWrite();

  const [noteBody, setNoteBody] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const updateStatus = (id: string, status: ReviewStatus) => {
    if (onStatusChange) {
      void onStatusChange(id, status);
      return;
    }
    storeUpdateStatus(id, status);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed p-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="flex flex-col items-center justify-center p-16">
        <p className="text-sm text-muted-foreground">{error ?? "Review not found."}</p>
        <Link href={`${moduleBase}/reviews`} className="mt-2 text-xs text-primary hover:underline">← Reviews</Link>
      </div>
    );
  }

  const handleApprove = () => {
    updateStatus(review.id, "approved");
    if (!onStatusChange) toast.success("Review approved");
  };
  const handleReject = () => {
    updateStatus(review.id, "rejected");
    if (!onStatusChange) toast.success("Review rejected");
  };

  const handleAddNote = () => {
    if (!noteBody.trim()) return;
    addNote(review.id, { author: "Admin", authorInitials: "AD", body: noteBody.trim(), at: new Date().toISOString() });
    addTimelineEntry(review.id, { type: "note", title: "Internal note added", actor: "Admin", actorInitials: "AD", at: new Date().toISOString() });
    setNoteBody("");
    setNoteOpen(false);
    toast.success("Note added");
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`${moduleBase}/reviews`} className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> All Reviews
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold">{review.reviewId}</h1>
            <Badge variant={statusVariant(review.status)} className="capitalize">{REVIEW_STATUS_LABELS[review.status]}</Badge>
            {review.isVerifiedPurchase && <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"><Shield className="h-3 w-3" />Verified Purchase</span>}
            {review.type === "photo" && <span className="flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"><Camera className="h-3 w-3" />Photo Review</span>}
            {review.type === "video" && <span className="flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-semibold text-pink-700 dark:bg-pink-900/30 dark:text-pink-400"><Video className="h-3 w-3" />Video Review</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{review.product.name} · {review.customer.name} · {formatDate(review.createdAt)}</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {review.status === "pending" && <>
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={handleApprove}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={handleReject}><XCircle className="h-3.5 w-3.5" /> Reject</Button>
            </>}
            {review.status !== "pending" && <Button size="sm" variant="outline" onClick={() => updateStatus(review.id, "pending")}><Edit2 className="mr-1 h-3.5 w-3.5" /> Reset to Pending</Button>}
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        {/* LEFT */}
        <div className="space-y-4">
          {/* Review content */}
          <SectionCard title="Review Content" icon={MessageSquare}>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Stars rating={review.rating} size="lg" />
                <span className="text-2xl font-bold">{review.rating}.0</span>
              </div>
              <h2 className="text-base font-semibold">{review.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{review.body}</p>
              {review.pros.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                    <p className="mb-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Pros</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">{review.pros.map((p, i) => <li key={i}>+ {p}</li>)}</ul>
                  </div>
                  {review.cons.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/20">
                      <p className="mb-1.5 text-xs font-semibold text-destructive">Cons</p>
                      <ul className="space-y-1 text-xs text-muted-foreground">{review.cons.map((c, i) => <li key={i}>− {c}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          {/* Category Ratings */}
          {review.categoryRatings.length > 0 && (
            <SectionCard title="Detailed Ratings" icon={Star}>
              <div className="grid gap-3 sm:grid-cols-2">
                {review.categoryRatings.map((cr) => (
                  <div key={cr.label} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">{cr.label}</span>
                    <div className="flex-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-yellow-400" style={{ width: `${(cr.score / 5) * 100}%` }} />
                      </div>
                    </div>
                    <span className="w-4 text-right text-xs font-semibold">{cr.score}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Media Gallery */}
          {review.media.length > 0 && (
            <SectionCard title="Media Gallery" icon={ImageIcon}>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {review.media.map((m, i) => (
                  <button key={m.id} type="button" onClick={() => setLightboxIndex(i)}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-input bg-muted hover:opacity-90 transition-opacity"
                  >
                    {m.type === "video" ? (
                      <div className="flex h-full items-center justify-center"><Video className="h-8 w-8 text-muted-foreground" /></div>
                    ) : (
                      <img src={m.url} alt={m.caption ?? ""} className="h-full w-full object-cover" />
                    )}
                    {m.caption && <div className="absolute inset-x-0 bottom-0 bg-black/50 p-1 text-[9px] text-white truncate">{m.caption}</div>}
                  </button>
                ))}
              </div>
              {lightboxIndex !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightboxIndex(null)}>
                  <div className="relative max-w-2xl w-full mx-4">
                    <img src={review.media[lightboxIndex].url} alt="" className="w-full rounded-lg" />
                    <p className="mt-2 text-center text-sm text-white">{review.media[lightboxIndex].caption}</p>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* Customer Info */}
          <SectionCard title="Customer Information" icon={Shield}>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              {[
                { label: "Customer", value: <Link href={`/customers/${review.customer.id}`} className="text-primary hover:underline flex items-center gap-1">{review.customer.name}<ExternalLink className="h-3 w-3" /></Link> },
                { label: "Group", value: <span className="capitalize">{review.customer.group}</span> },
                { label: "Total Orders", value: review.customer.totalOrders },
                { label: "Lifetime Value", value: `${formatCurrency(Math.round(review.customer.ltv / 1000))}K` },
                { label: "Trust Score", value: <span className={review.customer.trustScore >= 80 ? "text-emerald-600" : review.customer.trustScore >= 50 ? "text-yellow-600" : "text-destructive"}>{review.customer.trustScore}%</span> },
                { label: "Review Count", value: review.customer.reviewCount },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between rounded-lg border border-input px-3 py-2">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Product Info */}
          <SectionCard title="Product Information" icon={Star}>
            <div className="flex items-start gap-3">
              <img src={review.product.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover border border-input" />
              <div className="flex-1 space-y-1.5 text-xs">
                <p className="font-semibold">{review.product.name}</p>
                <p className="text-muted-foreground">SKU: {review.product.sku} · Brand: {review.product.brand}</p>
                <p className="text-muted-foreground">Category: {review.product.category}</p>
                <div className="flex items-center gap-2">
                  <Stars rating={Math.round(review.product.avgRating)} />
                  <span className="font-medium">{review.product.avgRating}</span>
                  <span className="text-muted-foreground">({review.product.totalReviews} reviews)</span>
                </div>
              </div>
            </div>
            {review.isVerifiedPurchase && (
              <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 px-3 py-2 text-xs">
                <p className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" />Verified Purchase</p>
                <p className="text-muted-foreground mt-0.5">Order {review.orderNumber} · Purchased {formatDate(review.purchaseDate)}</p>
              </div>
            )}
          </SectionCard>

          {/* Helpful votes */}
          <SectionCard title="Helpful Votes" icon={ThumbsUp}>
            <div className="flex gap-4">
              <div className="flex items-center gap-2 rounded-lg border border-input px-4 py-3">
                <ThumbsUp className="h-5 w-5 text-emerald-500" />
                <div><p className="text-xl font-bold text-emerald-600">{review.helpfulVotes}</p><p className="text-[11px] text-muted-foreground">Helpful</p></div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-input px-4 py-3">
                <ThumbsDown className="h-5 w-5 text-muted-foreground" />
                <div><p className="text-xl font-bold">{review.notHelpfulVotes}</p><p className="text-[11px] text-muted-foreground">Not helpful</p></div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-input px-4 py-3">
                <div><p className="text-xl font-bold">{review.helpfulVotes + review.notHelpfulVotes}</p><p className="text-[11px] text-muted-foreground">Total votes</p></div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          <ReviewAiPanel analysis={review.aiAnalysis} />

          {/* Moderation Timeline */}
          <div className="rounded-xl border border-input bg-card">
            <div className="flex items-center justify-between border-b border-input px-4 py-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" /> Moderation History
              </h3>
              <Button size="sm" variant={noteOpen ? "default" : "outline"} className="h-7 gap-1 text-[11px]" onClick={() => setNoteOpen(!noteOpen)}>
                + Note
              </Button>
            </div>

            {noteOpen && (
              <div className="border-b border-input bg-muted/20 p-3">
                <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={3} placeholder="Add internal note…" className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setNoteOpen(false); setNoteBody(""); }}>Cancel</Button>
                  <Button size="sm" className="h-7 text-xs" onClick={handleAddNote}>Add note</Button>
                </div>
              </div>
            )}

            <div className="max-h-[480px] overflow-y-auto p-4 space-y-4">
              {adminNotes && (
                <div className="rounded-lg border border-input bg-muted/30 px-3 py-2 text-xs">{adminNotes}</div>
              )}
              {/* Notes */}
              {review.notes.map((n) => (
                <div key={n.id} className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{n.authorInitials}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><span className="text-xs font-semibold">{n.author}</span><span className="rounded bg-yellow-100 px-1 py-0.5 text-[9px] text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Internal</span><span className="text-[10px] text-muted-foreground">{timeAgo(n.at)}</span></div>
                    <p className="mt-1 rounded-lg border border-input bg-muted/30 px-3 py-2 text-xs">{n.body}</p>
                  </div>
                </div>
              ))}

              {/* Timeline */}
              {review.timeline.map((e) => (
                <div key={e.id} className="flex items-start gap-3">
                  {timelineIcon(e.type)}
                  <div className="flex-1 pt-0.5">
                    <p className="text-xs font-medium">{e.title}</p>
                    {e.description && <p className="text-[11px] text-muted-foreground">{e.description}</p>}
                    <p className="text-[10px] text-muted-foreground">{e.actor} · {timeAgo(e.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
