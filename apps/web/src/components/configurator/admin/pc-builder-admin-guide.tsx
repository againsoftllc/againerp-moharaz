"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Cpu, Package, Tags } from "lucide-react";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    n: 1,
    title: "Install Again Builder",
    body: "Plugins → Again Builder → Install. PC Builder stays on; other builders later.",
    href: "/workspace/plugins/again-builder",
    cta: "Open plugin",
  },
  {
    n: 2,
    title: "Open PC Builder profile",
    body: "Builders → Profiles → PC Builder (slug pc-builder). Status must be Active.",
    href: "profiles",
    cta: "Profiles",
  },
  {
    n: 3,
    title: "Check slots (categories)",
    body: "CPU, Motherboard, Memory… already seeded. Each slot slug must match a Catalog category slug.",
    href: "categories",
    cta: "Slots",
  },
  {
    n: 4,
    title: "Add Catalog products",
    body: "Catalog → Products under category slug cpu / memory / … Published + Public.",
    href: "/website/products",
    cta: "Products",
  },
  {
    n: 5,
    title: "Verify on storefront",
    body: "Open /pc-builder — slot lists show matching Catalog products.",
    href: null,
    cta: null,
  },
] as const;

export function PcBuilderAdminGuide() {
  const moduleBase = useCatalogModuleBasePath();
  const base = `${moduleBase}/product-configurator`;

  const resolveHref = (href: string | null) => {
    if (!href) return null;
    if (href.startsWith("/")) return href;
    return `${base}/${href}`;
  };

  return (
    <div className="mt-4 space-y-4 rounded-none border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">How PC Builder works (admin)</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            One rule: <span className="font-medium text-foreground">slot slug = Catalog category slug</span>.
            Products in that category (published + public) appear in the storefront slot.
          </p>
        </div>
        <Button size="sm" variant="outline" className="rounded-none" asChild>
          <Link href={`${base}/profiles`}>Open PC Builder profile</Link>
        </Button>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {STEPS.map((step) => {
          const href = resolveHref(step.href);
          return (
            <li
              key={step.n}
              className="flex flex-col rounded-none border border-border bg-muted/20 p-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Step {step.n}
              </p>
              <p className="mt-1 text-xs font-semibold text-foreground">{step.title}</p>
              <p className="mt-1 flex-1 text-[11px] leading-snug text-muted-foreground">{step.body}</p>
              {href && step.cta ? (
                <Button size="sm" variant="ghost" className="mt-2 h-7 justify-start rounded-none px-0 text-xs" asChild>
                  <Link href={href}>
                    {step.cta}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              ) : (
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">/pc-builder</p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="rounded-none border border-dashed border-border bg-muted/10 p-3">
        <p className="text-xs font-semibold text-foreground">Example — add a CPU to PC Builder</p>
        <div className="mt-2 grid gap-3 lg:grid-cols-3">
          <div className="flex gap-2 text-[11px] text-muted-foreground">
            <Tags className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
            <div>
              <p className="font-medium text-foreground">1. Catalog category</p>
              <p>
                Name: <span className="text-foreground">CPU</span>
                <br />
                Slug: <span className="font-mono text-foreground">cpu</span> (exact)
                <br />
                Channel: Catalog
              </p>
              <Button size="sm" variant="link" className="h-auto rounded-none px-0 text-[11px]" asChild>
                <Link href="/website/categories">Create / open category</Link>
              </Button>
            </div>
          </div>
          <div className="flex gap-2 text-[11px] text-muted-foreground">
            <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
            <div>
              <p className="font-medium text-foreground">2. Catalog product</p>
              <p>
                Name: <span className="text-foreground">Intel Core i5-14400F</span>
                <br />
                Category: <span className="font-mono text-foreground">cpu</span>
                <br />
                Status: <span className="text-foreground">Published</span> · Visibility:{" "}
                <span className="text-foreground">Public</span>
              </p>
              <Button size="sm" variant="link" className="h-auto rounded-none px-0 text-[11px]" asChild>
                <Link href="/website/products?create=1">Add product</Link>
              </Button>
            </div>
          </div>
          <div className="flex gap-2 text-[11px] text-muted-foreground">
            <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
            <div>
              <p className="font-medium text-foreground">3. Storefront result</p>
              <p>
                Profile slot <span className="font-mono text-foreground">cpu</span> lists that
                product under PC Builder.
              </p>
              <ul className="mt-1 space-y-0.5">
                <li className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  Slot slug = category slug
                </li>
                <li className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  Product published + public
                </li>
                <li className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  Profile <span className="font-mono">pc-builder</span> active
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          PC Builder slot slugs (Catalog category must match)
        </p>
        <table className="w-full min-w-[520px] border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Slot</th>
              <th className="py-1 pr-3 font-medium">Slug</th>
              <th className="py-1 pr-3 font-medium">Required</th>
              <th className="py-1 font-medium">Example product</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            {[
              ["CPU", "cpu", "Yes", "Intel Core i5-14400F"],
              ["Motherboard", "motherboard", "Yes", "MSI MAG B650 Tomahawk"],
              ["Memory", "memory", "Yes", "Corsair Vengeance 32GB DDR5"],
              ["Graphics Card", "graphics-card", "No", "ASUS RTX 4060 8GB"],
              ["Power Supply", "power-supply", "Yes", "Corsair RM750x"],
              ["Casing", "casing", "Yes", "NZXT H5 Flow"],
            ].map(([name, slug, req, ex]) => (
              <tr key={slug} className="border-b border-border/60">
                <td className="py-1 pr-3 text-foreground">{name}</td>
                <td className="py-1 pr-3 font-mono text-foreground">{slug}</td>
                <td className="py-1 pr-3">{req}</td>
                <td className="py-1">{ex}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Full list (cooler, storage, monitor, peripherals, UPS): Builders → Categories filtered to PC
          Builder. Specs template: Catalog → Attributes → <span className="font-medium text-foreground">PC Builder Components</span>.
          Ready templates: <span className="font-medium text-foreground">Intel Gaming (LGA1700)</span> +{" "}
          <span className="font-medium text-foreground">AMD Gaming (AM5)</span> under Builders → Templates.
        </p>
      </div>
    </div>
  );
}
