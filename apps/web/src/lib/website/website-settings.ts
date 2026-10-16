export type WebsiteSettings = {
  id: string;
  siteName: string;
  tagline: string;
  logoUrl: string;
  logoMobileUrl: string;
  faviconUrl: string;
  address: string;
  contactPhone: string;
  contactEmail: string;
  whatsappNumber: string;
  copyrightText: string;
  createdAt: string;
  updatedAt: string;
};

export type WebsiteSettingsInput = Partial<{
  siteName: string;
  tagline: string;
  logoUrl: string;
  logoMobileUrl: string;
  faviconUrl: string;
  address: string;
  contactPhone: string;
  contactEmail: string;
  whatsappNumber: string;
  copyrightText: string;
}>;

export const defaultWebsiteSettingsValues = (): WebsiteSettings => ({
  id: "default",
  siteName: "AgainERP",
  tagline: "",
  logoUrl: "",
  logoMobileUrl: "",
  faviconUrl: "",
  address: "",
  contactPhone: "",
  contactEmail: "",
  whatsappNumber: "",
  copyrightText: "",
  createdAt: "",
  updatedAt: "",
});
