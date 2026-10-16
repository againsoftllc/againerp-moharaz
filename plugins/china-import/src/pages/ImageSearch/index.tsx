"use client";

import { useState } from "react";
import type { ElimPlatform, ElimProductListItem } from "../../types";
import { useImageSearch } from "../../hooks/use-products";
import { useChinaImportSettings } from "../../hooks/use-settings";
import {
  Card,
  Field,
  inputClassName,
  buttonClassName,
  ProductGrid,
  PaginationBar,
  SkeletonGrid,
  StateBlock,
} from "../../components";

export function ImageSearchPage({
  onOpenProduct,
}: {
  onOpenProduct: (product: ElimProductListItem, platform: ElimPlatform) => void;
}) {
  const { settings } = useChinaImportSettings();
  const { loading, error, data, imageId, searchByFile, searchByUrlOrId } = useImageSearch();
  const [platform, setPlatform] = useState<ElimPlatform>(settings.defaultPlatform);
  const [imgUrl, setImgUrl] = useState("");
  const [page, setPage] = useState(1);
  const size = 20;

  async function onFile(file: File | null) {
    if (!file) return;
    setPage(1);
    await searchByFile(file, { platform, page: 1, size });
  }

  async function onUrlSearch(nextPage = 1) {
    if (!imgUrl.trim()) return;
    setPage(nextPage);
    await searchByUrlOrId({
      imgUrl: imgUrl.trim(),
      platform,
      page: nextPage,
      size,
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Image Search</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload an image or paste a CDN URL. Matches are display-only.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <Field label="Upload image">
            <input
              className={inputClassName("pt-1.5")}
              type="file"
              accept="image/*"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Field label="Platform">
            <select
              className={inputClassName()}
              value={platform}
              onChange={(e) =>
                setPlatform(e.target.value === "alibaba" ? "alibaba" : "taobao")
              }
            >
              <option value="taobao">Taobao</option>
              <option value="alibaba">1688</option>
            </select>
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <Field label="Or image URL">
            <input
              className={inputClassName()}
              value={imgUrl}
              onChange={(e) => setImgUrl(e.target.value)}
              placeholder="https://img.alicdn.com/..."
            />
          </Field>
          <button
            type="button"
            className={buttonClassName("primary", "h-9")}
            disabled={loading || !imgUrl.trim()}
            onClick={() => void onUrlSearch(1)}
          >
            {loading ? "Searching…" : "Search by URL"}
          </button>
        </div>

        {imageId ? (
          <p className="text-[11px] text-muted-foreground">Last uploaded image id: {imageId}</p>
        ) : null}
      </Card>

      {loading ? <SkeletonGrid /> : null}
      {!loading && error ? (
        <StateBlock tone="error" title="Image search failed" description={error} />
      ) : null}
      {!loading && data && data.items.length === 0 ? (
        <StateBlock title="No matches" description="Try another image or platform." />
      ) : null}
      {!loading && data && data.items.length > 0 ? (
        <div className="space-y-3">
          <ProductGrid
            items={data.items}
            onOpen={(product) => onOpenProduct(product, platform)}
          />
          {imgUrl.trim() ? (
            <PaginationBar
              page={data.paginate?.current ?? page}
              size={data.paginate?.size ?? size}
              total={data.paginate?.total ?? data.items.length}
              onPageChange={(p) => void onUrlSearch(p)}
            />
          ) : null}
        </div>
      ) : null}
      {!loading && !error && !data ? (
        <StateBlock
          title="Find lookalikes"
          description="Upload a product photo to call Elim image search."
        />
      ) : null}
    </div>
  );
}
