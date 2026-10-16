import { suppliersSeed } from "./suppliers";

export type PartnerRole =
  | "vendor"
  | "customer"
  | "retailer"
  | "wholesaler"
  | "distributor"
  | "channel_partner"
  | "dropship"
  | "franchisee"
  | "affiliate";

export type PartnerStatus =
  | "draft"
  | "pending"
  | "active"
  | "on_hold"
  | "blocked"
  | "archived";

export type PartnerTerms = {
  role: PartnerRole;
  paymentTerms: string;
  paymentTermsDays: number;
  currencyCode: string;
  leadTimeDays?: number;
  minOrderValue?: number;
  incoterms?: string;
  creditLimit?: number;
};

export type BusinessPartner = {
  id: string;
  partnerCode: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  territory: string;
  roles: PartnerRole[];
  primaryRole: PartnerRole;
  status: PartnerStatus;
  tierCode?: string;
  rating: number;
  creditLimit?: number;
  creditHold: boolean;
  spendYtd: number;
  revenueYtd: number;
  openPos: number;
  openSos: number;
  assignedTo?: string;
  taxId?: string;
  website?: string;
  terms: PartnerTerms[];
  notes?: string;
  contactId?: string;
  supplierId?: string;
  updatedAt: string;
};

export const PARTNER_ROLE_LABELS: Record<PartnerRole, string> = {
  vendor: "Vendor",
  customer: "B2B Customer",
  retailer: "Retailer",
  wholesaler: "Wholesaler",
  distributor: "Distributor",
  channel_partner: "Channel",
  dropship: "Dropship",
  franchisee: "Franchisee",
  affiliate: "Affiliate",
};

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  active: "Active",
  on_hold: "On hold",
  blocked: "Blocked",
  archived: "Archived",
};

export const PARTNER_NAV_ITEMS = [
  { id: "overview", label: "Overview", href: "/partners" },
  { id: "directory", label: "Directory", href: "/partners/directory" },
  { id: "onboarding", label: "Onboarding", href: "/partners/onboarding" },
  { id: "tiers", label: "Tiers", href: "/partners/tiers" },
  { id: "territories", label: "Territories", href: "/partners/territories" },
  { id: "performance", label: "Performance", href: "/partners/performance" },
  { id: "settings", label: "Settings", href: "/partners/settings" },
] as const;

export const partnerKpis = [
  { label: "Active partners", value: "28", sub: "6 roles represented" },
  { label: "Pending onboarding", value: 4, sub: "Review queue", alert: true },
  { label: "Vendors", value: 12, sub: "Procurement" },
  { label: "Wholesale accounts", value: 9, sub: "Sales channel" },
];

export const partnersByRoleChart = [
  { role: "Vendor", count: 12 },
  { role: "Wholesaler", count: 9 },
  { role: "Retailer", count: 7 },
  { role: "Distributor", count: 5 },
  { role: "Channel", count: 4 },
];

export const topVendorSpendChart = [
  { name: "Shenzhen Electronics", spend: 5400000 },
  { name: "TechPro Distribution", spend: 4200000 },
  { name: "UrbanWear Mfg", spend: 3100000 },
  { name: "GlowUp Imports", spend: 1860000 },
  { name: "National Wholesale", spend: 1240000 },
];

export const partnerDemoHints = [
  {
    label: "Multi-role partner — vendor + wholesaler",
    hint: "TechPro — view drawer Roles & Terms tabs",
    href: "/partners/directory?view=bp_001",
  },
  {
    label: "Retailer on credit hold",
    hint: "UrbanWear Retail — blocked new SO",
    href: "/partners/directory?view=bp_007",
  },
  {
    label: "Vendor directory filter",
    hint: "Filter by vendor role only",
    href: "/partners/directory?role=vendor",
  },
  {
    label: "Wholesale tier — WHOLESALE-A",
    hint: "View tier definition and assigned partners",
    href: "/partners/tiers?view=tier_001",
  },
  {
    label: "Vendor catalog — TechPro",
    hint: "Mapped SKUs, feed sync, map product",
    href: "/partners/directory?view=bp_001&tab=catalog",
  },
];

function mapSupplierStatus(status: string): PartnerStatus {
  if (status === "blocked") return "blocked";
  return "active";
}

function vendorFromSupplier(
  s: (typeof suppliersSeed)[0],
  extra?: Partial<BusinessPartner>,
): BusinessPartner {
  return {
    id: `bp_${s.id.replace("sup_", "")}`,
    partnerCode: s.vendorCode.replace("VND-", "BP-"),
    name: s.name,
    email: s.email,
    phone: s.phone,
    country: s.country,
    territory: s.country === "Bangladesh" ? "National" : "International",
    roles: ["vendor"],
    primaryRole: "vendor",
    status: mapSupplierStatus(s.status),
    rating: s.rating,
    spendYtd: s.spendYtd,
    revenueYtd: 0,
    openPos: s.openPos,
    openSos: 0,
    assignedTo: s.buyerName,
    taxId: s.taxId,
    website: s.website,
    creditHold: false,
    terms: [
      {
        role: "vendor",
        paymentTerms: s.paymentTerms,
        paymentTermsDays: s.paymentTerms.includes("30") ? 30 : s.paymentTerms.includes("45") ? 45 : 0,
        currencyCode: s.currency ?? "BDT",
        leadTimeDays: s.leadTimeDays,
        minOrderValue: s.minOrderValue,
        incoterms: s.incoterms,
      },
    ],
    supplierId: s.id,
    contactId: `contact_${s.id}`,
    updatedAt: s.updatedAt,
    ...extra,
  };
}

const extraPartners: BusinessPartner[] = [
  {
    id: "bp_001",
    partnerCode: "BP-TECH",
    name: "TechPro Distribution Ltd",
    email: "orders@techpro.bd",
    phone: "+880 1711-000001",
    country: "Bangladesh",
    territory: "Dhaka",
    roles: ["vendor", "wholesaler"],
    primaryRole: "vendor",
    status: "active",
    tierCode: "WHOLESALE-A",
    rating: 4.6,
    creditLimit: 2000000,
    creditHold: false,
    spendYtd: 4200000,
    revenueYtd: 890000,
    openPos: 2,
    openSos: 1,
    assignedTo: "Rahim Uddin",
    taxId: "BIN-123456789",
    website: "https://techpro.bd",
    terms: [
      {
        role: "vendor",
        paymentTerms: "Net 30",
        paymentTermsDays: 30,
        currencyCode: "BDT",
        leadTimeDays: 7,
        minOrderValue: 50000,
        incoterms: "FOB Dhaka",
      },
      {
        role: "wholesaler",
        paymentTerms: "Net 15",
        paymentTermsDays: 15,
        currencyCode: "BDT",
        creditLimit: 2000000,
        minOrderValue: 100000,
      },
    ],
    supplierId: "sup_001",
    contactId: "contact_sup_001",
    updatedAt: "2026-06-15",
    notes: "⭐ Demo: vendor + wholesaler dual role",
  },
  {
    id: "bp_006",
    partnerCode: "BP-NAT-WHL",
    name: "National Wholesale Hub",
    email: "trade@nationalwholesale.bd",
    phone: "+880 1711-000106",
    country: "Bangladesh",
    territory: "National",
    roles: ["wholesaler", "distributor"],
    primaryRole: "wholesaler",
    status: "active",
    tierCode: "WHOLESALE-B",
    rating: 4.4,
    creditLimit: 5000000,
    creditHold: false,
    spendYtd: 0,
    revenueYtd: 12400000,
    openPos: 0,
    openSos: 5,
    assignedTo: "Karim Ahmed",
    terms: [
      {
        role: "wholesaler",
        paymentTerms: "Net 15",
        paymentTermsDays: 15,
        currencyCode: "BDT",
        creditLimit: 5000000,
        minOrderValue: 200000,
      },
      {
        role: "distributor",
        paymentTerms: "Net 30",
        paymentTermsDays: 30,
        currencyCode: "BDT",
        creditLimit: 8000000,
      },
    ],
    updatedAt: "2026-06-14",
  },
  {
    id: "bp_007",
    partnerCode: "BP-URB-RET",
    name: "UrbanWear Retail Ltd",
    email: "retail@urbanwear.com",
    phone: "+880 1711-000207",
    country: "Bangladesh",
    territory: "Chittagong",
    roles: ["retailer", "customer"],
    primaryRole: "retailer",
    status: "on_hold",
    tierCode: "RETAIL-STD",
    rating: 3.9,
    creditLimit: 800000,
    creditHold: true,
    spendYtd: 0,
    revenueYtd: 2100000,
    openPos: 0,
    openSos: 2,
    assignedTo: "Sadia Khan",
    terms: [
      {
        role: "retailer",
        paymentTerms: "Net 7",
        paymentTermsDays: 7,
        currencyCode: "BDT",
        creditLimit: 800000,
      },
    ],
    updatedAt: "2026-06-13",
    notes: "Credit hold — demo SO block",
  },
  {
    id: "bp_008",
    partnerCode: "BP-CHN-01",
    name: "Channel Partner BD",
    email: "partner@channelbd.com",
    phone: "+880 1711-000308",
    country: "Bangladesh",
    territory: "Dhaka",
    roles: ["channel_partner"],
    primaryRole: "channel_partner",
    status: "active",
    rating: 4.1,
    creditHold: false,
    spendYtd: 0,
    revenueYtd: 3200000,
    openPos: 0,
    openSos: 0,
    assignedTo: "CRM Team",
    terms: [
      {
        role: "channel_partner",
        paymentTerms: "Commission",
        paymentTermsDays: 0,
        currencyCode: "BDT",
      },
    ],
    updatedAt: "2026-06-12",
  },
  {
    id: "bp_009",
    partnerCode: "BP-DS-01",
    name: "FastShip Dropship Co.",
    email: "ops@fastship.bd",
    phone: "+880 1711-000409",
    country: "Bangladesh",
    territory: "Online",
    roles: ["dropship", "vendor"],
    primaryRole: "dropship",
    status: "active",
    rating: 3.7,
    creditHold: false,
    spendYtd: 980000,
    revenueYtd: 0,
    openPos: 1,
    openSos: 0,
    terms: [
      {
        role: "dropship",
        paymentTerms: "Net 14",
        paymentTermsDays: 14,
        currencyCode: "BDT",
        leadTimeDays: 2,
      },
    ],
    updatedAt: "2026-06-11",
  },
  {
    id: "bp_010",
    partnerCode: "BP-FRN-01",
    name: "StyleMart Franchise — Gulshan",
    email: "gulshan@stylemart.bd",
    phone: "+880 1711-000510",
    country: "Bangladesh",
    territory: "Dhaka · Gulshan",
    roles: ["franchisee", "retailer"],
    primaryRole: "franchisee",
    status: "active",
    tierCode: "RETAIL-STD",
    rating: 4.5,
    creditHold: false,
    spendYtd: 0,
    revenueYtd: 4500000,
    openPos: 0,
    openSos: 0,
    terms: [
      {
        role: "franchisee",
        paymentTerms: "Royalty + Net 7",
        paymentTermsDays: 7,
        currencyCode: "BDT",
      },
    ],
    updatedAt: "2026-06-10",
  },
];

const migratedVendors = suppliersSeed
  .filter((s) => s.id !== "sup_001")
  .map((s) => vendorFromSupplier(s));

export const businessPartnersSeed: BusinessPartner[] = [
  ...extraPartners,
  ...migratedVendors,
];

let partnerSeq = businessPartnersSeed.length + 1;

export function getPartnerById(id: string): BusinessPartner | undefined {
  return businessPartnersSeed.find((p) => p.id === id);
}

/** Resolve Business Partner id from legacy supplier id (`sup_001` → `bp_001`). */
export function partnerIdForSupplierId(supplierId: string): string {
  const linked = businessPartnersSeed.find((p) => p.supplierId === supplierId);
  if (linked) return linked.id;
  if (supplierId.startsWith("sup_")) return `bp_${supplierId.slice(4)}`;
  return supplierId;
}

export function getPartnerBySupplierId(supplierId: string): BusinessPartner | undefined {
  return (
    businessPartnersSeed.find((p) => p.supplierId === supplierId) ??
    getPartnerById(partnerIdForSupplierId(supplierId))
  );
}

export function partnerDirectoryUrlForSupplier(
  supplierId: string,
  _tab?: "catalog" | "terms" | "roles",
): string {
  return `/suppliers/${supplierId}`;
}

export const VENDOR_DIRECTORY_HREF = "/suppliers";

export function buildPartnerDraft(partial?: Partial<BusinessPartner>): BusinessPartner {
  const id = `bp_${Date.now()}`;
  partnerSeq += 1;
  return {
    id,
    partnerCode: `BP-${String(partnerSeq).padStart(4, "0")}`,
    name: "",
    email: "",
    phone: "",
    country: "Bangladesh",
    territory: "Dhaka",
    roles: ["vendor"],
    primaryRole: "vendor",
    status: "draft",
    rating: 0,
    creditHold: false,
    spendYtd: 0,
    revenueYtd: 0,
    openPos: 0,
    openSos: 0,
    terms: [
      {
        role: "vendor",
        paymentTerms: "Net 30",
        paymentTermsDays: 30,
        currencyCode: "BDT",
        leadTimeDays: 7,
      },
    ],
    updatedAt: new Date().toISOString().slice(0, 10),
    ...partial,
  };
}

export function formatPartnerMoney(amount: number): string {
  if (amount >= 1_000_000) return `৳${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `৳${(amount / 1_000).toFixed(0)}K`;
  return `৳${amount.toLocaleString("en-BD")}`;
}

export function tabFromPartnersPath(pathname: string): string {
  if (pathname.startsWith("/partners/directory")) return "directory";
  if (pathname.startsWith("/partners/onboarding")) return "onboarding";
  if (pathname.startsWith("/partners/tiers")) return "tiers";
  if (pathname.startsWith("/partners/territories")) return "territories";
  if (pathname.startsWith("/partners/performance")) return "performance";
  if (pathname.startsWith("/partners/settings")) return "settings";
  return "overview";
}
