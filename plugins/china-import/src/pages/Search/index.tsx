"use client";

import { useState } from "react";
import type { ElimPlatform, ElimProductListItem, ElimProductSort } from "../../types";
import { useProductSearch } from "../../hooks/use-products";
import { useChinaImportSettings } from "../../hooks/use-settings";
import {
  ProductGrid,
  PaginationBar,
  SkeletonGrid,
  StateBlock,
  Field,
  inputClassName,
  buttonClassName,
  Card,
} from "../../components";

export function SearchPage({
  onOpenProduct,
}: {
  onOpenProduct: (product: ElimProductListItem, platform: ElimPlatform) => void;
}) {
  const { settings } = useChinaImportSettings();
  const { loading, error, data, search } = useProductSearch();
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState<ElimPlatform>(settings.defaultPlatform);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ElimProductSort | "">("");
  const size = 20;

  async function runSearch(nextPage = 1) {
    if (!q.trim()) return;
    setPage(nextPage);
    await search({
      q: q.trim(),
      platform,
      page: nextPage,
      size,
      sort: sort || undefined,
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_160px_160px_auto] md:items-end">
          <Field label="Keyword">
            <input
              className={inputClassName()}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Elim products…"
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch(1);
              }}
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
          <Field label="Sort">
            <select
              className={inputClassName()}
              value={sort}
              onChange={(e) => setSort(e.target.value as ElimProductSort | "")}
            >
              <option value="">Default</option>
              <option value="PRICE_ASC">Price ↑</option>
              <option value="PRICE_DESC">Price ↓</option>
              <option value="SALE_QTY_DESC">Sales ↓</option>
              <option value="SALE_QTY_ASC">Sales ↑</option>
            </select>
          </Field>
          <button
            type="button"
            className={buttonClassName("primary", "h-9")}
            disabled={loading || !q.trim()}
            onClick={() => void runSearch(1)}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Browse only — this screen does not import products into the ERP.
        </p>
      </Card>

      {loading ? <SkeletonGrid /> : null}
      {!loading && error ? (
        <StateBlock tone="error" title="Search failed" description={error} />
      ) : null}
      {!loading && !error && data && data.items.length === 0 ? (
        <StateBlock title="No products found" description="Try another keyword or platform." />
      ) : null}
      {!loading && data && data.items.length > 0 ? (
        <div className="space-y-3">
          <ProductGrid
            items={data.items}
            onOpen={(product) => onOpenProduct(product, platform)}
          />
          <PaginationBar
            page={data.paginate?.current ?? page}
            size={data.paginate?.size ?? size}
            total={data.paginate?.total ?? data.items.length}
            onPageChange={(p) => void runSearch(p)}
          />
        </div>
      ) : null}
      {!loading && !error && !data ? (
        <StateBlock
          title="Search China suppliers"
          description="Enter a keyword to list Elim products with image, price, currency, supplier, and ID."
        />
      ) : null}
    </div>
  );
}
