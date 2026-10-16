import type {
  AboutSection,
  BannersSection,
  BrandsSection,
  CategoriesSection,
  FeaturedProductsSection,
  HeroSection,
  HomepageBodySectionType,
  HomepageContent,
  LayoutBlock,
  SupportSection,
} from "@/lib/website/website-homepage";
import {
  defaultAboutSection,
  defaultBannersSection,
  defaultBrandsSection,
  defaultCategoriesSection,
  defaultFeaturedSection,
  defaultHeroSection,
  defaultHomepageLayout,
  defaultSupportSection,
  HOMEPAGE_BODY_SECTION_TYPES,
  isPrimarySectionId,
} from "@/lib/website/website-homepage";

export type LayoutAction =
  | { action: "moveUp"; instanceId: string }
  | { action: "moveDown"; instanceId: string }
  | { action: "duplicate"; instanceId: string }
  | { action: "toggleHidden"; instanceId: string }
  | { action: "delete"; instanceId: string }
  | { action: "add"; type: HomepageBodySectionType; afterInstanceId?: string | null }
  | { action: "edit"; instanceId: string };

function newInstanceId(type: HomepageBodySectionType): string {
  return `${type}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function ensureHomepageLayout(content: HomepageContent): HomepageContent {
  const layout =
    Array.isArray(content.layout) && content.layout.length > 0
      ? content.layout
      : defaultHomepageLayout();
  return {
    ...content,
    layout,
    blocks: content.blocks && typeof content.blocks === "object" ? content.blocks : {},
  };
}

export function findLayoutBlock(
  content: HomepageContent,
  instanceId: string,
): LayoutBlock | undefined {
  return (content.layout ?? []).find((b) => b.id === instanceId);
}

export function defaultPayloadForType(type: HomepageBodySectionType): unknown {
  switch (type) {
    case "hero":
      return defaultHeroSection();
    case "categories":
      return defaultCategoriesSection();
    case "banners":
      return defaultBannersSection();
    case "featured":
      return defaultFeaturedSection();
    case "brands":
      return defaultBrandsSection();
    case "about":
      return defaultAboutSection();
    case "support":
      return defaultSupportSection();
    default:
      return {};
  }
}

/** Read section data for a layout instance (primary typed field or blocks[id]). */
export function getSectionData(
  content: HomepageContent,
  type: HomepageBodySectionType,
  instanceId: string,
): unknown {
  if (isPrimarySectionId(instanceId, type)) {
    switch (type) {
      case "hero":
        return content.hero;
      case "categories":
        return content.categories;
      case "banners":
        return content.banners;
      case "featured":
        return content.featured;
      case "brands":
        return content.brands;
      case "about":
        return content.about;
      case "support":
        return content.support;
    }
  }
  return content.blocks?.[instanceId] ?? defaultPayloadForType(type);
}

/** Write section data for a layout instance. */
export function setSectionData(
  content: HomepageContent,
  type: HomepageBodySectionType,
  instanceId: string,
  data: unknown,
): HomepageContent {
  if (isPrimarySectionId(instanceId, type)) {
    switch (type) {
      case "hero":
        return { ...content, hero: data as HeroSection };
      case "categories":
        return { ...content, categories: data as CategoriesSection };
      case "banners":
        return { ...content, banners: data as BannersSection };
      case "featured":
        return { ...content, featured: data as FeaturedProductsSection };
      case "brands":
        return { ...content, brands: data as BrandsSection };
      case "about":
        return { ...content, about: data as AboutSection };
      case "support":
        return { ...content, support: data as SupportSection };
    }
  }
  return {
    ...content,
    blocks: { ...content.blocks, [instanceId]: data },
  };
}

/**
 * Build a HomepageContent view for a drawer that always edits `content[type]`
 * while writing back to the correct instance via setSectionData.
 */
export function contentForDrawer(
  content: HomepageContent,
  type: HomepageBodySectionType,
  instanceId: string,
): HomepageContent {
  const data = getSectionData(content, type, instanceId);
  return setSectionData(content, type, type, data);
}

export function applyDrawerChange(
  content: HomepageContent,
  type: HomepageBodySectionType,
  instanceId: string,
  nextDrawerContent: HomepageContent,
): HomepageContent {
  const data = getSectionData(nextDrawerContent, type, type);
  return setSectionData(content, type, instanceId, data);
}

export function applyLayoutAction(
  content: HomepageContent,
  action: LayoutAction,
): HomepageContent {
  const base = ensureHomepageLayout(content);
  const layout = [...base.layout];
  const blocks = { ...base.blocks };

  const indexOf = (id: string) => layout.findIndex((b) => b.id === id);

  if (action.action === "moveUp" || action.action === "moveDown") {
    const i = indexOf(action.instanceId);
    if (i < 0) return base;
    const j = action.action === "moveUp" ? i - 1 : i + 1;
    if (j < 0 || j >= layout.length) return base;
    const next = [...layout];
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
    return { ...base, layout: next };
  }

  if (action.action === "toggleHidden") {
    return {
      ...base,
      layout: layout.map((b) =>
        b.id === action.instanceId ? { ...b, hidden: !b.hidden } : b,
      ),
    };
  }

  if (action.action === "delete") {
    const block = layout.find((b) => b.id === action.instanceId);
    if (!block) return base;
    const nextLayout = layout.filter((b) => b.id !== action.instanceId);
    if (!isPrimarySectionId(action.instanceId, block.type)) {
      delete blocks[action.instanceId];
    }
    return { ...base, layout: nextLayout, blocks };
  }

  if (action.action === "duplicate") {
    const i = indexOf(action.instanceId);
    if (i < 0) return base;
    const source = layout[i]!;
    const newId = newInstanceId(source.type);
    const payload = cloneJson(getSectionData(base, source.type, source.id));
    blocks[newId] = payload;
    const nextLayout = [...layout];
    nextLayout.splice(i + 1, 0, { id: newId, type: source.type, hidden: false });
    return { ...base, layout: nextLayout, blocks };
  }

  if (action.action === "add") {
    if (!HOMEPAGE_BODY_SECTION_TYPES.includes(action.type)) return base;
    const newId = newInstanceId(action.type);
    blocks[newId] = cloneJson(defaultPayloadForType(action.type));
    const entry: LayoutBlock = { id: newId, type: action.type, hidden: false };
    const after = action.afterInstanceId
      ? indexOf(action.afterInstanceId)
      : layout.length - 1;
    const nextLayout = [...layout];
    if (after < 0) nextLayout.push(entry);
    else nextLayout.splice(after + 1, 0, entry);
    return { ...base, layout: nextLayout, blocks };
  }

  return base;
}

/** Snake_case payload for blocks (preview/API). */
export function blocksToStorefrontPayload(blocks: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(blocks ?? {})) {
    out[id] = value;
  }
  return out;
}
