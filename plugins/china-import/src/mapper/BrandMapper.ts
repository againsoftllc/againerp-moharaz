import type { UniversalBrand } from "../models/UniversalBrand";
import { createId } from "../utils";
import { slugify } from "./normalize";
import type { FieldTrace } from "./validation";

export function mapBrand(
  raw: unknown,
  traces: FieldTrace[],
  sourcePath = "brand",
): UniversalBrand | undefined {
  if (raw == null || raw === "") return undefined;

  if (typeof raw === "string") {
    traces.push({
      universalField: "brand.name",
      sourcePath,
      status: "mapped",
      value: raw,
    });
    return {
      providerBrandId: slugify(raw) || createId("brand"),
      name: raw,
    };
  }

  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const name = String(o.name ?? o.brand_name ?? "");
    if (!name) return undefined;
    traces.push({
      universalField: "brand",
      sourcePath,
      status: "mapped",
      value: name,
    });
    return {
      providerBrandId: String(o.id ?? slugify(name)),
      name,
      logo: typeof o.logo === "string" ? o.logo : undefined,
      country: typeof o.country === "string" ? o.country : undefined,
    };
  }

  return undefined;
}

export function mapBrands(
  raw: unknown,
  traces: FieldTrace[],
  sourcePath = "brands",
): UniversalBrand[] {
  if (!Array.isArray(raw)) {
    const single = mapBrand(raw, traces, sourcePath);
    return single ? [single] : [];
  }
  return raw
    .map((item, i) => mapBrand(item, traces, `${sourcePath}[${i}]`))
    .filter((b): b is UniversalBrand => b != null);
}
