"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Product } from "@/lib/mock-data/products";
import {
  ProductForm,
  PRODUCT_FORM_DEFAULT_VALUES,
  type ProductFormValues,
} from "@/components/products/product-form";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { clearDraft, draftAgeLabel, readDraft, writeDraft } from "@/lib/hooks/use-drawer-draft";

const DRAFT_KEY = "product";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  product?: Product | null;
  productName?: string;
  /** Bump z-index when opened over another sheet (e.g. sales order drawer). */
  nested?: boolean;
  onSaved?: (product?: Product) => void;
};

export function ProductFormDialog({
  open,
  onOpenChange,
  mode = "create",
  product,
  productName,
  nested = false,
  onSaved,
}: Props) {
  const initialProduct =
    product ?? (productName ? ({ name: productName } as Product) : undefined);

  // Local open state so overlay / Escape close immediately.
  const [sheetOpen, setSheetOpen] = useState(open);

  useEffect(() => {
    setSheetOpen(open);
  }, [open]);

  // Create mode only — restore an unsaved draft left behind by an accidental
  // outside-click/Escape (see docs/ERP-UI-COMMON.md #10).
  const draftOverride = useMemo(() => {
    if (!open || mode !== "create" || product || productName) return undefined;
    return readDraft<ProductFormValues>(DRAFT_KEY)?.values;
  }, [open, mode, product, productName]);

  const toastedDraftRef = useRef(false);
  useEffect(() => {
    if (!open) {
      toastedDraftRef.current = false;
      return;
    }
    if (draftOverride && !toastedDraftRef.current) {
      toastedDraftRef.current = true;
      const draft = readDraft<ProductFormValues>(DRAFT_KEY);
      if (draft) {
        toast.info(`Restored unsaved product draft from ${draftAgeLabel(draft.savedAt)}`, {
          action: { label: "Discard", onClick: () => clearDraft(DRAFT_KEY) },
        });
      }
    }
  }, [open, draftOverride]);

  const latestValuesRef = useRef<ProductFormValues | null>(null);
  const saveDraftIfDirty = () => {
    if (mode !== "create") return;
    const v = latestValuesRef.current;
    if (!v) return;
    // the status can be preset from Website settings — that alone isn't an edit worth a draft
    if (JSON.stringify({ ...v, status: PRODUCT_FORM_DEFAULT_VALUES.status }) === JSON.stringify(PRODUCT_FORM_DEFAULT_VALUES)) return;
    writeDraft<ProductFormValues>(DRAFT_KEY, v);
  };

  return (
    <Sheet
      open={sheetOpen}
      onOpenChange={(next) => {
        setSheetOpen(next);
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="right"
        title={
          mode === "create"
            ? "Add product"
            : `Edit product${initialProduct?.name ? `: ${initialProduct.name}` : ""}`
        }
        resizable
        resizeMaxWidth={1100}
        closeButton="inside"
        onPointerDownOutside={() => saveDraftIfDirty()}
        onInteractOutside={() => saveDraftIfDirty()}
        onEscapeKeyDown={() => saveDraftIfDirty()}
        className={
          nested
            ? "z-[260] w-[min(100%,48rem)] min-w-[320px] max-w-[1100px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
            : "w-[min(100%,48rem)] min-w-[320px] max-w-[1100px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
        }
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-3">
          <ProductForm
            mode={mode}
            initialProduct={initialProduct}
            initialValuesOverride={draftOverride}
            onValuesChange={(v) => {
              latestValuesRef.current = v;
            }}
            compact
            inDialog
            onClose={() => {
              setSheetOpen(false);
              onOpenChange(false);
            }}
            onSaved={(product) => {
              clearDraft(DRAFT_KEY);
              onSaved?.(product);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
