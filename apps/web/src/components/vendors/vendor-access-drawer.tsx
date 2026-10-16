"use client";

import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { Product } from "@/lib/mock-data/products";
import { formatMoney } from "@/lib/utils";
import {
  fetchVendorGroups,
  fetchVendorPriceListItems,
  fetchVendors,
  upsertVendorPriceListItem,
  type Vendor,
  type VendorGroup,
} from "@/lib/api/vendors";
import {
  deleteCatalogVisibilityRule,
  deleteProductPriceOverride,
  fetchCatalogVisibilityRules,
  fetchProductPriceOverrides,
  upsertCatalogVisibilityRule,
  upsertProductPriceOverride,
  type VendorCatalogVisibilityRule,
  type VendorProductPriceOverride,
} from "@/lib/api/vendor-catalog-access";

function money(value: string | number) {
  return formatMoney(value);
}

function GroupRow({
  group,
  itemId,
  rule,
  onRuleChanged,
}: {
  group: VendorGroup;
  itemId: string;
  rule: VendorCatalogVisibilityRule | undefined;
  onRuleChanged: () => void;
}) {
  const isVisible = rule ? rule.is_visible : true;
  const [price, setPrice] = React.useState("");
  const [priceLoaded, setPriceLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!group.price_list_id) {
      setPriceLoaded(true);
      return;
    }
    void fetchVendorPriceListItems(group.price_list_id).then((items) => {
      if (cancelled) return;
      const match = items.find((i) => i.item_id === itemId);
      setPrice(match ? String(Number(match.unit_price)) : "");
      setPriceLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [group.price_list_id, itemId]);

  async function toggleVisible() {
    setSaving(true);
    try {
      await upsertCatalogVisibilityRule({ item_id: itemId, vendor_group_id: group.id, is_visible: !isVisible });
      toast.success(`${group.name} ${!isVisible ? "can now see" : "can no longer see"} this product`);
      onRuleChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update visibility");
    } finally {
      setSaving(false);
    }
  }

  async function savePrice() {
    if (!group.price_list_id || !price.trim()) return;
    setSaving(true);
    try {
      await upsertVendorPriceListItem(group.price_list_id, { item_id: itemId, unit_price: Number(price) });
      toast.success(`Price set for ${group.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save price");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{group.name}</p>
        <p className="text-[11px] text-muted-foreground">{group.code}</p>
      </div>
      {group.price_list_id ? (
        <div className="flex items-center gap-1">
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={priceLoaded ? "List price" : "…"}
            type="number"
            className="h-7 w-24 rounded-none text-right text-xs"
            disabled={!priceLoaded}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-none px-2 text-[11px]"
            disabled={saving || !price.trim()}
            onClick={() => void savePrice()}
          >
            Save
          </Button>
        </div>
      ) : (
        <span className="text-[11px] text-muted-foreground">No price list</span>
      )}
      <Button
        size="sm"
        variant={isVisible ? "outline" : "default"}
        className="h-7 w-24 rounded-none text-[11px]"
        disabled={saving}
        onClick={() => void toggleVisible()}
      >
        {isVisible ? "Visible" : "Hidden"}
      </Button>
    </div>
  );
}

function VendorOverrideRow({
  vendor,
  itemId,
  rule,
  price,
  onChanged,
}: {
  vendor: Vendor;
  itemId: string;
  rule: VendorCatalogVisibilityRule | undefined;
  price: VendorProductPriceOverride | undefined;
  onChanged: () => void;
}) {
  const isVisible = rule ? rule.is_visible : true;
  const [priceInput, setPriceInput] = React.useState(price ? String(Number(price.unit_price)) : "");
  const [saving, setSaving] = React.useState(false);

  async function toggleVisible() {
    setSaving(true);
    try {
      await upsertCatalogVisibilityRule({ item_id: itemId, vendor_id: vendor.id, is_visible: !isVisible });
      toast.success(`${vendor.company_name} ${!isVisible ? "can now see" : "can no longer see"} this product`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update visibility");
    } finally {
      setSaving(false);
    }
  }

  async function clearVisibilityOverride() {
    if (!rule) return;
    setSaving(true);
    try {
      await deleteCatalogVisibilityRule(rule.id);
      toast.success(`${vendor.company_name} reverted to group default`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear override");
    } finally {
      setSaving(false);
    }
  }

  async function savePrice() {
    if (!priceInput.trim()) return;
    setSaving(true);
    try {
      await upsertProductPriceOverride({ vendor_id: vendor.id, item_id: itemId, unit_price: Number(priceInput) });
      toast.success(`Price override set for ${vendor.company_name}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save price override");
    } finally {
      setSaving(false);
    }
  }

  async function clearPrice() {
    if (!price) return;
    setSaving(true);
    try {
      await deleteProductPriceOverride(price.id);
      toast.success(`Price override removed for ${vendor.company_name}`);
      setPriceInput("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove price override");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{vendor.company_name}</p>
        <p className="text-[11px] text-muted-foreground">{vendor.vendor_code}</p>
      </div>
      <div className="flex items-center gap-1">
        <Input
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          placeholder="Override price"
          type="number"
          className="h-7 w-28 rounded-none text-right text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-none px-2 text-[11px]"
          disabled={saving || !priceInput.trim()}
          onClick={() => void savePrice()}
        >
          Save
        </Button>
        {price && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-none px-2 text-[11px] text-muted-foreground"
            disabled={saving}
            onClick={() => void clearPrice()}
          >
            Clear
          </Button>
        )}
      </div>
      <Button
        size="sm"
        variant={isVisible ? "outline" : "default"}
        className="h-7 w-24 rounded-none text-[11px]"
        disabled={saving}
        onClick={() => void toggleVisible()}
      >
        {isVisible ? "Visible" : "Hidden"}
      </Button>
      {rule && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-none px-2 text-[11px] text-muted-foreground"
          disabled={saving}
          onClick={() => void clearVisibilityOverride()}
          title="Revert to group default"
        >
          Reset
        </Button>
      )}
    </div>
  );
}

export function VendorAccessDrawer({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
}) {
  const itemId = product?.itemId ?? null;

  const [groups, setGroups] = React.useState<VendorGroup[]>([]);
  const [rules, setRules] = React.useState<VendorCatalogVisibilityRule[]>([]);
  const [priceOverrides, setPriceOverrides] = React.useState<VendorProductPriceOverride[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [vendorQuery, setVendorQuery] = React.useState("");
  const [vendorMatches, setVendorMatches] = React.useState<Vendor[]>([]);
  const [overrideVendors, setOverrideVendors] = React.useState<Vendor[]>([]);

  const load = React.useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    try {
      const [groupList, ruleList, priceList] = await Promise.all([
        fetchVendorGroups(),
        fetchCatalogVisibilityRules(itemId),
        fetchProductPriceOverrides(itemId),
      ]);
      setGroups(groupList);
      setRules(ruleList);
      setPriceOverrides(priceList);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load vendor access");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  React.useEffect(() => {
    if (!open) {
      setVendorQuery("");
      setVendorMatches([]);
      setOverrideVendors([]);
    }
  }, [open]);

  // Resolve vendor records for anyone who already has an override, so their row
  // can render even before being found through search.
  React.useEffect(() => {
    if (!open) return;
    const ids = new Set<string>([
      ...rules.filter((r) => r.vendor_id).map((r) => r.vendor_id as string),
      ...priceOverrides.map((p) => p.vendor_id),
    ]);
    const missing = Array.from(ids).filter((id) => !overrideVendors.some((v) => v.id === id));
    if (missing.length === 0) return;
    let cancelled = false;
    void fetchVendors({ limit: 200 }).then((res) => {
      if (cancelled) return;
      const found = res.data.filter((v) => ids.has(v.id));
      setOverrideVendors((prev) => {
        const merged = [...prev];
        for (const v of found) {
          if (!merged.some((m) => m.id === v.id)) merged.push(v);
        }
        return merged;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rules, priceOverrides]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (vendorQuery.trim().length >= 2) {
        void fetchVendors({ search: vendorQuery, limit: 8 }).then((res) => setVendorMatches(res.data));
      } else {
        setVendorMatches([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [vendorQuery]);

  function addOverrideVendor(v: Vendor) {
    setOverrideVendors((prev) => (prev.some((p) => p.id === v.id) ? prev : [...prev, v]));
    setVendorQuery("");
    setVendorMatches([]);
  }

  const groupRule = (groupId: string) => rules.find((r) => r.vendor_group_id === groupId);
  const vendorRule = (vendorId: string) => rules.find((r) => r.vendor_id === vendorId);
  const vendorPrice = (vendorId: string) => priceOverrides.find((p) => p.vendor_id === vendorId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="Vendor access" className="flex w-full max-w-2xl flex-col overflow-y-auto">
        {!product ? null : (
          <>
            <div className="flex items-center gap-3 pr-8">
              {product.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded-none border border-border object-cover" />
              )}
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{product.name}</h2>
                <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>
              </div>
              <Badge variant="outline" className="ml-auto rounded-none text-[10px]">
                List: {money(product.price)}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Visible to every vendor by default. Hide it for a whole group, or override visibility and price for
              one vendor.
            </p>

            {!itemId ? (
              <p className="mt-6 border border-border px-3 py-6 text-center text-xs text-muted-foreground">
                This product isn&apos;t linked to an inventory item yet, so vendor access can&apos;t be managed.
              </p>
            ) : (
              <>
                <div className="mt-4">
                  <h3 className="mb-1.5 text-xs font-semibold">Vendor groups</h3>
                  {loading ? (
                    <p className="border border-border px-3 py-4 text-xs text-muted-foreground">Loading…</p>
                  ) : groups.length === 0 ? (
                    <p className="border border-border px-3 py-4 text-xs text-muted-foreground">No vendor groups yet.</p>
                  ) : (
                    <div className="border border-border">
                      {groups.map((g) => (
                        <GroupRow key={g.id} group={g} itemId={itemId} rule={groupRule(g.id)} onRuleChanged={load} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5">
                  <h3 className="mb-1.5 text-xs font-semibold">Specific vendors</h3>
                  <div className="relative mb-2">
                    <Input
                      value={vendorQuery}
                      onChange={(e) => setVendorQuery(e.target.value)}
                      placeholder="Search vendor by name or code to add an override…"
                      className="rounded-none"
                    />
                    {vendorMatches.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full border border-input bg-popover shadow-md">
                        {vendorMatches.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-xs hover:bg-accent"
                            onClick={() => addOverrideVendor(v)}
                          >
                            <span className="font-medium">{v.company_name}</span>{" "}
                            <span className="text-muted-foreground">{v.vendor_code}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {overrideVendors.length === 0 ? (
                    <p className="border border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      No per-vendor overrides yet.
                    </p>
                  ) : (
                    <div className="border border-border">
                      {overrideVendors.map((v) => (
                        <VendorOverrideRow
                          key={v.id}
                          vendor={v}
                          itemId={itemId}
                          rule={vendorRule(v.id)}
                          price={vendorPrice(v.id)}
                          onChanged={load}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
