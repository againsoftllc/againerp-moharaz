"use client";

import { Package } from "lucide-react";
import {
  BUNDLE_PRICING_LABELS,
  BUNDLE_STATUS_LABELS,
  bundleSavings,
  bundleSavingsPercent,
  formatBdt,
  type ProductBundle,
} from "@/lib/mock-data/bundles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle: ProductBundle | null;
  onEdit?: (bundle: ProductBundle) => void;
};

export function BundleViewDrawer({ open, onOpenChange, bundle, onEdit }: Props) {
  if (!bundle) return null;

  const savings = bundleSavings(bundle);
  const savingsPct = bundleSavingsPercent(bundle);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg"
        aria-describedby={undefined}
      >
        <p className="sr-only">Bundle details · {bundle.name}</p>
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-input px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">{bundle.name}</h2>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{bundle.sku}</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {bundle.thumbnail && (
              <img
                src={bundle.thumbnail}
                alt=""
                className="mb-4 h-40 w-full rounded-lg object-cover"
              />
            )}

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{BUNDLE_STATUS_LABELS[bundle.status]}</Badge>
              <Badge variant="secondary">{BUNDLE_PRICING_LABELS[bundle.pricingMode]}</Badge>
              <Badge variant="outline">{bundle.category}</Badge>
            </div>

            {bundle.description && (
              <p className="mt-3 text-sm text-muted-foreground">{bundle.description}</p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-input bg-muted/30 p-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Retail</p>
                <p className="text-sm font-medium line-through opacity-60">
                  {formatBdt(bundle.retailTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bundle price</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatBdt(bundle.bundlePrice)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">You save</p>
                <p className="text-sm font-medium text-emerald-600">
                  {formatBdt(savings)} ({savingsPct}%)
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Available stock</span>
              <span className={bundle.stock === 0 ? "text-destructive" : "font-medium"}>
                {bundle.stock} bundles
              </span>
            </div>

            <h3 className="mt-6 text-sm font-semibold">Components ({bundle.componentCount})</h3>
            <p className="text-xs text-muted-foreground">
              Inventory decrements all required components on sale
            </p>

            <ul className="mt-3 space-y-2">
              {bundle.components.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-input bg-card p-2.5"
                >
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="" className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.sku} · Qty {item.quantity}
                      {item.isOptional && (
                        <span className="ml-1 text-amber-600">· Optional</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium">{formatBdt(item.unitPrice * item.quantity)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBdt(item.unitPrice)} each
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {onEdit && (
            <div className="shrink-0 border-t border-input px-5 py-4">
              <Button className="w-full" onClick={() => onEdit(bundle)}>
                Edit bundle
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
