"use client";

import type { ElimProductListItem } from "../types";
import { formatMoney } from "../utils";
import { Card } from "./ui";

export function ProductCard({
  product,
  onOpen,
}: {
  product: ElimProductListItem;
  onOpen: (product: ElimProductListItem) => void;
}) {
  const currency = typeof product.currency === "string" ? product.currency : "CNY";
  const supplier =
    product.shop_name ||
    (typeof product.seller_type === "string" ? product.seller_type : undefined) ||
    "—";

  return (
    <button
      type="button"
      onClick={() => onOpen(product)}
      className="group text-left transition-transform hover:-translate-y-0.5"
    >
      <Card className="overflow-hidden h-full">
        <div className="aspect-square overflow-hidden bg-muted">
          {product.img_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.img_url}
              alt={product.title}
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No image
            </div>
          )}
        </div>
        <div className="space-y-1.5 p-3">
          <p className="line-clamp-2 text-sm font-medium text-foreground">{product.title}</p>
          <p className="text-sm font-semibold text-foreground">
            {formatMoney(product.promotion_price ?? product.price, currency)}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>ID {product.id}</span>
            <span>{supplier}</span>
            {currency ? <span>{currency}</span> : null}
          </div>
        </div>
      </Card>
    </button>
  );
}

export function ProductGrid({
  items,
  onOpen,
}: {
  items: ElimProductListItem[];
  onOpen: (product: ElimProductListItem) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <ProductCard key={String(item.id)} product={item} onOpen={onOpen} />
      ))}
    </div>
  );
}

export function PaginationBar({
  page,
  size,
  total,
  onPageChange,
}: {
  page: number;
  size: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        Page {page} / {totalPages} · {total.toLocaleString()} results
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-md border border-input bg-background px-3 py-1.5 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-md border border-input bg-background px-3 py-1.5 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
