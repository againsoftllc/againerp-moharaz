import type { Customer } from "@/lib/mock-data/customers";
import { customersSeed } from "@/lib/mock-data/customers";
import type { Supplier } from "@/lib/mock-data/suppliers";

/** res.partner-style mock — matches Again demo contact form (Riyad / againsoft) */
const RIYAD_PARTNER: Customer = {
  id: "partner_1",
  customerId: "P-00001",
  name: "Mossiur Rahman Riyad",
  phone: "+880 1642-324294",
  email: "againsoftware@gmail.com",
  phoneVerified: true,
  emailVerified: true,
  parentCompany: "againsoft",
  parentContactName: "Mossiur Rahman Riyad",
  profileImage: undefined,
  group: "corporate",
  status: "active",
  loyaltyTier: "platinum",
  city: "Dhaka",
  region: "Dhaka (BD)",
  country: "Bangladesh",
  customerSince: "2020-01-01",
  lastOrderDate: "2026-06-01",
  assignedStaff: "admin@againerp.local",
  tags: ["Service / Domain Hosting"],
  totalOrders: 128,
  totalSpend: 2450000,
  avgOrderValue: 19140,
  returnRate: 1.2,
  rewardPoints: 0,
  walletBalance: 0,
  openingBalance: 0,
  creditLimit: 0,
  riskScore: 5,
  riskLevel: "low",
  addresses: [
    {
      id: "addr_partner_1",
      contactType: "primary",
      label: "Contact",
      title: "Other",
      address: "60 West Agargaon",
      street2: "",
      city: "Dhaka",
      region: "Dhaka (BD)",
      country: "Bangladesh",
      zip: "1207",
      isDefault: true,
      taxId: "not applicable",
      jobPosition: "CEO",
      website: "www.againsoft.com",
      mobile: "+880 1642-324294",
    },
    {
      id: "rc_partner_1_jidan",
      contactType: "related",
      label: "Other address",
      name: "Jidan",
      email: "againsoftware@gmail.com",
      phone: "+880 1642-324294",
      jobPosition: "MD",
      address: "",
      city: "Dhaka",
      region: "Dhaka",
      country: "Bangladesh",
      isDefault: false,
    },
  ],
  recentOrders: [],
  walletTransactions: [],
  rewardEvents: [],
  timeline: [
    {
      id: "tl_p1_1",
      type: "registered",
      title: "Contact created",
      actor: "Admin",
      at: "2020-01-01T08:00:00Z",
    },
  ],
  comments: [],
  activities: [],
  attachments: [],
  aiInsights: {
    summary: "Individual contact linked to againsoft.",
    purchaseSummary: "",
    churnRisk: "low",
    churnScore: 5,
    churnReasons: [],
    retentionProbability: 95,
    predictedLtv: 5000000,
    favoriteCategories: [],
    favoriteBrands: [],
    recommendedProducts: [],
    marketingSuggestions: [],
  },
  notes: "",
};

/** Company record — used when opening againsoft from sales */
const AGAIN_SOFT_COMPANY: Customer = {
  ...RIYAD_PARTNER,
  id: "partner_company",
  customerId: "P-00002",
  name: "againsoft",
  phone: "",
  parentCompany: undefined,
  parentContactName: undefined,
  tags: ["Service / Domain Hosting / Hosting"],
  addresses: [
    {
      id: "addr_company_1",
      contactType: "primary",
      label: "Contact",
      title: "Company",
      address: "60 West Agargaon",
      street2: "",
      city: "Dhaka",
      region: "Dhaka (BD)",
      country: "Bangladesh",
      zip: "1207",
      isDefault: true,
      taxId: "not applicable",
      jobPosition: "Managing Director",
      website: "http://againsoft.com",
      mobile: "",
    },
    {
      id: "rc_company_riyad",
      contactType: "related",
      label: "Other address",
      name: "Mossiur Rahman Riyad",
      email: "againsoftware@gmail.com",
      phone: "+880 1642-324294",
      jobPosition: "",
      address: "",
      city: "Dhaka",
      region: "Dhaka",
      country: "Bangladesh",
      isDefault: false,
    },
  ],
};

export const partnerDrawerSeed: Customer[] = [RIYAD_PARTNER, AGAIN_SOFT_COMPANY];

const PARTNER_ALIASES: Record<string, string> = {
  partner_1: "partner_1",
  partner_company: "partner_company",
  sc_017: "partner_1",
  sc_010: "partner_company",
};

export function resolvePartnerForDrawer(
  customerId: string,
  apiCustomers: Customer[] = [],
): Customer | null {
  if (!customerId.trim()) return null;

  const fromApi = apiCustomers.find((c) => c.id === customerId);
  if (fromApi) return fromApi;

  const aliasId = PARTNER_ALIASES[customerId] ?? customerId;
  const fromPartner = partnerDrawerSeed.find((p) => p.id === aliasId);
  if (fromPartner) return { ...fromPartner, id: customerId };

  const fromSeed = customersSeed.find((c) => c.id === customerId);
  if (fromSeed) return fromSeed;

  return null;
}

/** A partner record for a customer the list doesn't hold: only what the order itself knows. It used to be a copy of
 * the demo contact (againsoft / Riyad / 60 West Agargaon …), which showed up as the customer's profile. */
export function buildMinimalPartnerFromSales(
  customerId: string,
  name: string,
  email: string,
  phone: string,
  address?: { street?: string; city?: string; state?: string; zip?: string; country?: string },
): Customer {
  const street = (address?.street ?? "").trim();
  const hasAddress = !!(street || address?.city || address?.state);
  return {
    id: customerId,
    customerId: "",
    name: name.trim(),
    phone: phone.trim(),
    email: email.trim(),
    group: "retail",
    status: "active",
    loyaltyTier: "silver",
    city: address?.city ?? "",
    region: address?.state ?? "",
    country: address?.country || "Bangladesh",
    customerSince: new Date().toISOString().slice(0, 10),
    tags: [],
    totalOrders: 0,
    totalSpend: 0,
    avgOrderValue: 0,
    returnRate: 0,
    rewardPoints: 0,
    walletBalance: 0,
    openingBalance: 0,
    creditLimit: 0,
    riskScore: 0,
    riskLevel: "low",
    addresses: hasAddress
      ? [
          {
            id: `addr_${customerId}`,
            contactType: "primary",
            label: "Address",
            address: street,
            city: address?.city ?? "",
            region: address?.state ?? "",
            country: address?.country || "Bangladesh",
            zip: address?.zip ?? "",
            isDefault: true,
          },
        ]
      : [],
    recentOrders: [],
    walletTransactions: [],
    rewardEvents: [],
    timeline: [],
    comments: [],
    activities: [],
    attachments: [],
    aiInsights: EMPTY_AI,
    notes: undefined,
  };
}

const EMPTY_AI = {
  summary: "",
  purchaseSummary: "",
  churnRisk: "low" as const,
  churnScore: 0,
  churnReasons: [] as string[],
  retentionProbability: 0,
  predictedLtv: 0,
  favoriteCategories: [] as string[],
  favoriteBrands: [] as string[],
  recommendedProducts: [] as { name: string; reason: string }[],
  marketingSuggestions: [] as string[],
};

/** Map a supplier onto the shared partner (customer) drawer so both roles use one UI. */
export function supplierToPartnerCustomer(supplier: Supplier): Customer {
  const orderCount = Math.max(supplier.openPos ?? 0, 0);
  const spend = Number(supplier.spendYtd ?? 0);
  return {
    id: supplier.linkedCustomerId || supplier.id,
    customerId: supplier.vendorCode,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    group: "partner",
    status: supplier.status === "blocked" ? "blocked" : "active",
    loyaltyTier: supplier.status === "preferred" ? "gold" : "silver",
    city: "",
    region: "",
    country: supplier.country || "Bangladesh",
    customerSince: supplier.updatedAt || new Date().toISOString().slice(0, 10),
    lastOrderDate: supplier.updatedAt,
    assignedStaff: supplier.buyerName,
    tags: [],
    totalOrders: orderCount,
    totalSpend: spend,
    avgOrderValue: orderCount ? spend / orderCount : 0,
    returnRate: 0,
    rewardPoints: 0,
    walletBalance: 0,
    openingBalance: supplier.openingBalance ?? 0,
    creditLimit: 0,
    riskScore: 0,
    riskLevel: "low",
    addresses: [],
    recentOrders: [],
    walletTransactions: [],
    rewardEvents: [],
    timeline: [],
    comments: [],
    activities: [],
    attachments: [],
    aiInsights: EMPTY_AI,
    notes: undefined,
    partyId: supplier.partyId,
    roles: supplier.roles ?? ["supplier"],
    linkedSupplierId: supplier.id,
    linkedSupplierName: supplier.name,
    linkedVendorId: supplier.linkedVendorId,
    linkedVendorName: supplier.linkedVendorName,
  };
}
