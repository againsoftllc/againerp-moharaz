"use client";

import { useEffect, useId, useState } from "react";
import { ChevronsRight } from "lucide-react";
import {
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AGAIN_DRAWER_MODULE_LABEL_CLASS,
  AGAIN_DRAWER_RECORD_LABEL_CLASS,
} from "@/components/again/again-drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LiveEditDrawerSaveButton } from "@/components/website/live-edit/live-edit-drawer-save-button";
import type {
  CatalogSettings,
  CategoryPageContent,
  DescriptionSection,
  FiltersSection,
  ProductCardSection,
  SortingSection,
  StatsSection,
} from "@/lib/website/website-category-page";

type BaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: CategoryPageContent;
  onChange: (content: CategoryPageContent) => void;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
};

function DrawerShell({
  open,
  onOpenChange,
  title,
  children,
  onSave,
  saving = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
}) {
  const titleId = useId();
  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      resizable
      defaultWidth={420}
      widthStorageKey="website-live-edit-category-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar
          trailing={<LiveEditDrawerSaveButton onSave={onSave} saving={saving} />}
        >
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close drawer"
            title="Close"
            onClick={() => onOpenChange(false)}
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
          <span className={AGAIN_DRAWER_MODULE_LABEL_CLASS}>Category</span>
          <span className="text-muted-foreground">/</span>
          <span className={AGAIN_DRAWER_RECORD_LABEL_CLASS} id={titleId}>
            {title}
          </span>
        </AgainDrawerControlBar>
        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          {children}
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <Label className="text-sm font-normal text-foreground">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function LiveEditCategorySettingsDrawer({ open, onOpenChange, content, onChange, onSave, saving = false }: BaseProps) {
  const [settings, setSettings] = useState<CatalogSettings>(content.settings);
  useEffect(() => {
    if (open) setSettings(content.settings);
  }, [open, content.settings]);

  const push = (next: CatalogSettings) => {
    setSettings(next);
    queueMicrotask(() => onChange({ ...content, settings: next }));
  };

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} title="Catalog settings" onSave={onSave} saving={saving}>
      <Section title="Listing">
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Products per page</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={settings.productsPerPage}
              onChange={(e) =>
                push({ ...settings, productsPerPage: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Load mode</Label>
            <Select
              value={settings.loadMode}
              onChange={(e) =>
                push({
                  ...settings,
                  loadMode: e.target.value === "pagination" ? "pagination" : "load_more",
                })
              }
            >
              <option value="load_more">Load more</option>
              <option value="pagination">Pagination</option>
            </Select>
          </div>
          {settings.loadMode === "load_more" ? (
            <div>
              <Label className="text-xs text-muted-foreground">Load more count</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={settings.loadMoreCount}
                onChange={(e) =>
                  push({ ...settings, loadMoreCount: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Columns (md)</Label>
              <Input
                type="number"
                min={1}
                max={4}
                value={settings.gridColsMd}
                onChange={(e) =>
                  push({ ...settings, gridColsMd: Math.min(4, Math.max(1, Number(e.target.value) || 1)) })
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Columns (lg)</Label>
              <Input
                type="number"
                min={1}
                max={6}
                value={settings.gridColsLg}
                onChange={(e) =>
                  push({ ...settings, gridColsLg: Math.min(6, Math.max(1, Number(e.target.value) || 1)) })
                }
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Default sort</Label>
            <Select
              value={settings.defaultSort}
              onChange={(e) =>
                push({
                  ...settings,
                  defaultSort:
                    e.target.value === "price-asc" || e.target.value === "price-desc"
                      ? e.target.value
                      : "default",
                })
              }
            >
              <option value="default">Default</option>
              <option value="price-asc">Price (Low &gt; High)</option>
              <option value="price-desc">Price (High &gt; Low)</option>
            </Select>
          </div>
          <ToggleRow
            label="Show breadcrumbs"
            checked={settings.showBreadcrumbs}
            onCheckedChange={(v) => push({ ...settings, showBreadcrumbs: v })}
          />
        </div>
      </Section>
      <Section title="Empty states">
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Empty title</Label>
            <Input
              value={settings.emptyTitle}
              onChange={(e) => push({ ...settings, emptyTitle: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Empty message</Label>
            <Textarea
              rows={2}
              value={settings.emptyMessage}
              onChange={(e) => push({ ...settings, emptyMessage: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">No filter match message</Label>
            <Textarea
              rows={2}
              value={settings.emptyFilterMessage}
              onChange={(e) => push({ ...settings, emptyFilterMessage: e.target.value })}
            />
          </div>
        </div>
      </Section>
    </DrawerShell>
  );
}

export function LiveEditCategorySortingDrawer({ open, onOpenChange, content, onChange, onSave, saving = false }: BaseProps) {
  const [section, setSection] = useState<SortingSection>(content.sorting);
  useEffect(() => {
    if (open) setSection(content.sorting);
  }, [open, content.sorting]);

  const push = (next: SortingSection) => {
    setSection(next);
    queueMicrotask(() => onChange({ ...content, sorting: next }));
  };

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} title="Sorting" onSave={onSave} saving={saving}>
      <Section title="Sort bar">
        <ToggleRow
          label="Hide sorting"
          checked={Boolean(section.hidden)}
          onCheckedChange={(v) => push({ ...section, hidden: v })}
        />
        <div className="mt-3 space-y-3">
          {section.options.map((opt, i) => (
            <div key={opt.id} className="rounded-md border border-border p-2">
              <div className="mb-1 text-[11px] font-medium uppercase text-muted-foreground">
                {opt.id}
              </div>
              <Input
                value={opt.label}
                onChange={(e) => {
                  const options = section.options.map((o, idx) =>
                    idx === i ? { ...o, label: e.target.value } : o,
                  );
                  push({ ...section, options });
                }}
              />
              <ToggleRow
                label="Hidden"
                checked={Boolean(opt.hidden)}
                onCheckedChange={(v) => {
                  const options = section.options.map((o, idx) =>
                    idx === i ? { ...o, hidden: v } : o,
                  );
                  push({ ...section, options });
                }}
              />
            </div>
          ))}
        </div>
      </Section>
    </DrawerShell>
  );
}

export function LiveEditCategoryFiltersDrawer({ open, onOpenChange, content, onChange, onSave, saving = false }: BaseProps) {
  const [section, setSection] = useState<FiltersSection>(content.filters);
  useEffect(() => {
    if (open) setSection(content.filters);
  }, [open, content.filters]);

  const push = (next: FiltersSection) => {
    setSection(next);
    queueMicrotask(() => onChange({ ...content, filters: next }));
  };

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} title="Filters" onSave={onSave} saving={saving}>
      <Section title="Filter panel">
        <ToggleRow
          label="Hide filters"
          checked={Boolean(section.hidden)}
          onCheckedChange={(v) => push({ ...section, hidden: v })}
        />
        <div className="mt-2">
          <Label className="text-xs text-muted-foreground">Button label</Label>
          <Input
            value={section.buttonLabel}
            onChange={(e) => push({ ...section, buttonLabel: e.target.value })}
          />
        </div>
      </Section>
      <Section title="Price">
        <ToggleRow
          label="Enabled"
          checked={section.price.enabled}
          onCheckedChange={(v) => push({ ...section, price: { ...section.price, enabled: v } })}
        />
        <Input
          className="mt-2"
          value={section.price.label}
          onChange={(e) => push({ ...section, price: { ...section.price, label: e.target.value } })}
        />
      </Section>
      <Section title="Availability">
        <ToggleRow
          label="Enabled"
          checked={section.availability.enabled}
          onCheckedChange={(v) =>
            push({ ...section, availability: { ...section.availability, enabled: v } })
          }
        />
        <Input
          className="mt-2"
          value={section.availability.label}
          onChange={(e) =>
            push({ ...section, availability: { ...section.availability, label: e.target.value } })
          }
        />
        <div className="mt-3 space-y-2">
          {section.availability.options.map((opt, i) => (
            <div key={opt.id} className="rounded-md border border-border p-2">
              <Input
                value={opt.label}
                onChange={(e) => {
                  const options = section.availability.options.map((o, idx) =>
                    idx === i ? { ...o, label: e.target.value } : o,
                  );
                  push({ ...section, availability: { ...section.availability, options } });
                }}
              />
              <ToggleRow
                label="Hidden"
                checked={Boolean(opt.hidden)}
                onCheckedChange={(v) => {
                  const options = section.availability.options.map((o, idx) =>
                    idx === i ? { ...o, hidden: v } : o,
                  );
                  push({ ...section, availability: { ...section.availability, options } });
                }}
              />
            </div>
          ))}
        </div>
      </Section>
    </DrawerShell>
  );
}

export function LiveEditCategoryProductCardDrawer({
  open,
  onOpenChange,
  content,
  onChange,
  onSave,
  saving = false,
}: BaseProps) {
  const [section, setSection] = useState<ProductCardSection>(content.productCard);
  useEffect(() => {
    if (open) setSection(content.productCard);
  }, [open, content.productCard]);

  const push = (next: ProductCardSection) => {
    setSection(next);
    queueMicrotask(() => onChange({ ...content, productCard: next }));
  };

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} title="Product card" onSave={onSave} saving={saving}>
      <Section title="Visible fields">
        <ToggleRow label="Rating" checked={section.showRating} onCheckedChange={(v) => push({ ...section, showRating: v })} />
        <ToggleRow label="Review count" checked={section.showReviewCount} onCheckedChange={(v) => push({ ...section, showReviewCount: v })} />
        <ToggleRow label="Compare-at price" checked={section.showCompareAt} onCheckedChange={(v) => push({ ...section, showCompareAt: v })} />
        <ToggleRow label="Discount badge" checked={section.showDiscountBadge} onCheckedChange={(v) => push({ ...section, showDiscountBadge: v })} />
        <ToggleRow label="Buy now" checked={section.showBuyNow} onCheckedChange={(v) => push({ ...section, showBuyNow: v })} />
        <ToggleRow label="Wishlist" checked={section.showWishlist} onCheckedChange={(v) => push({ ...section, showWishlist: v })} />
        <ToggleRow label="Compare" checked={section.showCompare} onCheckedChange={(v) => push({ ...section, showCompare: v })} />
      </Section>
    </DrawerShell>
  );
}

export function LiveEditCategoryStatsDrawer({ open, onOpenChange, content, onChange, onSave, saving = false }: BaseProps) {
  const [section, setSection] = useState<StatsSection>(content.stats);
  useEffect(() => {
    if (open) setSection(content.stats);
  }, [open, content.stats]);

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} title="Stats strip" onSave={onSave} saving={saving}>
      <Section title="Visibility">
        <ToggleRow
          label="Hide stats strip"
          checked={Boolean(section.hidden)}
          onCheckedChange={(v) => {
            const next = { ...section, hidden: v };
            setSection(next);
            queueMicrotask(() => onChange({ ...content, stats: next }));
          }}
        />
      </Section>
    </DrawerShell>
  );
}

export function LiveEditCategoryDescriptionDrawer({
  open,
  onOpenChange,
  content,
  onChange,
  onSave,
  saving = false,
}: BaseProps) {
  const [section, setSection] = useState<DescriptionSection>(content.description);
  useEffect(() => {
    if (open) setSection(content.description);
  }, [open, content.description]);

  const push = (next: DescriptionSection) => {
    setSection(next);
    queueMicrotask(() => onChange({ ...content, description: next }));
  };

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} title="Description / SEO" onSave={onSave} saving={saving}>
      <Section title="SEO body">
        <ToggleRow
          label="Hide section"
          checked={Boolean(section.hidden)}
          onCheckedChange={(v) => push({ ...section, hidden: v })}
        />
        <ToggleRow
          label="Collapse enabled"
          checked={section.collapseEnabled}
          onCheckedChange={(v) => push({ ...section, collapseEnabled: v })}
        />
        <div className="mt-2">
          <Label className="text-xs text-muted-foreground">Title template (use {"{category}"})</Label>
          <Input
            value={section.titleTemplate}
            onChange={(e) => push({ ...section, titleTemplate: e.target.value })}
          />
        </div>
        <div className="mt-2">
          <Label className="text-xs text-muted-foreground">Body HTML</Label>
          <Textarea
            rows={10}
            value={section.bodyHtml}
            onChange={(e) => push({ ...section, bodyHtml: e.target.value })}
          />
        </div>
      </Section>
    </DrawerShell>
  );
}
