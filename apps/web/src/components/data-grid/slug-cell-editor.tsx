"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ICellEditorParams } from "ag-grid-community";
import { SLUG_INPUT_INVALID_CLASS, validateSlug } from "@/lib/url-slug/validate-slug";
import { cn } from "@/lib/utils";

export const SlugCellEditor = forwardRef(function SlugCellEditor(
  props: ICellEditorParams,
  ref,
) {
  const [value, setValue] = useState(String(props.value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);
  const excludeId = props.data?.id as string | undefined;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useImperativeHandle(ref, () => ({
    getValue: () => value,
  }));

  const validation = validateSlug(value, excludeId ? { id: excludeId } : undefined);
  const invalid = !!value.trim() && !validation.isValid;

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className={cn(
        "h-full w-full border-0 bg-transparent px-2 text-xs outline-none ring-0",
        invalid && SLUG_INPUT_INVALID_CLASS,
      )}
      aria-invalid={invalid}
      title={invalid ? validation.message ?? undefined : undefined}
    />
  );
});

SlugCellEditor.displayName = "SlugCellEditor";
