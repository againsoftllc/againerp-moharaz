import type { UniversalAttribute, UniversalAttributeKind } from "../models/UniversalAttribute";
import type { UniversalVariant } from "../models/UniversalVariant";
import { createId } from "../utils";
import { mapSingleImage, type MappingContext, traceField } from "./ImageMapper";
import { normalizeNumber, normalizePrice } from "./normalize";
import type { FieldTrace } from "./validation";

function inferAttributeKind(name: string): UniversalAttributeKind {
  const n = name.toLowerCase();
  if (n.includes("color") || n.includes("colour")) return "color";
  if (n.includes("size")) return "size";
  if (n.includes("material")) return "material";
  if (n.includes("model")) return "model";
  if (n.includes("spec")) return "specification";
  return "custom";
}

export function mapAttributes(
  raw: unknown,
  traces: FieldTrace[],
  sourcePath = "attributes",
): UniversalAttribute[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? o.key ?? `attr_${i}`);
    const value = String(o.value ?? "");
    traces.push({
      universalField: `attributes[${i}]`,
      sourcePath: `${sourcePath}[${i}]`,
      status: name && value ? "mapped" : "missing",
      value: { name, value },
    });
    return {
      id: createId("attr"),
      name,
      value,
      kind: inferAttributeKind(name),
    };
  });
}

export function mapVariant(
  raw: unknown,
  index: number,
  ctx: MappingContext,
): UniversalVariant | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sku = String(o.id ?? o.sku ?? o.mp_id ?? `variant-${index}`);
  const price = normalizePrice(o.promotion_price ?? o.price) ?? 0;
  const salePrice = normalizePrice(o.promotion_price);
  const stock = normalizeNumber(o.quantity);

  const attrs: UniversalAttribute[] = [];
  if (o.options && typeof o.options === "object") {
    const opt = o.options as Record<string, unknown>;
    for (const [name, value] of Object.entries(opt)) {
      attrs.push({
        id: createId("attr"),
        name,
        value: String(value),
        kind: inferAttributeKind(name),
      });
    }
  }

  const image = mapSingleImage(
    o.img_url,
    0,
    ctx.traces,
    `skus[${index}].img_url`,
  );

  traceField(ctx, `variants[${index}].sku`, `skus[${index}].id`, sku);
  traceField(ctx, `variants[${index}].price`, `skus[${index}].price`, price);

  return {
    id: createId("var"),
    sku,
    barcode: typeof o.barcode === "string" ? o.barcode : undefined,
    attributes: attrs,
    price,
    salePrice: salePrice ?? undefined,
    stock: stock ?? undefined,
    weight: normalizeNumber(o.weight) ?? undefined,
    image,
  };
}

export function mapVariants(
  raw: unknown,
  ctx: MappingContext,
): UniversalVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => mapVariant(item, i, ctx))
    .filter((v): v is UniversalVariant => v != null);
}
