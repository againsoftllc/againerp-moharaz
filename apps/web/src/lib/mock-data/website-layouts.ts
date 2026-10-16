export type HeaderStyle = "minimal" | "standard" | "mega" | "centered" | "sidebar";
export type FooterStyle = "minimal" | "standard" | "extended" | "dark";
export type SidebarPosition = "none" | "left" | "right";
export type LayoutStatus = "active" | "draft";

export interface WebsiteLayout {
  id: string;
  name: string;
  description: string;
  headerStyle: HeaderStyle;
  footerStyle: FooterStyle;
  sidebarPosition: SidebarPosition;
  status: LayoutStatus;
  isDefault: boolean;
  pagesCount: number;
  thumbnail: string;
  createdAt: string;
  updatedAt: string;
}

export const mockWebsiteLayouts: WebsiteLayout[] = [
  {
    id: "layout-1",
    name: "Default Layout",
    description: "Standard header + extended footer, no sidebar. Used for most pages.",
    headerStyle: "standard",
    footerStyle: "extended",
    sidebarPosition: "none",
    status: "active",
    isDefault: true,
    pagesCount: 5,
    thumbnail: "default",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-06-15T10:00:00Z",
  },
  {
    id: "layout-2",
    name: "Landing Page",
    description: "Minimal header + minimal footer. No distractions for conversion pages.",
    headerStyle: "minimal",
    footerStyle: "minimal",
    sidebarPosition: "none",
    status: "active",
    isDefault: false,
    pagesCount: 2,
    thumbnail: "landing",
    createdAt: "2026-02-10T00:00:00Z",
    updatedAt: "2026-06-10T14:00:00Z",
  },
  {
    id: "layout-3",
    name: "Blog / Article",
    description: "Standard header + sidebar on right for related posts and widgets.",
    headerStyle: "standard",
    footerStyle: "standard",
    sidebarPosition: "right",
    status: "active",
    isDefault: false,
    pagesCount: 1,
    thumbnail: "blog",
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-05-20T09:00:00Z",
  },
  {
    id: "layout-4",
    name: "Shop / Ecommerce",
    description: "Mega menu header + dark footer. Optimized for product browsing.",
    headerStyle: "mega",
    footerStyle: "dark",
    sidebarPosition: "left",
    status: "active",
    isDefault: false,
    pagesCount: 3,
    thumbnail: "shop",
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-06-18T11:00:00Z",
  },
  {
    id: "layout-5",
    name: "Full Width",
    description: "Centered logo header + standard footer. Great for visual storytelling.",
    headerStyle: "centered",
    footerStyle: "standard",
    sidebarPosition: "none",
    status: "draft",
    isDefault: false,
    pagesCount: 0,
    thumbnail: "fullwidth",
    createdAt: "2026-06-19T00:00:00Z",
    updatedAt: "2026-06-19T00:00:00Z",
  },
];

export const HEADER_STYLE_LABELS: Record<HeaderStyle, string> = {
  minimal: "Minimal",
  standard: "Standard",
  mega: "Mega Menu",
  centered: "Centered",
  sidebar: "Sidebar",
};

export const FOOTER_STYLE_LABELS: Record<FooterStyle, string> = {
  minimal: "Minimal",
  standard: "Standard",
  extended: "Extended",
  dark: "Dark",
};

export const SIDEBAR_LABELS: Record<SidebarPosition, string> = {
  none: "No Sidebar",
  left: "Left Sidebar",
  right: "Right Sidebar",
};
