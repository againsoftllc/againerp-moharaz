import type { UniversalSupplier } from "../models/UniversalSupplier";
import type { FieldTrace } from "./validation";

export function mapSupplier(
  raw: unknown,
  traces: FieldTrace[],
  sourcePath = "supplier",
): UniversalSupplier | undefined {
  if (raw == null) return undefined;

  if (typeof raw === "string") {
    traces.push({
      universalField: "supplier.name",
      sourcePath,
      status: "mapped",
      value: raw,
    });
    return {
      supplierId: raw,
      name: raw,
    };
  }

  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const name = String(o.shop_name ?? o.name ?? o.supplier_name ?? "");
    const supplierId = String(o.shop_id ?? o.id ?? o.supplier_id ?? name);
    if (!name && !supplierId) return undefined;

    traces.push({
      universalField: "supplier",
      sourcePath,
      status: "mapped",
      value: name || supplierId,
    });

    return {
      supplierId,
      name: name || supplierId,
      rating:
        typeof o.rating === "number"
          ? o.rating
          : typeof o.level === "number"
            ? o.level
            : undefined,
      country: typeof o.country === "string" ? o.country : undefined,
      contact: typeof o.contact === "string" ? o.contact : undefined,
      type: typeof o.seller_type === "string" ? o.seller_type : undefined,
    };
  }

  return undefined;
}

export function mapSuppliers(
  raw: unknown,
  traces: FieldTrace[],
  sourcePath = "suppliers",
): UniversalSupplier[] {
  if (!Array.isArray(raw)) {
    const single = mapSupplier(raw, traces, sourcePath);
    return single ? [single] : [];
  }
  return raw
    .map((item, i) => mapSupplier(item, traces, `${sourcePath}[${i}]`))
    .filter((s): s is UniversalSupplier => s != null);
}
