"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { PackagePlus, X } from "lucide-react";
import { toast } from "sonner";
import type { Product, QuickAddProductInput } from "@/lib/mock-data/products";
import { useProductStore } from "@/lib/store/product-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";

const CATEGORIES = ["Apparel", "Electronics", "Home", "Beauty", "Sports", "Books"];
const BRANDS = ["UrbanWear", "TechPro", "HomeNest", "GlowUp", "ActiveLife", "ReadWell"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (product: Product) => void;
  initialValues?: Partial<QuickAddProductInput>;
};

export function AddProductDialog({ open, onOpenChange, onCreated, initialValues }: Props) {
  const addProduct = useProductStore((s) => s.addProduct);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [brand, setBrand] = useState(BRANDS[0]);
  const [stock, setStock] = useState("50");

  useEffect(() => {
    if (!open) return;
    setName(initialValues?.name ?? "");
    setSku(initialValues?.sku ?? "");
    setPrice(initialValues?.price != null ? String(initialValues.price) : "");
    setCategory(initialValues?.category ?? CATEGORIES[0]);
    setBrand(initialValues?.brand ?? BRANDS[0]);
    setStock(initialValues?.stock != null ? String(initialValues.stock) : "50");
  }, [open, initialValues]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Product name is required");
      return;
    }
    const priceNum = parseFloat(price);
    if (!price || Number.isNaN(priceNum) || priceNum <= 0) {
      toast.error("Valid price is required");
      return;
    }

    const product = addProduct({
      name,
      sku: sku.trim() || undefined,
      price: priceNum,
      category,
      brand,
      stock: parseInt(stock, 10) || 0,
    });

    toast.success(`${product.name} added`);
    onCreated?.(product);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,640px)] w-[min(96vw,480px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-input bg-background shadow-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-input px-4 py-3">
            <Dialog.Title className="text-base font-semibold">Add product</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="rounded-md p-1 hover:bg-accent" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <Field label="Product name *">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wireless Earbuds Pro" autoFocus />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="SKU">
                  <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Auto-generated if empty" />
                </Field>
                <Field label="Price (BDT) *">
                  <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="899" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Category">
                  <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Brand">
                  <Select value={brand} onChange={(e) => setBrand(e.target.value)}>
                    {BRANDS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Stock">
                <Input type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} />
              </Field>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-input px-4 py-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">
                <PackagePlus className="mr-1.5 h-3.5 w-3.5" />
                Add product
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
