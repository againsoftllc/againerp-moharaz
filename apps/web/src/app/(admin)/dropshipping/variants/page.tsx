import { VariantCatalogList } from "@/components/variants/variant-catalog-list";

export default function Page() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <VariantCatalogList className="min-h-0 flex-1" />
    </div>
  );
}
