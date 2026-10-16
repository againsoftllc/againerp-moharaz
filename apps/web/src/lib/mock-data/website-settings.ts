export interface WebsiteSettings {
  siteName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string; // Hex code
  secondaryColor: string; // Hex code
  fontFamily: string;
  googleAnalyticsId?: string;
  facebookPixelId?: string;
  customHeaderScripts?: string;
  customFooterScripts?: string;
  socialLinks: {
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
    instagram?: string;
  };
  companyId: string;
}

export const mockWebsiteSettings: WebsiteSettings = {
  siteName: "TechGadgets BD",
  tagline: "Your Staged Hardware & Enterprise IT Procurement Partner",
  logoUrl: "/images/logo-techgadgets.png",
  faviconUrl: "/images/favicon.ico",
  primaryColor: "#0f172a", // slate-900
  secondaryColor: "#3b82f6", // blue-500
  fontFamily: "Inter, sans-serif",
  googleAnalyticsId: "UA-987654321-1",
  facebookPixelId: "FB-123456789",
  customHeaderScripts: "<!-- Global header scripts -->\n<script>\n  console.log('TechGadgets Analytics Loaded');\n</script>",
  customFooterScripts: "<!-- Global footer scripts -->",
  socialLinks: {
    facebook: "https://facebook.com/techgadgetsbd",
    twitter: "https://twitter.com/techgadgetsbd",
    linkedin: "https://linkedin.com/company/techgadgetsbd",
    youtube: "https://youtube.com/techgadgetsbd",
  },
  companyId: "co2",
};
