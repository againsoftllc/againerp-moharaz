// ─── Types ────────────────────────────────────────────────────────────────────

export type WebsitePageStatus = "draft" | "published" | "archived" | "review";
export type BlogPostStatus = "draft" | "scheduled" | "published" | "archived";
export type PortfolioStatus = "draft" | "published";
export type DomainStatus = "pending" | "verified" | "active" | "error";
export type SslStatus = "pending" | "issued" | "expired";
export type FormType = "contact" | "lead" | "newsletter" | "survey" | "application";
export type JobType = "full-time" | "part-time" | "contract" | "remote";

export type WebsitePage = {
  id: string;
  title: string;
  slug: string;
  status: WebsitePageStatus;
  template: string;
  layoutId: string;
  author: string;
  lastUpdated: string;
  views: number;
  seoScore: number;
  type: "website" | "ecommerce";
};

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  category: string;
  author: string;
  status: BlogPostStatus;
  publishedAt: string;
  views: number;
};

export type PortfolioItem = {
  id: string;
  title: string;
  client: string;
  category: string;
  status: PortfolioStatus;
  sortOrder: number;
  coverImage: string;
};

export type TeamMember = {
  id: string;
  fullName: string;
  jobTitle: string;
  department: string;
  published: boolean;
  sortOrder: number;
};

export type CareerListing = {
  id: string;
  jobTitle: string;
  department: string;
  location: string;
  jobType: JobType;
  status: "draft" | "published" | "closed";
  expiresAt: string;
  applications: number;
};

export type WebsiteForm = {
  id: string;
  formName: string;
  formType: FormType;
  submissions: number;
  conversionRate: number;
  status: "active" | "inactive";
};

export type WebsiteDomain = {
  id: string;
  domain: string;
  status: DomainStatus;
  sslStatus: SslStatus;
  isPrimary: boolean;
  verifiedAt: string | null;
};

// ─── Label Maps ───────────────────────────────────────────────────────────────

export const PAGE_STATUS_LABELS: Record<WebsitePageStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
  review: "In Review",
};

export const BLOG_STATUS_LABELS: Record<BlogPostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};

export const DOMAIN_STATUS_LABELS: Record<DomainStatus, string> = {
  pending: "Pending",
  verified: "Verified",
  active: "Active",
  error: "Error",
};

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  remote: "Remote",
};

// ─── KPI Data ─────────────────────────────────────────────────────────────────

export const websiteDashboardKpis = {
  publishedPages: { label: "Published Pages", value: "48", change: "+3 this week", up: true },
  blogPosts: { label: "Blog Posts", value: "156", change: "+8 this month", up: true },
  totalViews: { label: "Total Views (30d)", value: "24.5K", change: "+12%", up: true },
  formSubmissions: { label: "Form Submissions", value: "342", change: "+28 this month", up: true },
};

// ─── Seed Data ────────────────────────────────────────────────────────────────

export const websitePagesSeed: WebsitePage[] = [
  { id: "pg-001", title: "Home", slug: "/", status: "published", template: "Homepage", layoutId: "layout-1", author: "Admin", lastUpdated: "2026-06-20", views: 12400, seoScore: 92, type: "website" },
  { id: "pg-002", title: "About Us", slug: "about-us", status: "published", template: "Default", layoutId: "layout-1", author: "Rahim", lastUpdated: "2026-06-18", views: 3210, seoScore: 88, type: "website" },
  { id: "pg-003", title: "Contact", slug: "contact", status: "published", template: "Default", layoutId: "layout-1", author: "Admin", lastUpdated: "2026-06-15", views: 1840, seoScore: 75, type: "website" },
  { id: "pg-004", title: "Services", slug: "services", status: "published", template: "Default", layoutId: "layout-1", author: "Karim", lastUpdated: "2026-06-14", views: 2560, seoScore: 81, type: "website" },
  { id: "pg-005", title: "Pricing", slug: "pricing", status: "draft", template: "Landing", layoutId: "layout-2", author: "Admin", lastUpdated: "2026-06-19", views: 0, seoScore: 42, type: "website" },
  { id: "pg-006", title: "Privacy Policy", slug: "privacy-policy", status: "published", template: "Default", layoutId: "layout-1", author: "Admin", lastUpdated: "2026-05-10", views: 430, seoScore: 65, type: "website" },
  { id: "pg-007", title: "Summer Campaign", slug: "summer-2026", status: "review", template: "Landing", layoutId: "layout-2", author: "Sadia", lastUpdated: "2026-06-21", views: 0, seoScore: 55, type: "website" },
  { id: "pg-008", title: "Old Team Page", slug: "team-old", status: "archived", template: "Default", layoutId: "layout-1", author: "Admin", lastUpdated: "2026-03-01", views: 890, seoScore: 70, type: "website" },
  { id: "pg-009", title: "Shop Home", slug: "shop", status: "published", template: "Shop", layoutId: "layout-4", author: "Admin", lastUpdated: "2026-06-20", views: 8900, seoScore: 85, type: "ecommerce" },
  { id: "pg-010", title: "Product Page", slug: "products/[slug]", status: "published", template: "Product Detail", layoutId: "layout-4", author: "Admin", lastUpdated: "2026-06-18", views: 23400, seoScore: 90, type: "ecommerce" },
  { id: "pg-011", title: "Category Page", slug: "category/[slug]", status: "published", template: "Category Grid", layoutId: "layout-4", author: "Admin", lastUpdated: "2026-06-15", views: 11200, seoScore: 82, type: "ecommerce" },
  { id: "pg-012", title: "Cart", slug: "cart", status: "published", template: "Cart", layoutId: "layout-2", author: "Admin", lastUpdated: "2026-06-10", views: 6700, seoScore: 60, type: "ecommerce" },
  { id: "pg-013", title: "Checkout", slug: "checkout", status: "published", template: "Checkout", layoutId: "layout-2", author: "Admin", lastUpdated: "2026-06-10", views: 4100, seoScore: 58, type: "ecommerce" },
];

export const blogPostsSeed: BlogPost[] = [
  { id: "bp-001", title: "10 Tips for Better E-Commerce SEO", slug: "ecommerce-seo-tips", category: "SEO", author: "Rahim", status: "published", publishedAt: "2026-06-18", views: 2340 },
  { id: "bp-002", title: "How to Build a High-Converting Landing Page", slug: "landing-page-conversion", category: "Marketing", author: "Sadia", status: "published", publishedAt: "2026-06-15", views: 1890 },
  { id: "bp-003", title: "AgainERP June Product Update", slug: "june-product-update", category: "News", author: "Admin", status: "published", publishedAt: "2026-06-10", views: 4120 },
  { id: "bp-004", title: "Inventory Management Best Practices", slug: "inventory-best-practices", category: "Operations", author: "Karim", status: "draft", publishedAt: "", views: 0 },
  { id: "bp-005", title: "Ramadan Campaign Strategy Guide", slug: "ramadan-campaign-guide", category: "Marketing", author: "Sadia", status: "scheduled", publishedAt: "2027-02-20", views: 0 },
  { id: "bp-006", title: "Understanding VAT in Bangladesh", slug: "vat-bangladesh-guide", category: "Finance", author: "Admin", status: "published", publishedAt: "2026-05-28", views: 3670 },
];

export const portfolioSeed: PortfolioItem[] = [
  { id: "pf-001", title: "AgainERP — Full E-Commerce Platform", client: "AgainSoftware", category: "E-Commerce", status: "published", sortOrder: 1, coverImage: "" },
  { id: "pf-002", title: "Inventory Management System", client: "TechStore BD", category: "ERP", status: "published", sortOrder: 2, coverImage: "" },
  { id: "pf-003", title: "HR & Payroll Portal", client: "GarmentsCo Ltd", category: "HR Tech", status: "published", sortOrder: 3, coverImage: "" },
  { id: "pf-004", title: "CRM for Real Estate", client: "PropTech BD", category: "CRM", status: "draft", sortOrder: 4, coverImage: "" },
  { id: "pf-005", title: "Multi-Vendor Marketplace", client: "BazaarPro", category: "Marketplace", status: "published", sortOrder: 5, coverImage: "" },
];

export const teamMembersSeed: TeamMember[] = [
  { id: "tm-001", fullName: "Mohammad Rahim", jobTitle: "CEO & Founder", department: "Leadership", published: true, sortOrder: 1 },
  { id: "tm-002", fullName: "Sadia Islam", jobTitle: "Head of Product", department: "Product", published: true, sortOrder: 2 },
  { id: "tm-003", fullName: "Karim Hossain", jobTitle: "Lead Engineer", department: "Engineering", published: true, sortOrder: 3 },
  { id: "tm-004", fullName: "Nasrin Akter", jobTitle: "UX Designer", department: "Design", published: true, sortOrder: 4 },
  { id: "tm-005", fullName: "Farhan Ahmed", jobTitle: "Marketing Manager", department: "Marketing", published: false, sortOrder: 5 },
];

export const careersSeed: CareerListing[] = [
  { id: "cr-001", jobTitle: "Senior React Developer", department: "Engineering", location: "Dhaka", jobType: "full-time", status: "published", expiresAt: "2026-07-31", applications: 24 },
  { id: "cr-002", jobTitle: "Product Designer", department: "Design", location: "Remote", jobType: "remote", status: "published", expiresAt: "2026-07-15", applications: 18 },
  { id: "cr-003", jobTitle: "Digital Marketing Specialist", department: "Marketing", location: "Dhaka", jobType: "full-time", status: "draft", expiresAt: "2026-08-01", applications: 0 },
  { id: "cr-004", jobTitle: "QA Engineer", department: "Engineering", location: "Dhaka", jobType: "full-time", status: "published", expiresAt: "2026-07-20", applications: 9 },
];

export const formsSeed: WebsiteForm[] = [
  { id: "fm-001", formName: "Contact Us", formType: "contact", submissions: 128, conversionRate: 4.2, status: "active" },
  { id: "fm-002", formName: "Newsletter Signup", formType: "newsletter", submissions: 342, conversionRate: 8.7, status: "active" },
  { id: "fm-003", formName: "Job Application — Developer", formType: "application", submissions: 24, conversionRate: 2.1, status: "active" },
  { id: "fm-004", formName: "Demo Request", formType: "lead", submissions: 56, conversionRate: 6.4, status: "active" },
  { id: "fm-005", formName: "Customer Feedback Survey", formType: "survey", submissions: 89, conversionRate: 3.3, status: "inactive" },
];

export const domainsSeed: WebsiteDomain[] = [
  { id: "dm-001", domain: "againerp.com", status: "active", sslStatus: "issued", isPrimary: true, verifiedAt: "2026-01-15" },
  { id: "dm-002", domain: "www.againerp.com", status: "active", sslStatus: "issued", isPrimary: false, verifiedAt: "2026-01-15" },
  { id: "dm-003", domain: "staging.againerp.com", status: "verified", sslStatus: "pending", isPrimary: false, verifiedAt: "2026-06-20" },
  { id: "dm-004", domain: "shop.againerp.com", status: "pending", sslStatus: "pending", isPrimary: false, verifiedAt: null },
];
