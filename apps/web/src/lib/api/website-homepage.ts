import type {
  AboutSection,
  BannerSlide,
  BannersSection,
  BrandCarouselItem,
  BrandsSection,
  CategoriesSection,
  CategoryCarouselItem,
  FeaturedDefaultSource,
  FeaturedProductsSection,
  FeaturedTab,
  FeaturedTabMode,
  HeaderLinkItem,
  HeaderMobileSection,
  HeaderSection,
  FooterMobileSection,
  FooterSection,
  HomepageBodySectionType,
  HomepageContent,
  HomepageContentInput,
  HeroObjectFit,
  HeroSection,
  HeroSlide,
  LayoutBlock,
  SideMenuItem,
  SideMenuSection,
  SupportSection,
  WebsiteHomepage,
} from "@/lib/website/website-homepage";
import {
  defaultAboutSection,
  defaultBannersSection,
  defaultBrandsSection,
  defaultCategoriesSection,
  defaultFeaturedSection,
  defaultFooterSection,
  defaultHeaderMobileSection,
  defaultHeaderSection,
  defaultHomepageLayout,
  defaultSideMenuSection,
  defaultSupportSection,
  HOMEPAGE_BODY_SECTION_TYPES,
} from "@/lib/website/website-homepage";
import { apiFetch } from "@/lib/api/client";

type ApiHeroSlide = {
  id: string;
  image_url: string;
  href: string;
  alt: string;
  object_fit?: HeroObjectFit;
  image_width?: number | null;
  image_height?: number | null;
  hidden?: boolean;
};

type ApiHeroSection = {
  autoplay_ms: number;
  slides: ApiHeroSlide[];
};

type ApiCategoryItem = {
  id: string;
  category_id: string;
  image_url?: string;
  href?: string;
  hidden?: boolean;
};

type ApiCategoriesSection = {
  hidden?: boolean;
  items?: ApiCategoryItem[];
};

type ApiBannerSlide = {
  id: string;
  image_url: string;
  href: string;
  alt: string;
  object_fit?: HeroObjectFit;
  image_width?: number | null;
  image_height?: number | null;
  hidden?: boolean;
};

type ApiBannersSection = {
  slides?: ApiBannerSlide[];
};

type ApiFeaturedTab = {
  id: string;
  title: string;
  mode?: FeaturedTabMode;
  default_source?: FeaturedDefaultSource;
  product_ids?: string[];
  hidden?: boolean;
};

type ApiFeaturedSection = {
  title?: string;
  subtitle?: string;
  autoplay_ms?: number;
  tabs?: ApiFeaturedTab[];
};

type ApiBrandItem = {
  id: string;
  brand_id: string;
  image_url?: string;
  href?: string;
  hidden?: boolean;
};

type ApiBrandsSection = {
  title?: string;
  subtitle?: string;
  autoplay_ms?: number;
  items?: ApiBrandItem[];
};

type ApiAboutSection = {
  title?: string;
  subtitle?: string;
  collapse_enabled?: boolean;
  body_html?: string;
};

type ApiSupportSection = {
  title?: string;
  subtitle?: string;
  phone?: string;
  phone_href?: string;
  whatsapp?: string;
  whatsapp_href?: string;
  hours?: string;
  phone_icon_url?: string;
  agent_image_url?: string;
  store_label?: string;
  store_title?: string;
  store_href?: string;
  store_icon_url?: string;
};

type ApiSideMenuItem = {
  id: string;
  label?: string;
  href?: string;
  icon?: string;
  icon_url?: string;
  active?: boolean;
  hidden?: boolean;
};

type ApiSideMenuSection = {
  enabled?: boolean;
  logo_url?: string;
  logo_href?: string;
  items?: ApiSideMenuItem[];
};

type ApiHeaderLinkItem = {
  label?: string;
  href?: string;
  icon?: string;
  icon_url?: string;
  hidden?: boolean;
};

type ApiHeaderMobileSection = {
  enabled?: boolean;
  logo_url?: string;
  logo_href?: string;
  search_placeholder?: string;
};

type ApiHeaderSection = {
  enabled?: boolean;
  logo_url?: string;
  logo_href?: string;
  search_placeholder?: string;
  order_track?: ApiHeaderLinkItem;
  pc_builder?: ApiHeaderLinkItem;
  mobile?: ApiHeaderMobileSection;
};

type ApiFooterSocialItem = {
  id: string;
  icon?: string;
  href?: string;
};

type ApiFooterMobileSection = {
  enabled?: boolean;
  logo_url?: string;
  about_text?: string;
  hide_socials?: boolean;
  hide_membership?: boolean;
  hide_payment?: boolean;
};

type ApiFooterSection = {
  enabled?: boolean;
  logo_url?: string;
  about_text?: string;
  socials?: ApiFooterSocialItem[];
  links_title?: string;
  membership_title?: string;
  membership_logo_url?: string;
  head_office_text?: string;
  copyright_text?: string;
  payment_image_url?: string;
  mobile?: ApiFooterMobileSection;
};

type ApiLayoutBlock = {
  id: string;
  type: string;
  hidden?: boolean;
};

type ApiHomepageContent = {
  hero: ApiHeroSection;
  categories?: ApiCategoriesSection;
  banners?: ApiBannersSection;
  featured?: ApiFeaturedSection;
  brands?: ApiBrandsSection;
  about?: ApiAboutSection;
  support?: ApiSupportSection;
  side_menu?: ApiSideMenuSection;
  header?: ApiHeaderSection;
  footer?: ApiFooterSection;
  layout?: ApiLayoutBlock[];
  blocks?: Record<string, unknown>;
};

type ApiWebsiteHomepage = {
  id: string;
  company_id: string;
  content: ApiHomepageContent;
  created_at: string;
  updated_at: string;
};

type ApiWebsiteHomepageResponse = {
  data: ApiWebsiteHomepage;
  errors: string[];
};

function mapSlide(row: ApiHeroSlide): HeroSlide {
  return {
    id: row.id,
    imageUrl: row.image_url,
    href: row.href,
    alt: row.alt,
    objectFit: row.object_fit === "fit" ? "fit" : "fill",
    imageWidth: row.image_width ?? null,
    imageHeight: row.image_height ?? null,
    hidden: Boolean(row.hidden),
  };
}

function mapHero(row: ApiHeroSection): HeroSection {
  return {
    autoplayMs: row.autoplay_ms,
    slides: (row.slides ?? []).map(mapSlide),
  };
}

function mapCategoryItem(row: ApiCategoryItem): CategoryCarouselItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    imageUrl: row.image_url ?? "",
    href: row.href ?? "",
    hidden: Boolean(row.hidden),
  };
}

function mapCategories(row?: ApiCategoriesSection): CategoriesSection {
  if (!row) return defaultCategoriesSection();
  return {
    hidden: Boolean(row.hidden),
    items: (row.items ?? []).map(mapCategoryItem),
  };
}

function mapBannerSlide(row: ApiBannerSlide): BannerSlide {
  return {
    id: row.id,
    imageUrl: row.image_url ?? "",
    href: row.href || "/",
    alt: row.alt ?? "",
    objectFit: row.object_fit === "fit" ? "fit" : "fill",
    imageWidth: row.image_width ?? null,
    imageHeight: row.image_height ?? null,
    hidden: Boolean(row.hidden),
  };
}

function mapBanners(row?: ApiBannersSection): BannersSection {
  if (!row) return defaultBannersSection();
  return {
    slides: (row.slides ?? []).map(mapBannerSlide),
  };
}

function mapFeaturedTab(row: ApiFeaturedTab): FeaturedTab {
  const source = row.default_source;
  const defaultSource: FeaturedDefaultSource =
    source === "newest" || source === "bestsellers" || source === "featured"
      ? source
      : "featured";
  return {
    id: row.id,
    title: row.title || "Featured",
    mode: row.mode === "custom" ? "custom" : "default",
    defaultSource,
    productIds: Array.isArray(row.product_ids) ? row.product_ids : [],
    hidden: Boolean(row.hidden),
  };
}

function mapFeatured(row?: ApiFeaturedSection): FeaturedProductsSection {
  if (!row) return defaultFeaturedSection();
  const ms = Number(row.autoplay_ms);
  return {
    title: row.title || "Most Wanted",
    subtitle: row.subtitle || "Explore Our Best-Selling Deal",
    autoplayMs: Number.isFinite(ms) ? Math.max(0, Math.min(60_000, ms)) : 0,
    tabs: (row.tabs ?? []).map(mapFeaturedTab),
  };
}

function mapBrandItem(row: ApiBrandItem): BrandCarouselItem {
  return {
    id: row.id,
    brandId: row.brand_id,
    imageUrl: row.image_url ?? "",
    href: row.href ?? "",
    hidden: Boolean(row.hidden),
  };
}

function mapBrands(row?: ApiBrandsSection): BrandsSection {
  if (!row) return defaultBrandsSection();
  const ms = Number(row.autoplay_ms);
  return {
    title: row.title || "Brands We Distribute",
    subtitle: row.subtitle || "Official distributor of trusted brands.",
    autoplayMs: Number.isFinite(ms) ? Math.max(0, Math.min(60_000, ms)) : 0,
    items: (row.items ?? []).map(mapBrandItem),
  };
}

function mapAbout(row?: ApiAboutSection): AboutSection {
  if (!row) return defaultAboutSection();
  return {
    title: row.title || "Monarch IT Ltd",
    subtitle: row.subtitle || "A Trusted Computer Distributor & Retailer in Bangladesh",
    collapseEnabled: row.collapse_enabled !== false,
    bodyHtml: row.body_html ?? "",
  };
}

function mapSupport(row?: ApiSupportSection): SupportSection {
  if (!row) return defaultSupportSection();
  const fallback = defaultSupportSection();
  return {
    title: row.title || fallback.title,
    subtitle: row.subtitle || fallback.subtitle,
    phone: row.phone ?? fallback.phone,
    phoneHref: row.phone_href ?? fallback.phoneHref,
    whatsapp: row.whatsapp ?? fallback.whatsapp,
    whatsappHref: row.whatsapp_href ?? fallback.whatsappHref,
    hours: row.hours ?? fallback.hours,
    phoneIconUrl: row.phone_icon_url ?? fallback.phoneIconUrl,
    agentImageUrl: row.agent_image_url ?? fallback.agentImageUrl,
    storeLabel: row.store_label ?? fallback.storeLabel,
    storeTitle: row.store_title ?? fallback.storeTitle,
    storeHref: row.store_href ?? fallback.storeHref,
    storeIconUrl: row.store_icon_url ?? fallback.storeIconUrl,
  };
}

function mapSideMenuItem(row: ApiSideMenuItem): SideMenuItem {
  return {
    id: row.id,
    label: row.label ?? "",
    href: row.href ?? "#",
    icon: row.icon ?? "",
    iconUrl: row.icon_url ?? "",
    active: Boolean(row.active),
    hidden: Boolean(row.hidden),
  };
}

function mapSideMenu(row?: ApiSideMenuSection): SideMenuSection {
  if (!row) return defaultSideMenuSection();
  const fallback = defaultSideMenuSection();
  return {
    enabled: row.enabled !== false,
    logoUrl: row.logo_url ?? fallback.logoUrl,
    logoHref: row.logo_href ?? fallback.logoHref,
    items: (row.items ?? []).map(mapSideMenuItem),
  };
}

function mapHeaderLink(
  row: ApiHeaderLinkItem | undefined,
  fallback: HeaderLinkItem,
): HeaderLinkItem {
  if (!row) return fallback;
  return {
    label: row.label ?? fallback.label,
    href: row.href ?? fallback.href,
    icon: row.icon ?? fallback.icon,
    iconUrl: row.icon_url ?? fallback.iconUrl,
    hidden: Boolean(row.hidden),
  };
}

function mapHeaderMobile(row?: ApiHeaderMobileSection): HeaderMobileSection {
  if (!row) return defaultHeaderMobileSection();
  const fallback = defaultHeaderMobileSection();
  return {
    enabled: row.enabled !== false,
    logoUrl: row.logo_url ?? fallback.logoUrl,
    logoHref: row.logo_href ?? fallback.logoHref,
    searchPlaceholder: row.search_placeholder ?? fallback.searchPlaceholder,
  };
}

function mapHeader(row?: ApiHeaderSection): HeaderSection {
  if (!row) return defaultHeaderSection();
  const fallback = defaultHeaderSection();
  return {
    enabled: row.enabled !== false,
    logoUrl: row.logo_url ?? fallback.logoUrl,
    logoHref: row.logo_href ?? fallback.logoHref,
    searchPlaceholder: row.search_placeholder ?? fallback.searchPlaceholder,
    orderTrack: mapHeaderLink(row.order_track, fallback.orderTrack),
    pcBuilder: mapHeaderLink(row.pc_builder, fallback.pcBuilder),
    mobile: mapHeaderMobile(row.mobile),
  };
}

function mapFooterMobile(row?: ApiFooterMobileSection): FooterMobileSection {
  const fallback = defaultFooterSection().mobile;
  if (!row) return fallback;
  return {
    enabled: row.enabled !== false,
    logoUrl: row.logo_url ?? fallback.logoUrl,
    aboutText: row.about_text ?? fallback.aboutText,
    hideSocials: Boolean(row.hide_socials),
    hideMembership: Boolean(row.hide_membership),
    hidePayment: Boolean(row.hide_payment),
  };
}

function mapFooter(row?: ApiFooterSection): FooterSection {
  if (!row) return defaultFooterSection();
  const fallback = defaultFooterSection();
  return {
    enabled: row.enabled !== false,
    logoUrl: row.logo_url ?? fallback.logoUrl,
    aboutText: row.about_text ?? fallback.aboutText,
    socials: (row.socials ?? fallback.socials).map((s, i) => ({
      id: s.id || `s${i + 1}`,
      icon: s.icon ?? "",
      href: s.href ?? "#",
    })),
    linksTitle: row.links_title ?? fallback.linksTitle,
    membershipTitle: row.membership_title ?? fallback.membershipTitle,
    membershipLogoUrl: row.membership_logo_url ?? fallback.membershipLogoUrl,
    headOfficeText: row.head_office_text ?? fallback.headOfficeText,
    copyrightText: row.copyright_text ?? fallback.copyrightText,
    paymentImageUrl: row.payment_image_url ?? fallback.paymentImageUrl,
    mobile: mapFooterMobile(row.mobile),
  };
}

function mapLayout(rows?: ApiLayoutBlock[]): LayoutBlock[] {
  if (!rows?.length) return defaultHomepageLayout();
  const allowed = new Set<string>(HOMEPAGE_BODY_SECTION_TYPES);
  return rows
    .filter((r) => r.id && allowed.has(r.type))
    .map((r) => ({
      id: r.id,
      type: r.type as HomepageBodySectionType,
      hidden: Boolean(r.hidden),
    }));
}

function mapContent(row: ApiHomepageContent): HomepageContent {
  return {
    hero: mapHero(row.hero),
    categories: mapCategories(row.categories),
    banners: mapBanners(row.banners),
    featured: mapFeatured(row.featured),
    brands: mapBrands(row.brands),
    about: mapAbout(row.about),
    support: mapSupport(row.support),
    sideMenu: mapSideMenu(row.side_menu),
    header: mapHeader(row.header),
    footer: mapFooter(row.footer),
    layout: mapLayout(row.layout),
    blocks: row.blocks && typeof row.blocks === "object" ? { ...row.blocks } : {},
  };
}

export function apiHomepageToHomepage(row: ApiWebsiteHomepage): WebsiteHomepage {
  return {
    id: row.id,
    companyId: row.company_id,
    content: mapContent(row.content),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApiContent(content: HomepageContent): ApiHomepageContent {
  return {
    hero: {
      autoplay_ms: content.hero.autoplayMs,
      slides: content.hero.slides.map((s) => ({
        id: s.id,
        image_url: s.imageUrl,
        href: s.href,
        alt: s.alt,
        object_fit: s.objectFit ?? "fill",
        image_width: s.imageWidth ?? null,
        image_height: s.imageHeight ?? null,
        hidden: Boolean(s.hidden),
      })),
    },
    categories: {
      hidden: Boolean(content.categories?.hidden),
      items: (content.categories?.items ?? []).map((item) => ({
        id: item.id,
        category_id: item.categoryId,
        image_url: item.imageUrl ?? "",
        href: item.href ?? "",
        hidden: Boolean(item.hidden),
      })),
    },
    banners: {
      slides: (content.banners?.slides ?? []).map((s) => ({
        id: s.id,
        image_url: s.imageUrl,
        href: s.href,
        alt: s.alt,
        object_fit: s.objectFit ?? "fill",
        image_width: s.imageWidth ?? null,
        image_height: s.imageHeight ?? null,
        hidden: Boolean(s.hidden),
      })),
    },
    featured: {
      title: content.featured?.title ?? "Most Wanted",
      subtitle: content.featured?.subtitle ?? "Explore Our Best-Selling Deal",
      autoplay_ms: content.featured?.autoplayMs ?? 0,
      tabs: (content.featured?.tabs ?? []).map((tab) => ({
        id: tab.id,
        title: tab.title,
        mode: tab.mode,
        default_source: tab.defaultSource,
        product_ids: tab.productIds ?? [],
        hidden: Boolean(tab.hidden),
      })),
    },
    brands: {
      title: content.brands?.title ?? "Brands We Distribute",
      subtitle: content.brands?.subtitle ?? "Official distributor of trusted brands.",
      autoplay_ms: content.brands?.autoplayMs ?? 0,
      items: (content.brands?.items ?? []).map((item) => ({
        id: item.id,
        brand_id: item.brandId,
        image_url: item.imageUrl ?? "",
        href: item.href ?? "",
        hidden: Boolean(item.hidden),
      })),
    },
    about: {
      title: content.about?.title ?? "Monarch IT Ltd",
      subtitle:
        content.about?.subtitle ?? "A Trusted Computer Distributor & Retailer in Bangladesh",
      collapse_enabled: content.about?.collapseEnabled ?? true,
      body_html: content.about?.bodyHtml ?? "",
    },
    support: {
      title: content.support?.title ?? "Support",
      subtitle: content.support?.subtitle ?? "Official distributor of trusted brands.",
      phone: content.support?.phone ?? "",
      phone_href: content.support?.phoneHref ?? "",
      whatsapp: content.support?.whatsapp ?? "",
      whatsapp_href: content.support?.whatsappHref ?? "",
      hours: content.support?.hours ?? "",
      phone_icon_url: content.support?.phoneIconUrl ?? "",
      agent_image_url: content.support?.agentImageUrl ?? "",
      store_label: content.support?.storeLabel ?? "",
      store_title: content.support?.storeTitle ?? "",
      store_href: content.support?.storeHref ?? "",
      store_icon_url: content.support?.storeIconUrl ?? "",
    },
    side_menu: {
      enabled: content.sideMenu?.enabled !== false,
      logo_url: content.sideMenu?.logoUrl ?? "",
      logo_href: content.sideMenu?.logoHref ?? "/",
      items: (content.sideMenu?.items ?? []).map((item) => ({
        id: item.id,
        label: item.label,
        href: item.href,
        icon: item.icon ?? "",
        icon_url: item.iconUrl,
        active: Boolean(item.active),
        hidden: Boolean(item.hidden),
      })),
    },
    header: {
      enabled: content.header?.enabled !== false,
      logo_url: content.header?.logoUrl ?? "",
      logo_href: content.header?.logoHref ?? "/",
      search_placeholder: content.header?.searchPlaceholder ?? "Search Products",
      order_track: {
        label: content.header?.orderTrack?.label ?? "Order Track",
        href: content.header?.orderTrack?.href ?? "/order-track",
        icon: content.header?.orderTrack?.icon ?? "",
        icon_url: content.header?.orderTrack?.iconUrl ?? "",
        hidden: Boolean(content.header?.orderTrack?.hidden),
      },
      pc_builder: {
        label: content.header?.pcBuilder?.label ?? "PC Builder",
        href: content.header?.pcBuilder?.href ?? "/pc-builder",
        icon: content.header?.pcBuilder?.icon ?? "",
        icon_url: content.header?.pcBuilder?.iconUrl ?? "",
        hidden: Boolean(content.header?.pcBuilder?.hidden),
      },
      mobile: {
        enabled: content.header?.mobile?.enabled !== false,
        logo_url: content.header?.mobile?.logoUrl ?? "",
        logo_href: content.header?.mobile?.logoHref ?? "/",
        search_placeholder: content.header?.mobile?.searchPlaceholder ?? "Search Products",
      },
    },
    footer: {
      enabled: content.footer?.enabled !== false,
      logo_url: content.footer?.logoUrl ?? "",
      about_text: content.footer?.aboutText ?? "",
      socials: (content.footer?.socials ?? []).map((s) => ({
        id: s.id,
        icon: s.icon,
        href: s.href,
      })),
      links_title: content.footer?.linksTitle ?? "Important Links",
      membership_title: content.footer?.membershipTitle ?? "Membership",
      membership_logo_url: content.footer?.membershipLogoUrl ?? "",
      head_office_text: content.footer?.headOfficeText ?? "",
      copyright_text: content.footer?.copyrightText ?? "",
      payment_image_url: content.footer?.paymentImageUrl ?? "",
      mobile: {
        enabled: content.footer?.mobile?.enabled !== false,
        logo_url: content.footer?.mobile?.logoUrl ?? "",
        about_text: content.footer?.mobile?.aboutText ?? "",
        hide_socials: Boolean(content.footer?.mobile?.hideSocials),
        hide_membership: Boolean(content.footer?.mobile?.hideMembership),
        hide_payment: Boolean(content.footer?.mobile?.hidePayment),
      },
    },
    layout: (content.layout?.length ? content.layout : defaultHomepageLayout()).map((b) => ({
      id: b.id,
      type: b.type,
      hidden: Boolean(b.hidden),
    })),
    blocks: content.blocks ?? {},
  };
}

export async function fetchWebsiteHomepage(): Promise<WebsiteHomepage> {
  const res = await apiFetch<ApiWebsiteHomepageResponse>("/api/v1/website/homepage");
  return apiHomepageToHomepage(res.data);
}

export async function updateWebsiteHomepage(input: HomepageContentInput): Promise<WebsiteHomepage> {
  const res = await apiFetch<ApiWebsiteHomepageResponse>("/api/v1/website/homepage", {
    method: "PATCH",
    body: JSON.stringify({ content: toApiContent(input.content) }),
  });
  return apiHomepageToHomepage(res.data);
}
