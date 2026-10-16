"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CreditCard,
  Globe,
  Megaphone,
  Package,
  Search,
  Settings2,
  ShoppingCart,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { SettingCategoryDef, SettingsLayer } from "@/lib/settings/types";
import { SETTINGS_LAYER_META, getCategoriesForLayer } from "@/lib/settings/settings-schema";
import { Input } from "@/components/ui/input";
import { SettingsLayerNav } from "@/components/settings/settings-layer-nav";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  store: Store,
  catalog: Package,
  customers: Users,
  orders: ShoppingCart,
  checkout: CreditCard,
  payments: CreditCard,
  shipping: Truck,
  marketing: Megaphone,
  seo: Globe,
  notifications: Bell,
  users: Users,
  roles: Settings2,
  teams: Users,
  branches: Store,
  warehouses: Package,
  integrations: Globe,
  workflows: Settings2,
  approvals: Settings2,
  licensing: Settings2,
  "feature-manager": Package,
  "ai-center": Settings2,
  monitoring: Settings2,
  security: Settings2,
  updates: Settings2,
  analytics: Settings2,
  marketplace: Store,
};

type Props = { layer: SettingsLayer };

export function SettingsLauncher({ layer }: Props) {
  const [query, setQuery] = useState("");
  const meta = SETTINGS_LAYER_META[layer];
  const categories = getCategoriesForLayer(layer);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.id.includes(q),
    );
  }, [categories, query]);

  return (
    <div className="space-y-4">
      <SettingsLayerNav />

      <div>
        <p className="page-subtitle">AgainERP › {meta.title}</p>
        <h1 className="page-title">{meta.title}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta.subtitle}</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings…"
          className="h-9 pl-8 text-xs"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((cat) => (
          <CategoryCard key={cat.id} layer={layer} category={cat} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No settings match your search.</p>
      )}
    </div>
  );
}

function CategoryCard({ layer, category }: { layer: SettingsLayer; category: SettingCategoryDef }) {
  const base = SETTINGS_LAYER_META[layer].basePath;
  const Icon = CATEGORY_ICONS[category.id] ?? Settings2;
  const sectionCount = category.sections.length;
  const itemCount = category.sections.reduce(
    (n, s) => n + s.groups.reduce((m, g) => m + g.items.length, 0),
    0,
  );

  return (
    <Link
      href={`${base}/${category.id}`}
      className="group rounded-xl border border-input bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-muted/60 p-2 transition-colors group-hover:bg-primary/10">
          <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{category.title}</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
            {category.description}
          </p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {sectionCount} section{sectionCount !== 1 ? "s" : ""} · {itemCount} setting{itemCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}
