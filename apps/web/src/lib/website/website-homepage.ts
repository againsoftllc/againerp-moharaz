export type HeroObjectFit = "fill" | "fit";

export type HeroSlide = {
  id: string;
  imageUrl: string;
  href: string;
  alt: string;
  objectFit: HeroObjectFit;
  imageWidth?: number | null;
  imageHeight?: number | null;
  /** When true, banner is hidden on the live storefront. */
  hidden?: boolean;
};

export type HeroSection = {
  autoplayMs: number;
  slides: HeroSlide[];
};

export type CategoryCarouselItem = {
  id: string;
  categoryId: string;
  /** Homepage override — empty uses catalog banner/icon. */
  imageUrl?: string;
  /** Custom link — empty uses /{category.slug}. */
  href?: string;
  hidden?: boolean;
};

export type CategoriesSection = {
  /** Hide the whole category carousel on the storefront. */
  hidden?: boolean;
  /** Empty = automatic featured categories from catalog. */
  items: CategoryCarouselItem[];
};

export type BannerSlide = {
  id: string;
  imageUrl: string;
  href: string;
  alt: string;
  objectFit: HeroObjectFit;
  imageWidth?: number | null;
  imageHeight?: number | null;
  hidden?: boolean;
};

export type BannersSection = {
  slides: BannerSlide[];
};

export type FeaturedDefaultSource = "featured" | "newest" | "bestsellers";
export type FeaturedTabMode = "default" | "custom";

export type FeaturedTab = {
  id: string;
  title: string;
  mode: FeaturedTabMode;
  defaultSource: FeaturedDefaultSource;
  productIds: string[];
  hidden?: boolean;
};

export type FeaturedProductsSection = {
  title: string;
  subtitle: string;
  /** Product strip auto-scroll interval; 0 = off. */
  autoplayMs: number;
  tabs: FeaturedTab[];
};

export type BrandCarouselItem = {
  id: string;
  brandId: string;
  /** Homepage override — empty uses catalog logo. */
  imageUrl?: string;
  /** Custom link — empty uses /{brand.slug}. */
  href?: string;
  hidden?: boolean;
};

export type BrandsSection = {
  title: string;
  subtitle: string;
  /** Brand strip auto-scroll interval; 0 = off. */
  autoplayMs: number;
  /** Empty = all active catalog brands. */
  items: BrandCarouselItem[];
};

export type AboutSection = {
  title: string;
  subtitle: string;
  /** When true, storefront shows expand/collapse for body. */
  collapseEnabled: boolean;
  bodyHtml: string;
};

export type SupportSection = {
  title: string;
  subtitle: string;
  phone: string;
  phoneHref: string;
  whatsapp: string;
  whatsappHref: string;
  hours: string;
  phoneIconUrl: string;
  agentImageUrl: string;
  storeLabel: string;
  storeTitle: string;
  storeHref: string;
  storeIconUrl: string;
};

export type SideMenuItem = {
  id: string;
  label: string;
  href: string;
  /** Optional Font Awesome class — when set, overrides iconUrl. */
  icon: string;
  /** Default image icon (original SVG / media). */
  iconUrl: string;
  /** Red highlight on storefront rail. */
  active?: boolean;
  hidden?: boolean;
};

export type SideMenuSection = {
  /** When false, toolbar is hidden on the storefront. */
  enabled: boolean;
  logoUrl: string;
  logoHref: string;
  items: SideMenuItem[];
};

export type HeaderLinkItem = {
  label: string;
  href: string;
  icon: string;
  iconUrl: string;
  hidden?: boolean;
};

export type HeaderMobileSection = {
  /** When false, mobile header is hidden on the storefront. */
  enabled: boolean;
  logoUrl: string;
  logoHref: string;
  searchPlaceholder: string;
};

export type HeaderSection = {
  /** When false, desktop header chrome is hidden on the storefront. */
  enabled: boolean;
  logoUrl: string;
  logoHref: string;
  searchPlaceholder: string;
  orderTrack: HeaderLinkItem;
  pcBuilder: HeaderLinkItem;
  mobile: HeaderMobileSection;
};

export type FooterSocialItem = {
  id: string;
  icon: string;
  href: string;
};

export type FooterMobileSection = {
  enabled: boolean;
  logoUrl: string;
  aboutText: string;
  hideSocials: boolean;
  hideMembership: boolean;
  hidePayment: boolean;
};

export type FooterSection = {
  enabled: boolean;
  logoUrl: string;
  aboutText: string;
  socials: FooterSocialItem[];
  linksTitle: string;
  membershipTitle: string;
  membershipLogoUrl: string;
  headOfficeText: string;
  copyrightText: string;
  paymentImageUrl: string;
  mobile: FooterMobileSection;
};

export type HomepageBodySectionType =
  | "hero"
  | "categories"
  | "banners"
  | "featured"
  | "brands"
  | "about"
  | "support"
  | "category_promo"
  | "video_gallery"
  | "gallery_carousel"
  | "category_rails"
  | "you_may_love";

export type LayoutBlock = {
  id: string;
  type: HomepageBodySectionType | string;
  hidden?: boolean;
};

export type HomepageContent = {
  hero: HeroSection;
  categories: CategoriesSection;
  banners: BannersSection;
  featured: FeaturedProductsSection;
  brands: BrandsSection;
  about: AboutSection;
  support: SupportSection;
  sideMenu: SideMenuSection;
  header: HeaderSection;
  footer: FooterSection;
  layout: LayoutBlock[];
  /** Extra body instances keyed by layout id (primary ids use typed fields). */
  blocks: Record<string, unknown>;
};

export type WebsiteHomepage = {
  id: string;
  companyId: string;
  content: HomepageContent;
  createdAt: string;
  updatedAt: string;
};

export type HomepageContentInput = {
  content: HomepageContent;
};

/** Hero section design aspect (Monarch slider). */
export const HERO_SECTION_ASPECT = 1880 / 1060;

/** Dual banner strip design aspect (Monarch). */
export const BANNER_SECTION_ASPECT = 660 / 418;

export function defaultHeroSlide(partial?: Partial<HeroSlide>): HeroSlide {
  return {
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    imageUrl: "",
    href: "/",
    alt: "",
    objectFit: "fill",
    imageWidth: null,
    imageHeight: null,
    hidden: false,
    ...partial,
  };
}

export function defaultHeroSection(): HeroSection {
  return {
    autoplayMs: 3000,
    slides: [
      {
        id: "s1",
        imageUrl: "/images/image/cache/catalog/website/slider/slider-1880x1060.jpg",
        href: "/offers",
        alt: "Monarch IT — HyperX Cloud II",
        objectFit: "fill",
        imageWidth: 1880,
        imageHeight: 1060,
        hidden: false,
      },
      {
        id: "s2",
        imageUrl: "/images/image/cache/catalog/website/slider/slider-1880x1060.jpg",
        href: "/pc-builder",
        alt: "Monarch IT — Build Your Dream PC",
        objectFit: "fill",
        imageWidth: 1880,
        imageHeight: 1060,
        hidden: false,
      },
    ],
  };
}

export function defaultCategoriesSection(): CategoriesSection {
  return { hidden: false, items: [] };
}

export function defaultCategoryItem(categoryId: string): CategoryCarouselItem {
  return {
    id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    categoryId,
    imageUrl: "",
    href: "",
    hidden: false,
  };
}

export function defaultBannerSlide(partial?: Partial<BannerSlide>): BannerSlide {
  return {
    id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    imageUrl: "",
    href: "/",
    alt: "",
    objectFit: "fill",
    imageWidth: null,
    imageHeight: null,
    hidden: false,
    ...partial,
  };
}

export function defaultBannersSection(): BannersSection {
  return {
    slides: [
      {
        id: "b1",
        imageUrl: "/images/image/cache/catalog/website/banner/slider1-660x418.jpg",
        href: "/ac",
        alt: "Monarch IT — Air Conditioner Offers",
        objectFit: "fill",
        imageWidth: 660,
        imageHeight: 418,
        hidden: false,
      },
      {
        id: "b2",
        imageUrl: "/images/image/cache/catalog/website/banner/slider2-660x418.jpg",
        href: "/offers",
        alt: "Monarch IT — Hot Deals",
        objectFit: "fill",
        imageWidth: 660,
        imageHeight: 418,
        hidden: false,
      },
      {
        id: "b3",
        imageUrl: "/images/image/cache/catalog/website/banner/samrt-tv-exchange1-660x418.jpg",
        href: "/tv",
        alt: "Monarch IT — Smart TV Exchange",
        objectFit: "fill",
        imageWidth: 660,
        imageHeight: 418,
        hidden: false,
      },
    ],
  };
}

export function defaultFeaturedTab(partial?: Partial<FeaturedTab>): FeaturedTab {
  return {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: "Featured",
    mode: "default",
    defaultSource: "featured",
    productIds: [],
    hidden: false,
    ...partial,
  };
}

export function defaultFeaturedSection(): FeaturedProductsSection {
  return {
    title: "Most Wanted",
    subtitle: "Explore Our Best-Selling Deal",
    autoplayMs: 0,
    tabs: [
      {
        id: "t1",
        title: "Featured",
        mode: "default",
        defaultSource: "featured",
        productIds: [],
        hidden: false,
      },
      {
        id: "t2",
        title: "New Arrivals",
        mode: "default",
        defaultSource: "newest",
        productIds: [],
        hidden: false,
      },
      {
        id: "t3",
        title: "Best Sellers",
        mode: "default",
        defaultSource: "bestsellers",
        productIds: [],
        hidden: false,
      },
    ],
  };
}

export function defaultBrandItem(brandId: string): BrandCarouselItem {
  return {
    id: `br${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    brandId,
    imageUrl: "",
    href: "",
    hidden: false,
  };
}

export function defaultBrandsSection(): BrandsSection {
  return {
    title: "Brands We Distribute",
    subtitle: "Official distributor of trusted brands.",
    autoplayMs: 0,
    items: [],
  };
}

export function defaultAboutSection(): AboutSection {
  return {
    title: "Monarch IT Ltd",
    subtitle: "A Trusted Computer Distributor & Retailer in Bangladesh",
    collapseEnabled: true,
    bodyHtml: "",
  };
}

const SUPPORT_IMG = "/images/image/cache/catalog/website/custom";

export function defaultSupportSection(): SupportSection {
  return {
    title: "Support",
    subtitle: "Official distributor of trusted brands.",
    phone: "+8801332-812759",
    phoneHref: "tel:+8801332812759",
    whatsapp: "+8801332-812764",
    whatsappHref: "https://wa.me/8801332812764",
    hours: "10:00 AM - 08:00 PM",
    phoneIconUrl: `${SUPPORT_IMG}/support-phone-image-60x60.png`,
    agentImageUrl: `${SUPPORT_IMG}/support-us-image-140x140.png`,
    storeLabel: "Store Locator",
    storeTitle: "Find our Stores",
    storeHref: "/outlets",
    storeIconUrl: `${SUPPORT_IMG}/support-location-60x60.png`,
  };
}

const SIDE_IMG = "/uploads/media";

export function defaultSideMenuItem(partial?: Partial<SideMenuItem>): SideMenuItem {
  return {
    id: `sm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    label: "Item",
    href: "#",
    icon: "",
    iconUrl: "",
    active: false,
    hidden: false,
    ...partial,
  };
}

export function defaultSideMenuSection(): SideMenuSection {
  return {
    enabled: true,
    logoUrl: `${SIDE_IMG}/sidemenu-monarch-it-icon.png`,
    logoHref: "/",
    items: [
      {
        id: "sm1",
        label: "Phone",
        href: "#",
        icon: "",
        iconUrl: `${SIDE_IMG}/sidemenu-phone-black-icon.svg`,
        active: false,
        hidden: false,
      },
      {
        id: "sm2",
        label: "Message",
        href: "#",
        icon: "",
        iconUrl: `${SIDE_IMG}/sidemenu-message-icon.svg`,
        active: false,
        hidden: false,
      },
      {
        id: "sm3",
        label: "Wishlist",
        href: "/wishlist",
        icon: "",
        iconUrl: `${SIDE_IMG}/sidemenu-wishlist-icon.svg`,
        active: false,
        hidden: false,
      },
      {
        id: "sm4",
        label: "Gift",
        href: "#",
        icon: "",
        iconUrl: `${SIDE_IMG}/sidemenu-gift-black-icon.svg`,
        active: false,
        hidden: false,
      },
      {
        id: "sm5",
        label: "Hot Deals",
        href: "#",
        icon: "",
        iconUrl: `${SIDE_IMG}/sidemenu-fire-black-icon.svg`,
        active: false,
        hidden: false,
      },
      {
        id: "sm6",
        label: "PC Builder",
        href: "/pc-builder",
        icon: "",
        iconUrl: `${SIDE_IMG}/sidemenu-pc-icon.svg`,
        active: true,
        hidden: false,
      },
    ],
  };
}

const HEADER_IMG = "/uploads/media";

export function defaultHeaderLinkItem(partial?: Partial<HeaderLinkItem>): HeaderLinkItem {
  return {
    label: "Link",
    href: "/",
    icon: "",
    iconUrl: "",
    hidden: false,
    ...partial,
  };
}

export function defaultHeaderMobileSection(
  partial?: Partial<HeaderMobileSection>,
): HeaderMobileSection {
  return {
    enabled: true,
    logoUrl: `${HEADER_IMG}/header-monarch-it-logo.png`,
    logoHref: "/",
    searchPlaceholder: "Search Products",
    ...partial,
  };
}

export function defaultHeaderSection(): HeaderSection {
  return {
    enabled: true,
    logoUrl: `${HEADER_IMG}/header-monarch-it-logo.png`,
    logoHref: "/",
    searchPlaceholder: "Search Products",
    orderTrack: {
      label: "Order Track",
      href: "/order-track",
      icon: "",
      iconUrl: `${HEADER_IMG}/header-order-track-icon.svg`,
      hidden: false,
    },
    pcBuilder: {
      label: "PC Builder",
      href: "/pc-builder",
      icon: "",
      iconUrl: "",
      hidden: false,
    },
    mobile: defaultHeaderMobileSection(),
  };
}

const FOOTER_IMG = "/uploads/media";

export function defaultFooterSocialItem(partial?: Partial<FooterSocialItem>): FooterSocialItem {
  return {
    id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    icon: "fa-facebook-f",
    href: "#",
    ...partial,
  };
}

export function defaultFooterMobileSection(
  partial?: Partial<FooterMobileSection>,
): FooterMobileSection {
  return {
    enabled: true,
    logoUrl: "",
    aboutText: "",
    hideSocials: false,
    hideMembership: false,
    hidePayment: false,
    ...partial,
  };
}

export function defaultFooterSection(): FooterSection {
  return {
    enabled: true,
    logoUrl: `${FOOTER_IMG}/footer-monarch-it.png`,
    aboutText:
      "At Monarch IT, we are committed to create the future by delivering genuine tech products, reliable solutions, and unmatched support. Our goal is to inspire growth and success through technology.",
    socials: [
      { id: "s1", icon: "fa-facebook-f", href: "#" },
      { id: "s2", icon: "fa-instagram", href: "#" },
      { id: "s3", icon: "fa-whatsapp", href: "https://wa.me/8801332812764" },
      { id: "s4", icon: "fa-youtube", href: "#" },
    ],
    linksTitle: "Important Links",
    membershipTitle: "Membership",
    membershipLogoUrl: `${FOOTER_IMG}/footer-partnership-logo.png`,
    headOfficeText:
      "Head Office: Bs Bhaban, 2nd Floor, 75-76, New Elephant Road, Dhaka-1205, Bangladesh",
    copyrightText: "© 2026, Monarch IT Ltd, All Rights Reserved.",
    paymentImageUrl: `${FOOTER_IMG}/footer-payment-partner.png`,
    mobile: defaultFooterMobileSection(),
  };
}

export const HOMEPAGE_BODY_SECTION_TYPES: HomepageBodySectionType[] = [
  "hero",
  "categories",
  "banners",
  "featured",
  "brands",
  "about",
  "support",
];

export const HOMEPAGE_BODY_SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  categories: "Categories",
  banners: "Banners",
  featured: "Featured",
  brands: "Brands",
  about: "About",
  support: "Support",
  category_promo: "Category promo",
  video_gallery: "Video gallery",
  gallery_carousel: "Gallery carousel",
  category_rails: "Category rails",
  you_may_love: "You may love",
};

export function defaultHomepageLayout(): LayoutBlock[] {
  return HOMEPAGE_BODY_SECTION_TYPES.map((type) => ({
    id: type,
    type,
    hidden: false,
  }));
}

export function isPrimarySectionId(id: string, type: HomepageBodySectionType | string): boolean {
  return id === type;
}

export function defaultHomepageContent(): HomepageContent {
  return {
    hero: defaultHeroSection(),
    categories: defaultCategoriesSection(),
    banners: defaultBannersSection(),
    featured: defaultFeaturedSection(),
    brands: defaultBrandsSection(),
    about: defaultAboutSection(),
    support: defaultSupportSection(),
    sideMenu: defaultSideMenuSection(),
    header: defaultHeaderSection(),
    footer: defaultFooterSection(),
    layout: defaultHomepageLayout(),
    blocks: {},
  };
}

/** Serialize draft for Monarch live preview (snake_case storefront shape). */
export function homepageContentToStorefrontPayload(content: HomepageContent) {
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
