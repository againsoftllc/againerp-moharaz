import type { UniversalCategory } from "../models/UniversalCategory";
import { slugify } from "./normalize";
import type { FieldTrace } from "./validation";

export function mapCategory(
  raw: unknown,
  traces: FieldTrace[],
  sourcePath = "category",
): UniversalCategory | undefined {
  if (raw == null) return undefined;

  if (typeof raw === "string") {
    traces.push({
      universalField: "category.name",
      sourcePath,
      status: "mapped",
      value: raw,
    });
    const id = slugify(raw) || raw;
    return {
      providerCategoryId: id,
      universalCategoryId: `uni:${id}`,
      name: raw,
      path: [raw],
      level: 0,
      parentId: null,
    };
  }

  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const name = String(o.name ?? o.category_name ?? "");
    const providerCategoryId = String(o.id ?? o.category_id ?? slugify(name));
    if (!name && !providerCategoryId) return undefined;

    const parentId = o.parent_id != null ? String(o.parent_id) : o.parentId != null ? String(o.parentId) : null;
    const path = Array.isArray(o.path)
      ? o.path.map(String)
      : name
        ? [name]
        : [];

    traces.push({
      universalField: "category",
      sourcePath,
      status: "mapped",
      value: name || providerCategoryId,
    });

    return {
      providerCategoryId,
      universalCategoryId: `uni:${providerCategoryId}`,
      name: name || providerCategoryId,
      path,
      level: typeof o.level === "number" ? o.level : path.length > 0 ? path.length - 1 : 0,
      parentId,
    };
  }

  return undefined;
}

export function mapCategories(
  raw: unknown,
  traces: FieldTrace[],
  sourcePath = "categories",
): UniversalCategory[] {
  if (!Array.isArray(raw)) {
    const single = mapCategory(raw, traces, sourcePath);
    return single ? [single] : [];
  }
  return raw
    .map((item, i) => mapCategory(item, traces, `${sourcePath}[${i}]`))
    .filter((c): c is UniversalCategory => c != null);
}
