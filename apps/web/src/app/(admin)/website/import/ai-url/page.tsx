"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import {
  createProductFromDraft,
  extractProductFromUrl,
  fetchSimpleCategories,
  type CatalogAiExtractResponse,
  type ProductDraft,
  type SimpleCategory,
} from "@/lib/api/catalog-ai-import";

export default function AiUrlImportPage() {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [extracting, setExtracting] = React.useState(false);
  const [result, setResult] = React.useState<CatalogAiExtractResponse | null>(null);
  const [draft, setDraft] = React.useState<ProductDraft | null>(null);
  const [categoryId, setCategoryId] = React.useState<string>("");
  const [categories, setCategories] = React.useState<SimpleCategory[]>([]);
  const [creating, setCreating] = React.useState(false);
  const [status, setStatus] = React.useState<"draft" | "published">("draft");

  React.useEffect(() => {
    void fetchSimpleCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  async function handleExtract() {
    if (!url.trim()) {
      toast.error("Enter a product URL");
      return;
    }
    setExtracting(true);
    setResult(null);
    setDraft(null);
    try {
      const res = await extractProductFromUrl(url.trim());
      setResult(res);
      setDraft(res.draft);
      setCategoryId(res.matched_category_id ?? "");
      toast.success("Draft extracted — review before creating");
    } catch (err) {
      if (err instanceof ApiError && err.status === 501) {
        toast.error("AI import isn't configured yet — an Anthropic API key is needed on the server.");
      } else {
        toast.error(err instanceof Error ? err.message : "Extraction failed");
      }
    } finally {
      setExtracting(false);
    }
  }

  function updateDraft<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function removeImage(idx: number) {
    setDraft((d) => (d ? { ...d, images: d.images.filter((_, i) => i !== idx) } : d));
  }

  async function handleCreate() {
    if (!draft) return;
    setCreating(true);
    try {
      const created = await createProductFromDraft({
        draft,
        brand_id: result?.matched_brand_id ?? undefined,
        category_id: categoryId || undefined,
        create_brand_if_missing: true,
        import_images: true,
        status,
      });
      toast.success(`Product "${created.name}" created`);
      router.push(`/website/products/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-5 w-5 text-primary" /> Import Product with AI
        </h1>
        <p className="text-sm text-muted-foreground">
          Paste any product page URL — AI scrapes and maps it to a draft you review before it&apos;s created.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/product/..."
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleExtract();
          }}
        />
        <Button onClick={() => void handleExtract()} disabled={extracting}>
          {extracting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
          Extract
        </Button>
      </div>

      {result && result.warnings.length > 0 && (
        <div className="space-y-1 border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          {result.warnings.map((w, i) => (
            <div key={i}>• {w}</div>
          ))}
        </div>
      )}

      {draft && (
        <div className="space-y-4 border border-input p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={draft.name} onChange={(e) => updateDraft("name", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="sku">SKU (auto if blank)</Label>
              <Input id="sku" value={draft.sku ?? ""} onChange={(e) => updateDraft("sku", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                value={draft.price ?? ""}
                onChange={(e) => updateDraft("price", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="brand">
                Brand {result?.matched_brand_id ? <Badge variant="success">matched</Badge> : <Badge variant="warning">will create</Badge>}
              </Label>
              <Input id="brand" value={draft.brand_name ?? ""} onChange={(e) => updateDraft("brand_name", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— none —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="short_description">Short description</Label>
            <Textarea
              id="short_description"
              rows={2}
              value={draft.short_description ?? ""}
              onChange={(e) => updateDraft("short_description", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={4}
              value={draft.description ?? ""}
              onChange={(e) => updateDraft("description", e.target.value)}
            />
          </div>

          {draft.specifications.length > 0 && (
            <div>
              <Label>Specifications</Label>
              <div className="mt-1 space-y-2 text-xs">
                {draft.specifications.map((g, gi) => (
                  <div key={gi} className="border border-input p-2">
                    <div className="font-semibold">{g.group}</div>
                    {g.items.map((it, ii) => (
                      <div key={ii} className="flex justify-between text-muted-foreground">
                        <span>{it.label}</span>
                        <span>{it.value}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {draft.images.length > 0 && (
            <div>
              <Label>Images ({draft.images.length})</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {draft.images.map((src, idx) => (
                  <div key={idx} className="group relative h-20 w-20 border border-input">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute right-0 top-0 hidden bg-background/90 p-0.5 group-hover:block"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-4">
            <Select value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published")} className="max-w-[160px]">
              <option value="draft">Create as Draft</option>
              <option value="published">Create as Published</option>
            </Select>
            <div className="flex gap-2">
              <Link href="/website/import">
                <Button variant="outline">Cancel</Button>
              </Link>
              <Button onClick={() => void handleCreate()} disabled={creating}>
                {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Create Product
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
