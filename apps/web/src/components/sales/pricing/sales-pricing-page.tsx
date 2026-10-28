"use client";

import "@/components/providers/ag-grid-provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FinanceAgListGrid, type FinanceAgListGridColumn, type FinanceAgListGridHandle } from "@/components/finance/finance-ag-list-grid";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { SalesModuleBody, SalesModuleNavbar } from "@/components/sales/sales-module-chrome";
import { fetchAuthUsers } from "@/lib/api/auth-users";
import { listWarehouses } from "@/lib/api/inventory";
import {
  fetchCustomerGroups,
  fetchDiscountTypes,
  fetchPriceTypes,
  fetchPricingRules,
  type ApiCustomerGroup,
  type ApiDiscountType,
  type ApiPriceType,
  type ApiPricingRule,
} from "@/lib/api/sales-pricing";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useCatalogBrands } from "@/lib/api/use-catalog-brands";
import { useCatalogCategories } from "@/lib/api/use-catalog-categories";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { CustomerGroupDrawer } from "./customer-group-drawer";
import { DiscountTypeDrawer } from "./discount-type-drawer";
import { PriceTypeDrawer } from "./price-type-drawer";
import { PricingRuleDrawer, type PricingLookups } from "./pricing-rule-drawer";

export type SalesPricingKind = "price-types" | "discount-types" | "rules" | "customer-groups";

const TITLES: Record<SalesPricingKind, string> = {
  "price-types": "Price types",
  "discount-types": "Discount types",
  rules: "Pricing rules",
  "customer-groups": "Customer groups",
};

type Option = { value: string; label: string };
const pct = (v: string | null | undefined) => (v == null || v === "" ? "—" : `${Number(v)}%`);

/** Sales → Pricing: the price / discount masters (OnerERP Price Type, Discount Type, Price & Discount Configuration, Customer Group). */
export function SalesPricingPage({ kind }: { kind: SalesPricingKind }) {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<FinanceAgListGridHandle>(null);
  const [priceTypes, setPriceTypes] = useState<ApiPriceType[]>([]);
  const [discountTypes, setDiscountTypes] = useState<ApiDiscountType[]>([]);
  const [rules, setRules] = useState<ApiPricingRule[]>([]);
  const [groups, setGroups] = useState<ApiCustomerGroup[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [users, setUsers] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openRow, setOpenRow] = useState<any>(null);
  const { brands } = useCatalogBrands({ channel: "catalog" });
  const { categories } = useCatalogCategories({ channel: "catalog" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pt, dt, rl, gr] = await Promise.all([fetchPriceTypes(), fetchDiscountTypes(), fetchPricingRules(), fetchCustomerGroups()]);
      setPriceTypes(pt.data);
      setDiscountTypes(dt.data);
      setRules(rl.data);
      setGroups(gr.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load pricing");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (kind !== "rules") return;
    listWarehouses()
      .then((rows) => setWarehouses(rows.map((w) => ({ value: w.id, label: w.name }))))
      .catch(() => setWarehouses([]));
    fetchAuthUsers()
      .then((rows) => setUsers(rows.filter((u) => u.is_active).map((u) => ({ value: u.id, label: u.name || u.email }))))
      .catch(() => setUsers([]));
  }, [kind]);

  const lookups: PricingLookups = useMemo(
    () => ({
      priceTypes: priceTypes.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name })),
      discountTypes: discountTypes.filter((d) => d.is_active).map((d) => ({ value: d.id, label: d.name })),
      groups: groups.filter((g) => g.is_active).map((g) => ({ value: g.code, label: g.name })),
      warehouses,
      users,
      brands: brands.map((b) => ({ value: b.id, label: b.name })),
      categories: categories.map((c) => ({ value: c.id, label: c.name })),
    }),
    [priceTypes, discountTypes, groups, warehouses, users, brands, categories],
  );

  const nameOf = useMemo(() => {
    const all = new Map<string, string>();
    for (const list of [lookups.priceTypes, lookups.discountTypes, lookups.groups, lookups.warehouses, lookups.users, lookups.brands, lookups.categories]) {
      for (const o of list) all.set(o.value, o.label);
    }
    for (const p of priceTypes) all.set(p.id, p.name);
    for (const d of discountTypes) all.set(d.id, d.name);
    return (id: string | null | undefined) => (id ? all.get(id) ?? id : "—");
  }, [lookups, priceTypes, discountTypes]);

  const status = { colId: "status", field: "is_active", headerName: "Status", width: 100, valueFormatter: (p: { value: unknown }) => (p.value ? "Active" : "Inactive") };
  const columns = useMemo<FinanceAgListGridColumn<any>[]>(() => {
    if (kind === "price-types")
      return [
        { colId: "name", field: "name", headerName: "Price type", flex: 1, minWidth: 160 },
        { colId: "code", field: "code", headerName: "Code", width: 120 },
        { colId: "change", field: "allow_change", headerName: "Price", width: 130, valueFormatter: (p) => (p.value ? "Within limits" : "Fixed") },
        { colId: "lower", field: "lower_limit_pct", headerName: "Lower limit", width: 110, valueFormatter: (p) => pct(p.value) },
        { colId: "upper", field: "upper_limit_pct", headerName: "Upper limit", width: 110, valueFormatter: (p) => pct(p.value) },
        { colId: "items", headerName: "Prices", width: 90, valueGetter: (p) => p.data?.items.length ?? 0 },
        status,
      ];
    if (kind === "discount-types")
      return [
        { colId: "name", field: "name", headerName: "Discount type", flex: 1, minWidth: 160 },
        { colId: "code", field: "code", headerName: "Code", width: 120 },
        { colId: "max", field: "max_pct", headerName: "Max discount", width: 120, valueFormatter: (p) => pct(p.value) },
        { colId: "items", headerName: "Discounts", width: 100, valueGetter: (p) => p.data?.items.length ?? 0 },
        status,
      ];
    if (kind === "rules")
      return [
        { colId: "name", field: "name", headerName: "Rule", flex: 1, minWidth: 160 },
        { colId: "price", field: "price_type_id", headerName: "Price type", width: 140, valueFormatter: (p) => nameOf(p.value) },
        { colId: "discount", field: "discount_type_id", headerName: "Discount type", width: 140, valueFormatter: (p) => nameOf(p.value) },
        {
          colId: "when",
          headerName: "When",
          minWidth: 220,
          flex: 1,
          valueGetter: (p) => {
            const r = p.data as ApiPricingRule | undefined;
            if (!r) return "";
            const parts = [
              r.customer_group && `group ${nameOf(r.customer_group)}`,
              r.warehouse_id && `at ${nameOf(r.warehouse_id)}`,
              r.user_id && `by ${nameOf(r.user_id)}`,
              r.brand_id && `brand ${nameOf(r.brand_id)}`,
              r.category_id && `category ${nameOf(r.category_id)}`,
              (r.valid_from || r.valid_to) && `${r.valid_from ?? "…"} – ${r.valid_to ?? "…"}`,
            ].filter(Boolean);
            return parts.length ? parts.join(" · ") : "Always";
          },
        },
        { colId: "priority", field: "priority", headerName: "Priority", width: 90 },
        status,
      ];
    return [
      { colId: "name", field: "name", headerName: "Customer group", flex: 1, minWidth: 160 },
      { colId: "code", field: "code", headerName: "Code", width: 120 },
      { colId: "price", field: "price_type_id", headerName: "Price type", width: 150, valueFormatter: (p) => nameOf(p.value) },
      { colId: "discount", field: "discount_type_id", headerName: "Discount type", width: 150, valueFormatter: (p) => nameOf(p.value) },
      { colId: "customers", field: "customer_count", headerName: "Customers", width: 100 },
      status,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, nameOf]);

  const rows: any[] = kind === "price-types" ? priceTypes : kind === "discount-types" ? discountTypes : kind === "rules" ? rules : groups;
  const open = (row: any) => {
    setOpenRow(row);
    setDrawerOpen(true);
  };
  const saved = () => void load();
  const title = TITLES[kind];

  const headerLeftActions = (
    <ListGridHeaderStart title={title}>
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={() => open(null)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New
        </Button>
      ) : null}
      <FinanceGridSettingsMenu
        apiHealth={apiHealth}
        loading={loading}
        filterCount={0}
        onRefresh={() => {
          void load();
          apiHealth.recheck();
        }}
        onFilters={() => gridRef.current?.openFilters()}
        onColumns={() => gridRef.current?.openColumns()}
        onExport={() => gridRef.current?.exportCsv()}
        onResetFilters={() => gridRef.current?.resetFilters()}
      />
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <SalesModuleNavbar activeNav="pricing" activeSub={kind} />
      <SalesModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <FinanceAgListGrid
          className="min-h-0 flex-1"
          gridRef={gridRef}
          storageKey={`sales-pricing-${kind}`}
          rows={rows}
          columns={columns as unknown as FinanceAgListGridColumn[]}
          loading={loading && rows.length === 0}
          headerLeftActions={headerLeftActions}
          footerLeftActions={<span className="px-2 text-[10px] text-muted-foreground">{loading ? "Loading…" : `${rows.length} row(s)`}</span>}
          onRowClicked={(row) => open(row)}
          emptyTitle={`No ${title.toLowerCase()} yet`}
          emptyHint="Click New to add one."
          csvFileName={`${kind}-${new Date().toISOString().slice(0, 10)}.csv`}
          csvHeaders={["Name", "Code", "Status"]}
          csvRow={(r: any) => [r.name, r.code ?? "", r.is_active ? "Active" : "Inactive"]}
          mobileLine={(r: any) => ({ title: r.name, meta: r.code ?? "", value: r.is_active ? "Active" : "Inactive" })}
        />
      </SalesModuleBody>
      {kind === "price-types" ? (
        <PriceTypeDrawer open={drawerOpen} priceType={openRow} canWrite={canWrite} onOpenChange={setDrawerOpen} onSaved={saved} />
      ) : kind === "discount-types" ? (
        <DiscountTypeDrawer
          open={drawerOpen}
          discountType={openRow}
          brands={lookups.brands}
          categories={lookups.categories}
          canWrite={canWrite}
          onOpenChange={setDrawerOpen}
          onSaved={saved}
        />
      ) : kind === "rules" ? (
        <PricingRuleDrawer open={drawerOpen} rule={openRow} lookups={lookups} canWrite={canWrite} onOpenChange={setDrawerOpen} onSaved={saved} />
      ) : (
        <CustomerGroupDrawer
          open={drawerOpen}
          group={openRow}
          priceTypes={lookups.priceTypes}
          discountTypes={lookups.discountTypes}
          canWrite={canWrite}
          onOpenChange={setDrawerOpen}
          onSaved={saved}
        />
      )}
    </div>
  );
}
