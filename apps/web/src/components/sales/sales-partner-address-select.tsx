"use client";

import { useMemo } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  AgainFormRow,
  AgainUnderlineField,
} from "@/components/again/again-form-sheet";
import { SearchDropdown } from "@/components/again/again-search-dropdown";
import {
  filterAddressOptions,
  type SalesAddressOption,
} from "@/lib/sales/sales-partner-address";
import { PartnerAddressBlock } from "@/components/sales/sales-partner-address-block";

type Props = {
  label: string;
  help?: string;
  readOnly?: boolean;
  disabled?: boolean;
  selectedId: string;
  options: SalesAddressOption[];
  open: boolean;
  query: string;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelect: (option: SalesAddressOption) => void;
  onClear: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  portalHost: HTMLElement | null;
  addressPreview?: SalesAddressOption["address"] | null;
};

export function SalesPartnerAddressSelect({
  label,
  help,
  readOnly,
  disabled,
  selectedId,
  options,
  open,
  query,
  onOpenChange,
  onQueryChange,
  onSelect,
  onClear,
  anchorRef,
  portalHost,
  addressPreview,
}: Props) {
  const selected = useMemo(
    () => options.find((o) => o.id === selectedId) ?? null,
    [options, selectedId],
  );

  const filtered = useMemo(
    () => filterAddressOptions(options, query),
    [options, query],
  );

  const displayValue = open ? query : selected?.primary ?? "";

  return (
    <AgainFormRow label={label} help={help}>
      <div>
        <div className="flex items-start gap-1.5">
          <div
            ref={anchorRef}
            className="flex min-w-0 flex-1 items-center gap-0 border-b border-border/50 focus-within:border-[#00a09d]"
          >
            {!readOnly && !disabled ? (
              <button
                type="button"
                className="inline-flex h-8 w-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                aria-label={`Search ${label}`}
                aria-expanded={open}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (open) onOpenChange(false);
                  else {
                    onOpenChange(true);
                    if (selected) onQueryChange(selected.primary);
                  }
                }}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <AgainUnderlineField
              readOnly={readOnly || disabled}
              active={open}
              className="min-w-0 flex-1"
            >
              {readOnly || disabled ? (
                <p className="py-1.5 text-[13px] text-foreground">{selected?.primary || "—"}</p>
              ) : (
                <input
                  value={displayValue}
                  onChange={(e) => {
                    onQueryChange(e.target.value);
                    onOpenChange(true);
                    if (!e.target.value) onClear();
                  }}
                  onFocus={() => {
                    onOpenChange(true);
                    if (selected && !query) onQueryChange(selected.primary);
                  }}
                  placeholder={disabled ? "Select a customer first" : `Search ${label.toLowerCase()}...`}
                  disabled={disabled}
                  className="h-8 w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
                />
              )}
            </AgainUnderlineField>
            {!readOnly && !disabled && selectedId ? (
              <button
                type="button"
                className="inline-flex h-8 w-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                aria-label={`Clear ${label}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={onClear}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        {addressPreview?.street ||
        addressPreview?.city ||
        selected?.phone ||
        selected?.email ? (
          <PartnerAddressBlock
            address={addressPreview ?? null}
            phone={selected?.phone}
            email={selected?.email}
          />
        ) : null}
        <SearchDropdown
          open={!readOnly && !disabled && open}
          getAnchor={() => anchorRef.current}
          portalContainer={portalHost}
          items={filtered.map((o) => ({
            id: o.id,
            primary: o.primary,
            secondary: o.secondary,
          }))}
          onSelect={(id) => {
            const opt = options.find((o) => o.id === id);
            if (opt) onSelect(opt);
          }}
        />
      </div>
    </AgainFormRow>
  );
}
