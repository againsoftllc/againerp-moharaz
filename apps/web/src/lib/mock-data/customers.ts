// ─── Customer Types ────────────────────────────────────────────────────────────

export type CustomerStatus = "active" | "inactive" | "blocked" | "vip";
export type CustomerGroup = "retail" | "wholesale" | "dealer" | "corporate" | "vip" | "employee" | "partner";
export type LoyaltyTier = "silver" | "gold" | "platinum" | "vip";
export type RiskLevel = "low" | "medium" | "high";

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  blocked: "Blocked",
  vip: "VIP",
};

export const CUSTOMER_GROUP_LABELS: Record<CustomerGroup, string> = {
  retail: "Retail",
  wholesale: "Wholesale",
  dealer: "Dealer",
  corporate: "Corporate",
  vip: "VIP",
  employee: "Employee",
  partner: "Partner",
};

export type CustomerAddress = {
  id: string;
  label: string;
  address: string;
  city: string;
  region: string;
  country: string;
  isDefault: boolean;
  contactType?: "primary" | "related";
  name?: string;
  email?: string;
  phone?: string;
  jobPosition?: string;
  taxId?: string;
  website?: string;
  title?: string;
  mobile?: string;
  zip?: string;
  street2?: string;
  /** Extra partner-profile fields persisted on the primary address entry */
  parentCompany?: string;
  parentContactName?: string;
  paymentTerms?: string;
  fiscalPosition?: string;
};

export type CustomerOrderSummary = {
  id: string;
  orderNumber: string;
  date: string;
  amount: number;
  status: string;
  paymentStatus: string;
  source?: string;
  productLabel?: string;
  paid?: number;
  due?: number;
};

export type CustomerWalletTransaction = {
  id: string;
  label: string;
  amount: number;
  type: "credit" | "debit";
  at: string;
};

export type CustomerRewardEvent = {
  id: string;
  label: string;
  points: number;
  type: "earned" | "redeemed" | "expired";
  at: string;
};

export type CustomerTimelineEvent = {
  id: string;
  type:
    | "registered"
    | "order"
    | "return"
    | "wallet"
    | "reward"
    | "support"
    | "marketing"
    | "note"
    | "activity"
    | "status_change"
    | "ai"
    | "update";
  title: string;
  description?: string;
  actor: string;
  actorInitials?: string;
  /** Who made the change — admin / customer / system */
  role?: "admin" | "customer" | "system" | string;
  at: string;
};

export type CustomerComment = {
  id: string;
  author: string;
  authorInitials: string;
  body: string;
  isInternal: boolean;
  at: string;
};

export type CustomerActivity = {
  id: string;
  type: string;
  title: string;
  assignee?: string;
  dueDate?: string;
  status: "open" | "done";
};

export type CustomerAttachment = {
  id: string;
  name: string;
  type: "trade_license" | "nid" | "contract" | "invoice" | "other";
  size: string;
};

export type CustomerAiInsights = {
  summary: string;
  purchaseSummary: string;
  churnRisk: RiskLevel;
  churnScore: number;
  churnReasons: string[];
  retentionProbability: number;
  predictedLtv: number;
  favoriteCategories: string[];
  favoriteBrands: string[];
  recommendedProducts: { name: string; reason: string }[];
  marketingSuggestions: string[];
};

export type Customer = {
  id: string;
  customerId: string;
  name: string;
  phone: string;
  email: string;
  /** OTP-verified login phone identity */
  phoneVerified?: boolean;
  /** OTP-verified login email identity */
  emailVerified?: boolean;
  /** Admin confirmed number is reachable on WhatsApp */
  whatsappVerified?: boolean;
  profileImage?: string;
  group: CustomerGroup;
  status: CustomerStatus;
  loyaltyTier: LoyaltyTier;
  city: string;
  region: string;
  country: string;
  customerSince: string;
  lastOrderDate?: string;
  assignedStaff?: string;
  tags: string[];
  totalOrders: number;
  totalSpend: number;
  avgOrderValue: number;
  returnRate: number;
  rewardPoints: number;
  walletBalance: number;
  /** AR opening balance when customer was onboarded (BDT). */
  openingBalance: number;
  /** Maximum receivable credit allowed (BDT). 0 = no credit. */
  creditLimit: number;
  /** No new RMA complaint is taken while set (OnerERP IsRMALocked). */
  rmaLocked?: boolean;
  rmaLockReason?: string;
  /** Credit control at sale (OnerERP IsLocked, TransactionType, CreditAllowedDays, ConditionalLimit, SecurityMoney). */
  salesLocked?: boolean;
  salesLockReason?: string;
  tradeMode?: "both" | "credit" | "cash";
  creditDays?: number | null;
  conditionalLimit?: number;
  conditionalValidTill?: string | null;
  securityMoney?: number;
  openingDate?: string | null;
  paymentTerms?: string;
  paymentSchedule?: string;
  riskScore: number;
  riskLevel: RiskLevel;
  addresses: CustomerAddress[];
  recentOrders: CustomerOrderSummary[];
  walletTransactions: CustomerWalletTransaction[];
  rewardEvents: CustomerRewardEvent[];
  timeline: CustomerTimelineEvent[];
  comments: CustomerComment[];
  activities: CustomerActivity[];
  attachments: CustomerAttachment[];
  aiInsights: CustomerAiInsights;
  notes?: string;
  /** Parent company when this contact is an individual (Again partner form) */
  parentCompany?: string;
  parentContactName?: string;
  partyId?: string;
  roles?: string[];
  linkedSupplierId?: string;
  linkedSupplierName?: string;
  linkedVendorId?: string;
  linkedVendorName?: string;
};

// ─── Seed data ─────────────────────────────────────────────────────────────────

export const customersSeed: Customer[] = [
  {
    id: "cust_001",
    customerId: "C-10001",
    name: "Rakibul Hasan",
    phone: "01711-234567",
    email: "rakib@example.com",
    group: "retail",
    status: "active",
    loyaltyTier: "gold",
    city: "Dhaka",
    region: "Dhaka Division",
    country: "Bangladesh",
    customerSince: "2022-03-15",
    lastOrderDate: "2026-06-10",
    assignedStaff: "Sumaiya Akter",
    tags: ["loyal", "tech-buyer"],
    totalOrders: 18,
    totalSpend: 145200,
    avgOrderValue: 8067,
    returnRate: 5.6,
    rewardPoints: 1450,
    walletBalance: 500,
    openingBalance: 2500,
    creditLimit: 50000,
    riskScore: 12,
    riskLevel: "low",
    addresses: [
      {
        id: "addr_001",
        label: "Home",
        address: "42/B, Mirpur-10",
        city: "Dhaka",
        region: "Dhaka Division",
        country: "Bangladesh",
        isDefault: true,
      },
      {
        id: "addr_002",
        label: "Office",
        address: "8th Floor, BRAC Centre, Gulshan",
        city: "Dhaka",
        region: "Dhaka Division",
        country: "Bangladesh",
        isDefault: false,
      },
    ],
    recentOrders: [
      { id: "ord_1001", orderNumber: "#ORD-1001", date: "2026-06-10", amount: 12500, status: "delivered", paymentStatus: "paid" },
      { id: "ord_1002", orderNumber: "#ORD-987", date: "2026-05-21", amount: 8200, status: "completed", paymentStatus: "paid" },
      { id: "ord_1003", orderNumber: "#ORD-876", date: "2026-04-14", amount: 5900, status: "completed", paymentStatus: "paid" },
    ],
    walletTransactions: [
      { id: "wt_1", label: "Refund credit for #ORD-765", amount: 500, type: "credit", at: "2026-05-28T10:00:00Z" },
      { id: "wt_2", label: "Used for #ORD-987", amount: 200, type: "debit", at: "2026-05-21T14:30:00Z" },
    ],
    rewardEvents: [
      { id: "rw_1", label: "Earned from #ORD-1001", points: 125, type: "earned", at: "2026-06-10T11:00:00Z" },
      { id: "rw_2", label: "Redeemed for discount", points: 200, type: "redeemed", at: "2026-05-21T14:30:00Z" },
    ],
    timeline: [
      { id: "tl_001", type: "order", title: "Order #ORD-1001 delivered", description: "12,500 BDT — Laptop accessories bundle", actor: "System", at: "2026-06-10T11:00:00Z" },
      { id: "tl_002", type: "activity", title: "Follow-up call completed", description: "Customer satisfied, no issues", actor: "Sumaiya Akter", actorInitials: "SA", at: "2026-06-08T09:30:00Z" },
      { id: "tl_003", type: "wallet", title: "Wallet credited ৳500", description: "Refund credit applied", actor: "System", at: "2026-05-28T10:00:00Z" },
      { id: "tl_004", type: "order", title: "Order #ORD-987 completed", description: "8,200 BDT", actor: "System", at: "2026-05-21T14:30:00Z" },
      { id: "tl_005", type: "registered", title: "Customer registered", description: "Joined via website", actor: "System", at: "2022-03-15T08:00:00Z" },
    ],
    comments: [
      { id: "cm_001", author: "Sumaiya Akter", authorInitials: "SA", body: "Customer prefers afternoon deliveries. Very cooperative.", isInternal: true, at: "2026-06-08T09:35:00Z" },
      { id: "cm_002", author: "Rafiq Ahmed", authorInitials: "RA", body: "Offered loyalty upgrade to Platinum. Agreed on ৳50k target.", isInternal: true, at: "2026-05-15T11:00:00Z" },
    ],
    activities: [
      { id: "act_001", type: "follow_up", title: "Monthly check-in call", assignee: "Sumaiya Akter", dueDate: "2026-06-20", status: "open" },
    ],
    attachments: [],
    aiInsights: {
      summary: "Rakibul is a high-value retail customer with consistent purchase history over 4 years. Primarily buys electronics and laptop accessories. Low churn risk with strong engagement.",
      purchaseSummary: "18 orders totaling ৳1,45,200. Peak buying in Q4. Prefers online payment. Average basket ৳8,067.",
      churnRisk: "low",
      churnScore: 12,
      churnReasons: [],
      retentionProbability: 88,
      predictedLtv: 280000,
      favoriteCategories: ["Laptops", "Accessories", "Monitors"],
      favoriteBrands: ["Dell", "Logitech", "Samsung"],
      recommendedProducts: [
        { name: "Dell UltraSharp 27\" Monitor", reason: "Frequently bought by similar customers" },
        { name: "Logitech MX Master 3 Mouse", reason: "Matches accessory purchase pattern" },
        { name: "HP USB-C Dock G5", reason: "Upsell for laptop setup" },
      ],
      marketingSuggestions: [
        "Send Platinum tier upgrade offer — 3 orders away from threshold",
        "Target with laptop bundle campaign in Q4",
        "Offer exclusive early access to new tech arrivals",
      ],
    },
  },
  {
    id: "cust_002",
    customerId: "C-10002",
    name: "Fatema Begum",
    phone: "01812-345678",
    email: "fatema@example.com",
    group: "wholesale",
    status: "vip",
    loyaltyTier: "platinum",
    city: "Chittagong",
    region: "Chittagong Division",
    country: "Bangladesh",
    customerSince: "2021-08-01",
    lastOrderDate: "2026-06-05",
    assignedStaff: "Rafiq Ahmed",
    tags: ["vip", "wholesale", "regular"],
    totalOrders: 54,
    totalSpend: 892000,
    avgOrderValue: 16519,
    returnRate: 2.1,
    rewardPoints: 8920,
    walletBalance: 3200,
    openingBalance: 15000,
    creditLimit: 200000,
    riskScore: 8,
    riskLevel: "low",
    addresses: [
      { id: "addr_010", label: "Warehouse", address: "Plot 15, CEPZ", city: "Chittagong", region: "Chittagong Division", country: "Bangladesh", isDefault: true },
    ],
    recentOrders: [
      { id: "ord_2001", orderNumber: "#ORD-2001", date: "2026-06-05", amount: 48000, status: "processing", paymentStatus: "partial" },
      { id: "ord_2002", orderNumber: "#ORD-1990", date: "2026-05-18", amount: 32000, status: "completed", paymentStatus: "paid" },
    ],
    walletTransactions: [
      { id: "wt_10", label: "Top-up credit", amount: 3200, type: "credit", at: "2026-05-10T09:00:00Z" },
    ],
    rewardEvents: [
      { id: "rw_10", label: "Earned from #ORD-2001", points: 480, type: "earned", at: "2026-06-05T10:00:00Z" },
    ],
    timeline: [
      { id: "tl_010", type: "order", title: "Order #ORD-2001 placed", description: "৳48,000 — Bulk electronics", actor: "System", at: "2026-06-05T10:00:00Z" },
      { id: "tl_011", type: "status_change", title: "Upgraded to Platinum tier", actor: "System", at: "2026-01-01T00:00:00Z" },
      { id: "tl_012", type: "registered", title: "Customer registered", actor: "System", at: "2021-08-01T08:00:00Z" },
    ],
    comments: [
      { id: "cm_010", author: "Rafiq Ahmed", authorInitials: "RA", body: "Key wholesale account. Requires priority handling on all orders.", isInternal: true, at: "2026-05-20T10:00:00Z" },
    ],
    activities: [
      { id: "act_010", type: "meeting", title: "Q3 wholesale pricing review", assignee: "Rafiq Ahmed", dueDate: "2026-06-25", status: "open" },
    ],
    attachments: [
      { id: "att_010", name: "Trade License 2026.pdf", type: "trade_license", size: "1.2 MB" },
      { id: "att_011", name: "Contract FY26.pdf", type: "contract", size: "845 KB" },
    ],
    aiInsights: {
      summary: "Fatema is a high-volume Platinum wholesale customer with 5+ years of consistent bulk purchasing. Very low churn risk. Represents top 2% revenue segment.",
      purchaseSummary: "54 orders totaling ৳8,92,000. Bulk electronics buyer. Average basket ৳16,519. Consistent payment history.",
      churnRisk: "low",
      churnScore: 8,
      churnReasons: [],
      retentionProbability: 94,
      predictedLtv: 2500000,
      favoriteCategories: ["Laptops", "Smartphones", "Networking"],
      favoriteBrands: ["Samsung", "Apple", "TP-Link"],
      recommendedProducts: [
        { name: "Samsung Galaxy A55 (Bulk)", reason: "Matches wholesale smartphone buying pattern" },
        { name: "TP-Link Router Bundle", reason: "Frequently ordered category" },
        { name: "Custom Enterprise Pricing", reason: "High volume warrants dedicated pricing" },
      ],
      marketingSuggestions: [
        "Offer dedicated account manager for enterprise deal",
        "Propose Q3 bulk discount agreement",
        "Invite to exclusive wholesale preview event",
      ],
    },
  },
  {
    id: "cust_003",
    customerId: "C-10003",
    name: "Jahidul Islam",
    phone: "01913-456789",
    email: "jahid@example.com",
    group: "retail",
    status: "inactive",
    loyaltyTier: "silver",
    city: "Sylhet",
    region: "Sylhet Division",
    country: "Bangladesh",
    customerSince: "2023-11-20",
    lastOrderDate: "2026-01-15",
    assignedStaff: undefined,
    tags: ["inactive", "win-back"],
    totalOrders: 4,
    totalSpend: 18500,
    avgOrderValue: 4625,
    returnRate: 25.0,
    rewardPoints: 185,
    walletBalance: 0,
    openingBalance: 0,
    creditLimit: 0,
    riskScore: 72,
    riskLevel: "high",
    addresses: [
      { id: "addr_020", label: "Home", address: "45, Zindabazar", city: "Sylhet", region: "Sylhet Division", country: "Bangladesh", isDefault: true },
    ],
    recentOrders: [
      { id: "ord_3001", orderNumber: "#ORD-3001", date: "2026-01-15", amount: 5200, status: "returned", paymentStatus: "refunded" },
    ],
    walletTransactions: [],
    rewardEvents: [],
    timeline: [
      { id: "tl_020", type: "return", title: "Return processed for #ORD-3001", actor: "System", at: "2026-01-20T10:00:00Z" },
      { id: "tl_021", type: "ai", title: "AI flagged: High churn risk", description: "5 months since last purchase. 25% return rate.", actor: "AI Agent", at: "2026-06-10T08:00:00Z" },
      { id: "tl_022", type: "registered", title: "Customer registered", actor: "System", at: "2023-11-20T08:00:00Z" },
    ],
    comments: [],
    activities: [
      { id: "act_020", type: "follow_up", title: "Win-back campaign follow-up", assignee: undefined, dueDate: "2026-06-20", status: "open" },
    ],
    attachments: [],
    aiInsights: {
      summary: "Jahidul is an at-risk retail customer. Last purchase 5 months ago with a high return rate of 25%. AI recommends immediate reactivation campaign.",
      purchaseSummary: "4 orders totaling ৳18,500. High return rate. Account shows signs of dissatisfaction.",
      churnRisk: "high",
      churnScore: 72,
      churnReasons: ["5+ months since last purchase", "High return rate (25%)", "No recent engagement"],
      retentionProbability: 28,
      predictedLtv: 25000,
      favoriteCategories: ["Smartphones", "Accessories"],
      favoriteBrands: ["Samsung"],
      recommendedProducts: [
        { name: "Samsung Galaxy A35", reason: "Previous purchase category match" },
        { name: "Mobile Cover Bundle", reason: "Low-risk win-back purchase" },
      ],
      marketingSuggestions: [
        "Send 15% discount win-back coupon immediately",
        "Add to reactivation SMS campaign",
        "AI recommends: highlight easy return policy in messaging",
      ],
    },
  },
  {
    id: "cust_004",
    customerId: "C-10004",
    name: "Nasrin Akter",
    phone: "01615-567890",
    email: "nasrin@example.com",
    group: "corporate",
    status: "active",
    loyaltyTier: "gold",
    city: "Dhaka",
    region: "Dhaka Division",
    country: "Bangladesh",
    customerSince: "2022-07-10",
    lastOrderDate: "2026-06-08",
    assignedStaff: "Sumaiya Akter",
    tags: ["corporate", "bulk-buyer"],
    totalOrders: 22,
    totalSpend: 320000,
    avgOrderValue: 14545,
    returnRate: 3.0,
    rewardPoints: 3200,
    walletBalance: 1200,
    openingBalance: 8000,
    creditLimit: 100000,
    riskScore: 18,
    riskLevel: "low",
    addresses: [
      { id: "addr_030", label: "Office", address: "Bashundhara City, 5th Floor", city: "Dhaka", region: "Dhaka Division", country: "Bangladesh", isDefault: true },
    ],
    recentOrders: [
      { id: "ord_4001", orderNumber: "#ORD-4001", date: "2026-06-08", amount: 24000, status: "confirmed", paymentStatus: "unpaid" },
      { id: "ord_4002", orderNumber: "#ORD-3980", date: "2026-05-25", amount: 18500, status: "delivered", paymentStatus: "paid" },
    ],
    walletTransactions: [
      { id: "wt_30", label: "Credit for corporate discount", amount: 1200, type: "credit", at: "2026-05-01T09:00:00Z" },
    ],
    rewardEvents: [
      { id: "rw_30", label: "Earned from #ORD-4001", points: 240, type: "earned", at: "2026-06-08T09:00:00Z" },
    ],
    timeline: [
      { id: "tl_030", type: "order", title: "Order #ORD-4001 confirmed", description: "৳24,000 — IT equipment", actor: "System", at: "2026-06-08T09:00:00Z" },
      { id: "tl_031", type: "registered", title: "Customer registered", actor: "System", at: "2022-07-10T08:00:00Z" },
    ],
    comments: [
      { id: "cm_030", author: "Sumaiya Akter", authorInitials: "SA", body: "Corporate account. Net-30 payment terms approved. Contact is Nasrin (Procurement Head).", isInternal: true, at: "2022-08-01T09:00:00Z" },
    ],
    activities: [],
    attachments: [
      { id: "att_030", name: "Corporate Agreement 2026.pdf", type: "contract", size: "1.8 MB" },
    ],
    aiInsights: {
      summary: "Nasrin manages IT procurement for a mid-size corporate. Consistent bulk buyer with low return rate. Net-30 payment arrangement in place.",
      purchaseSummary: "22 orders totaling ৳3,20,000. Bulk IT equipment buyer. Monthly purchase cycle.",
      churnRisk: "low",
      churnScore: 18,
      churnReasons: [],
      retentionProbability: 85,
      predictedLtv: 800000,
      favoriteCategories: ["Laptops", "Networking", "Printers"],
      favoriteBrands: ["HP", "Cisco", "Dell"],
      recommendedProducts: [
        { name: "HP LaserJet Pro Bundle", reason: "Office equipment upgrade cycle detected" },
        { name: "Cisco Switch 24-port", reason: "Network expansion pattern" },
      ],
      marketingSuggestions: [
        "Propose annual corporate procurement agreement",
        "Offer extended warranty package for bulk IT orders",
      ],
    },
  },
  {
    id: "cust_005",
    customerId: "C-10005",
    name: "Tanvir Ahmed",
    phone: "01714-678901",
    email: "tanvir@example.com",
    group: "retail",
    status: "active",
    loyaltyTier: "silver",
    city: "Rajshahi",
    region: "Rajshahi Division",
    country: "Bangladesh",
    customerSince: "2024-02-14",
    lastOrderDate: "2026-06-11",
    assignedStaff: undefined,
    tags: ["new", "mobile-buyer"],
    totalOrders: 3,
    totalSpend: 22400,
    avgOrderValue: 7467,
    returnRate: 0,
    rewardPoints: 224,
    walletBalance: 0,
    openingBalance: 0,
    creditLimit: 0,
    riskScore: 35,
    riskLevel: "medium",
    addresses: [
      { id: "addr_040", label: "Home", address: "23, Shaheb Bazar", city: "Rajshahi", region: "Rajshahi Division", country: "Bangladesh", isDefault: true },
    ],
    recentOrders: [
      { id: "ord_5001", orderNumber: "#ORD-5001", date: "2026-06-11", amount: 12400, status: "shipped", paymentStatus: "paid" },
    ],
    walletTransactions: [],
    rewardEvents: [
      { id: "rw_40", label: "Welcome bonus", points: 50, type: "earned", at: "2024-02-14T09:00:00Z" },
    ],
    timeline: [
      { id: "tl_040", type: "order", title: "Order #ORD-5001 shipped", actor: "System", at: "2026-06-11T12:00:00Z" },
      { id: "tl_041", type: "registered", title: "Customer registered", actor: "System", at: "2024-02-14T08:00:00Z" },
    ],
    comments: [],
    activities: [],
    attachments: [],
    aiInsights: {
      summary: "Tanvir is a relatively new retail customer with good purchase frequency but medium churn risk. No returns yet — a positive signal.",
      purchaseSummary: "3 orders totaling ৳22,400. Smartphone and mobile accessories buyer. New but showing good engagement.",
      churnRisk: "medium",
      churnScore: 35,
      churnReasons: ["New customer — behavior pattern still forming", "Only 3 orders in 2 years"],
      retentionProbability: 62,
      predictedLtv: 85000,
      favoriteCategories: ["Smartphones", "Mobile Accessories"],
      favoriteBrands: ["Samsung", "Xiaomi"],
      recommendedProducts: [
        { name: "Xiaomi 14 Pro", reason: "Brand loyalty detected" },
        { name: "Wireless Earbuds Bundle", reason: "Accessory upsell opportunity" },
      ],
      marketingSuggestions: [
        "Enroll in loyalty program with bonus points offer",
        "Send personalized product recommendation email",
      ],
    },
  },
];

export type QuickAddCustomerInput = {
  name: string;
  phone: string;
  email?: string;
  group?: CustomerGroup;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
};

export function buildCustomerFromQuickAdd(input: QuickAddCustomerInput): Customer {
  const stamp = Date.now();
  const id = `cust_${stamp}`;
  const customerId = `C-${String(stamp).slice(-6)}`;
  const city = input.city?.trim() || "Dhaka";
  const region = input.region?.trim() || "Dhaka Division";
  const country = input.country?.trim() || "Bangladesh";
  const addressLine = input.address?.trim() || "";
  const now = new Date().toISOString();

  return {
    id,
    customerId,
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || "",
    group: input.group ?? "retail",
    status: "active",
    loyaltyTier: "silver",
    city,
    region,
    country,
    customerSince: now.slice(0, 10),
    tags: [],
    totalOrders: 0,
    totalSpend: 0,
    avgOrderValue: 0,
    returnRate: 0,
    rewardPoints: 0,
    walletBalance: 0,
    openingBalance: 0,
    creditLimit: 0,
    riskScore: 20,
    riskLevel: "low",
    addresses: addressLine
      ? [
          {
            id: `addr_${id}`,
            label: "Primary",
            address: addressLine,
            city,
            region,
            country,
            isDefault: true,
          },
        ]
      : [],
    recentOrders: [],
    walletTransactions: [],
    rewardEvents: [],
    timeline: [
      {
        id: `tl_${id}`,
        type: "registered",
        title: "Customer created from order",
        description: "Quick add during manual order entry",
        actor: "Admin",
        actorInitials: "AD",
        at: now,
      },
    ],
    comments: [],
    activities: [],
    attachments: [],
    aiInsights: {
      summary: "New customer — limited purchase history.",
      purchaseSummary: "No orders yet.",
      churnRisk: "low",
      churnScore: 20,
      churnReasons: [],
      retentionProbability: 50,
      predictedLtv: 0,
      favoriteCategories: [],
      favoriteBrands: [],
      recommendedProducts: [],
      marketingSuggestions: [],
    },
  };
}

// ─── Helper functions ─────────────────────────────────────────────────────────

export function countCustomersByStatus(customers: Customer[]): Record<string, number> {
  return customers.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      acc.all = (acc.all ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

export const customersDashboardKpis = {
  total: 1284,
  newThisMonth: 86,
  active: 1043,
  inactive: 198,
  vip: 43,
  returning: 712,
  avgOrderValue: 8450,
  avgLtv: 145000,
};
