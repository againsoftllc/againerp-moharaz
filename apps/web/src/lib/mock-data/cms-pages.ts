export type CmsPage = {
  id: string;
  slug: string;
  title: string;
  metaTitle?: string;
  metaDescription?: string;
  updatedAt: string;
  body: string[];
};

export const cmsPages: CmsPage[] = [
  {
    id: "page_warranty",
    slug: "warranty-policy",
    title: "Warranty Policy",
    metaTitle: "Warranty Policy — AgainERP",
    metaDescription: "Warranty terms for products purchased from AgainERP.",
    updatedAt: "2026-06-13",
    body: [
      "This warranty applies to products purchased from AgainERP and our official outlets.",
      "Keep your original invoice and warranty sticker. For courier delivery, record an unboxing video.",
      "Device warranty claims may require visit to an authorized service center. Repair time is typically 3–45 working days.",
      "Accidental damage, liquid damage, and misuse are excluded unless a separate protection plan applies.",
      "Contact: support@again.com.bd · Phone / WhatsApp: +880 9612-345678",
    ],
  },
  {
    id: "page_privacy",
    slug: "privacy-policy",
    title: "Privacy Policy",
    metaTitle: "Privacy Policy — AgainERP",
    updatedAt: "2026-06-01",
    body: [
      "We collect information you provide at checkout and account registration.",
      "Payment data is processed by secure payment partners; we do not store full card numbers.",
      "You may request account deletion by contacting customer support.",
    ],
  },
  {
    id: "page_terms",
    slug: "terms-and-conditions",
    title: "Terms & Conditions",
    updatedAt: "2026-06-01",
    body: [
      "By using this website you agree to our terms of sale and acceptable use policy.",
      "Prices and availability may change without notice until an order is confirmed.",
    ],
  },
  {
    id: "page_returns",
    slug: "return-and-refund-policy",
    title: "Return and Refund Policy",
    updatedAt: "2026-06-01",
    body: [
      "Returns may be accepted within 7 days for unopened items in original packaging.",
      "Refunds are processed to the original payment method within 7–14 business days after inspection.",
    ],
  },
];

export function getCmsPageBySlug(slug: string) {
  const normalized = slug.toLowerCase();
  return cmsPages.find((p) => p.slug === normalized);
}
