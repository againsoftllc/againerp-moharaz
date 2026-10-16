"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Truck } from "lucide-react";
import { toast } from "sonner";
import { demoVariants } from "@/lib/mock-data/products";
import {
  resolveSupplierStockStatus,
  SUPPLIER_STOCK_STATUS_LABELS,
  type SupplierStockStatus,
  VENDOR_WARRANTY_OPTIONS,
} from "@/lib/mock-data/vendor-product-mapping";
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import { mapSupplierToItem } from "@/lib/api/supplier-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  productSku: string;
  defaultVariantId?: string | null;
  existingSupplierIds?: string[];
  onMapped?: () => void;
};

export function MapSupplierSheet({
  open,
  onOpenChange,
  productId,
  productName,
  productSku,
  defaultVariantId,
  existingSupplierIds = [],
  onMapped,
}: Props) {
  const { suppliers } = useCommerceSuppliers();

  const [supplierId, setSupplierId] = useState("");
  const [variantId, setVariantId] = useState(defaultVariantId ?? demoVariants[0]?.id ?? "v1");
  const [vendorSku, setVendorSku] = useState("");
  const [vendorPrice, setVendorPrice] = useState("");
  const [supplierStock, setSupplierStock] = useState("");
  const [stockStatus, setStockStatus] = useState<SupplierStockStatus>("unknown");
  const [warranty, setWarranty] = useState<string>(VENDOR_WARRANTY_OPTIONS[3]);
  const [leadTimeDays, setLeadTimeDays] = useState("7");
  const [minOrderQty, setMinOrderQty] = useState("1");
  const [isPreferred, setIsPreferred] = useState(false);
  const [isPublishedOnWeb, setIsPublishedOnWeb] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);

  const availableSuppliers = useMemo(() => {
    return suppliers.filter(
      (s) => s.status !== "inactive" && !existingSupplierIds.includes(s.id),
    );
  }, [suppliers, existingSupplierIds]);

  const isFirstMapping = existingSupplierIds.length === 0;

  useEffect(() => {
    if (!open) return;
    setVariantId(defaultVariantId ?? demoVariants[0]?.id ?? "v1");
    setIsPreferred(isFirstMapping);
    setIsPublishedOnWeb(false);
  }, [open, defaultVariantId, isFirstMapping]);

  useEffect(() => {
    if (selectedSupplier) {
      setLeadTimeDays(String(selectedSupplier.leadTimeDays));
    }
  }, [selectedSupplier]);

  useEffect(() => {
    if (supplierId && !availableSuppliers.some((s) => s.id === supplierId)) {
      setSupplierId("");
    }
  }, [availableSuppliers, supplierId]);

  useEffect(() => {
    if (supplierStock === "") {
      setStockStatus("unknown");
      return;
    }
    setStockStatus(resolveSupplierStockStatus(Number(supplierStock) || 0));
  }, [supplierStock]);

  const resetForm = () => {
    setSupplierId("");
    setVendorSku("");
    setVendorPrice("");
    setSupplierStock("");
    setStockStatus("unknown");
    setWarranty(VENDOR_WARRANTY_OPTIONS[3]);
    setLeadTimeDays("7");
    setMinOrderQty("1");
    setIsPreferred(isFirstMapping);
    setIsPublishedOnWeb(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      toast.error("Select a supplier");
      return;
    }
    if (!vendorSku.trim()) {
      toast.error("Enter vendor SKU");
      return;
    }
    const price = Number(vendorPrice);
    if (!price || price <= 0) {
      toast.error("Enter a valid cost");
      return;
    }

    setSubmitting(true);
    try {
      await mapSupplierToItem({
        item_id: productId,
        supplier_id: supplierId,
        supplier_sku: vendorSku.trim(),
        supplier_title: productName,
        supplier_price: price,
        supplier_stock: Number(supplierStock) || 0,
        stock_status: stockStatus,
        lead_time_days: Number(leadTimeDays) || 7,
        min_order_qty: Number(minOrderQty) || 1,
        warranty,
        is_preferred: isPreferred,
        is_published: isPublishedOnWeb,
        api_source: "manual",
      });
      toast.success("Supplier mapped — synced to supplier catalog");
      onMapped?.();
      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to map supplier");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-0">
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <div className="border-b border-input px-6 py-4">
            <div className="flex items-center gap-2 pr-8">
              <Link2 className="h-4 w-4 text-primary" />
              <div>
                <h2 className="text-sm font-semibold">Map supplier</h2>
                <p className="text-[11px] text-muted-foreground">
                  Link this product to a supplier&apos;s catalog item
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-xs">
            <div className="rounded-lg border border-input bg-muted/30 p-3">
              <p className="font-medium">{productName}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{productSku}</p>
            </div>

            <div className="space-y-3 rounded-lg border border-dashed border-input p-3 text-[11px] text-muted-foreground">
              <p className="font-medium text-foreground">How it works</p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>Select vendor and enter their SKU, cost, and stock.</li>
                <li>Same product can map to multiple suppliers — each with own price.</li>
                <li>Mapping syncs to supplier catalog and this product drawer.</li>
                <li>
                  <span className="font-medium">Publish on website</span> is optional — not every
                  supplier offer goes live on storefront.
                </li>
              </ol>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="map-variant">Catalog variant</Label>
              <Select
                id="map-variant"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                className="h-8 w-full text-xs"
              >
                {demoVariants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} · {v.sku}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="map-supplier">Supplier</Label>
              {availableSuppliers.length === 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  All active suppliers are already mapped for this product. Edit an existing
                  mapping in supplier catalog.
                </p>
              ) : (
                <Select
                  id="map-supplier"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="h-8 w-full text-xs"
                >
                  <option value="">Select supplier…</option>
                  {availableSuppliers.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.status === "blocked"}>
                      {s.name}
                      {s.status === "blocked" ? " (blocked)" : ""}
                      {s.status === "preferred" ? " ★" : ""}
                    </option>
                  ))}
                </Select>
              )}
              {selectedSupplier && (
                <p className="text-[10px] text-muted-foreground">
                  Default lead time: {selectedSupplier.leadTimeDays} days · Terms:{" "}
                  {selectedSupplier.paymentTerms}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="map-vendor-sku">Vendor SKU</Label>
                <Input
                  id="map-vendor-sku"
                  value={vendorSku}
                  onChange={(e) => setVendorSku(e.target.value)}
                  placeholder="e.g. TP-WE-PRO"
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="map-cost">Cost (৳)</Label>
                <Input
                  id="map-cost"
                  type="number"
                  min={1}
                  value={vendorPrice}
                  onChange={(e) => setVendorPrice(e.target.value)}
                  placeholder="1850"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="map-stock">Supplier stock</Label>
                <Input
                  id="map-stock"
                  type="number"
                  min={0}
                  value={supplierStock}
                  onChange={(e) => setSupplierStock(e.target.value)}
                  placeholder="420"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="map-stock-status">Stock status</Label>
                <Select
                  id="map-stock-status"
                  value={stockStatus}
                  onChange={(e) => setStockStatus(e.target.value as SupplierStockStatus)}
                  className="h-8 w-full text-xs"
                >
                  {(Object.keys(SUPPLIER_STOCK_STATUS_LABELS) as SupplierStockStatus[]).map(
                    (key) => (
                      <option key={key} value={key}>
                        {SUPPLIER_STOCK_STATUS_LABELS[key]}
                      </option>
                    ),
                  )}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="map-warranty">Warranty</Label>
                <Select
                  id="map-warranty"
                  value={warranty}
                  onChange={(e) => setWarranty(e.target.value)}
                  className="h-8 w-full text-xs"
                >
                  {VENDOR_WARRANTY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="map-lead">Lead time (days)</Label>
                <Input
                  id="map-lead"
                  type="number"
                  min={1}
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="map-moq">MOQ</Label>
                <Input
                  id="map-moq"
                  type="number"
                  min={1}
                  value={minOrderQty}
                  onChange={(e) => setMinOrderQty(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-input p-3">
              <label className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Preferred supplier</p>
                  <p className="text-[10px] text-muted-foreground">Default for new POs</p>
                </div>
                <Switch checked={isPreferred} onCheckedChange={setIsPreferred} />
              </label>
              <label className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Publish on website</p>
                  <p className="text-[10px] text-muted-foreground">
                    Show this supplier offer on storefront
                  </p>
                </div>
                <Switch checked={isPublishedOnWeb} onCheckedChange={setIsPublishedOnWeb} />
              </label>
            </div>
          </div>

          <div className="flex gap-2 border-t border-input px-6 py-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 gap-1.5 text-xs"
              disabled={availableSuppliers.length === 0 || submitting}
            >
              <Truck className="h-3.5 w-3.5" />
              {submitting ? "Saving…" : "Save mapping"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
