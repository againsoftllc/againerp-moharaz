"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import type { ICellEditorParams } from "ag-grid-community";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import type { Category } from "@/lib/mock-data/categories";
import type { Product } from "@/lib/mock-data/products";

type Params = ICellEditorParams<Product> & { categories: Category[] };

/**
 * Live edit of the Category cell: the product form's category picker as the cell editor - the category TREE (expand / collapse, search,
 * check boxes, several at once), the picked ones scrolled into view. It opens as a popup under the cell; click away (or Done / Enter)
 * saves, Esc cancels. The value handed back is the list of picked category ids (first = primary); the column's valueSetter stores it.
 */
export const CategoryCellEditor = forwardRef(function CategoryCellEditor(props: Params, ref) {
  const categories = props.categories ?? [];
  const [ids, setIds] = useState<string[]>(() => {
    const fromIds = (props.data?.categoryIds ?? []).filter(Boolean);
    if (fromIds.length) return fromIds;
    const byName = categories.find((c) => c.name === props.data?.category);
    return byName ? [byName.id] : [];
  });

  useImperativeHandle(ref, () => ({
    getValue: () => ids,
    isPopup: () => true,
  }));

  return (
    <div className="w-[300px] border border-border bg-popover p-1.5 text-popover-foreground shadow-md" onKeyDown={(e) => e.stopPropagation()}>
      <CategoryCombobox multiple inline autoOpen categories={categories} values={ids} onChange={setIds} placeholder="Select categories" />
      <div className="mt-1.5 flex justify-end">
        <button
          type="button"
          className="h-6 rounded-none border border-input bg-muted/50 px-3 text-[11px] hover:bg-muted"
          onClick={() => props.stopEditing()}
        >
          Done
        </button>
      </div>
    </div>
  );
});

CategoryCellEditor.displayName = "CategoryCellEditor";
