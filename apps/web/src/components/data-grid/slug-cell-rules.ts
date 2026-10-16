import type { CellClassRules } from "ag-grid-community";
import { slugHasError } from "@/lib/url-slug/validate-slug";

export const slugCellClassRules: CellClassRules = {
  "slug-cell-invalid": (params) => {
    const slug = String(params.value ?? params.data?.slug ?? "");
    const id = params.data?.id as string | undefined;
    return slugHasError(slug, id ? { id } : undefined);
  },
};
