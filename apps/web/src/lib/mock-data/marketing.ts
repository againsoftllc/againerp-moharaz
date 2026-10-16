export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "archived";

export type CampaignType = "email" | "sms" | "push" | "multi" | "promotion";

export type CouponStatus = "active" | "scheduled" | "expired" | "disabled";

export const MARKETING_TABS = [
  "dashboard",
  "campaigns",
  "audiences",
  "coupons",
  "email",
  "journeys",
] as const;

export type MarketingTab = (typeof MARKETING_TABS)[number];

export const MARKETING_TAB_LABELS: Record<MarketingTab, string> = {
  dashboard: "Dashboard",
  campaigns: "Campaigns",
  audiences: "Audiences",
  coupons: "Coupons",
  email: "Email",
  journeys: "Journeys",
};

export const marketingKpis = [
  { label: "Active campaigns", value: "6", sub: "2 scheduled this week" },
  { label: "Sends (7 days)", value: "18.4K", sub: "Email 72% · SMS 28%", up: true },
  { label: "Conversion rate", value: "3.2%", sub: "+0.4% vs prior week", up: true },
  { label: "Audience growth", value: "+842", sub: "Net new subscribers" },
];

export const channelSendChart = [
  { day: "Mon", email: 2800, sms: 920 },
  { day: "Tue", email: 3100, sms: 1100 },
  { day: "Wed", email: 2600, sms: 800 },
  { day: "Thu", email: 3400, sms: 1200 },
  { day: "Fri", email: 2900, sms: 950 },
  { day: "Sat", email: 1800, sms: 600 },
  { day: "Sun", email: 1500, sms: 480 },
];

export const conversionFunnel = [
  { stage: "Sent", count: 18400 },
  { stage: "Opened", count: 9200 },
  { stage: "Clicked", count: 2100 },
  { stage: "Converted", count: 590 },
];

export type MarketingCampaign = {
  id: string;
  code: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  audience: string;
  channels: string[];
  startsAt: string;
  endsAt?: string;
  goal: string;
  progress: number;
  revenue: number;
  updatedAt: string;
};

export const campaignsSeed: MarketingCampaign[] = [
  {
    id: "cmp_summer",
    code: "SUM26",
    name: "Summer Sale 2026",
    type: "multi",
    status: "running",
    audience: "Inactive 30d customers",
    channels: ["Email", "SMS", "Onsite"],
    startsAt: "2026-06-01",
    endsAt: "2026-06-30",
    goal: "Revenue ৳500K",
    progress: 68,
    revenue: 342000,
    updatedAt: "2026-06-15",
  },
  {
    id: "cmp_new",
    code: "NEW-ARR",
    name: "New Arrivals Launch",
    type: "email",
    status: "scheduled",
    audience: "Newsletter subscribers",
    channels: ["Email"],
    startsAt: "2026-06-18",
    goal: "Clicks 2,500",
    progress: 0,
    revenue: 0,
    updatedAt: "2026-06-14",
  },
  {
    id: "cmp_winback",
    code: "WINBACK",
    name: "Win-back Q2",
    type: "email",
    status: "running",
    audience: "Churn risk cohort",
    channels: ["Email", "SMS"],
    startsAt: "2026-06-10",
    endsAt: "2026-06-25",
    goal: "Orders 200",
    progress: 45,
    revenue: 89000,
    updatedAt: "2026-06-15",
  },
  {
    id: "cmp_flash",
    code: "FLASH24",
    name: "Flash Friday",
    type: "sms",
    status: "completed",
    audience: "VIP segment",
    channels: ["SMS"],
    startsAt: "2026-06-07",
    endsAt: "2026-06-07",
    goal: "Orders 80",
    progress: 100,
    revenue: 124000,
    updatedAt: "2026-06-08",
  },
  {
    id: "cmp_loyalty",
    code: "LOYAL2X",
    name: "Loyalty 2× Points",
    type: "promotion",
    status: "draft",
    audience: "Loyalty members",
    channels: ["Email", "Push"],
    startsAt: "2026-07-01",
    goal: "Enrollments 500",
    progress: 0,
    revenue: 0,
    updatedAt: "2026-06-12",
  },
];

export type AudienceSegment = {
  id: string;
  name: string;
  members: number;
  growth: string;
  source: string;
  updatedAt: string;
};

export const audiencesSeed: AudienceSegment[] = [
  {
    id: "seg_newsletter",
    name: "Newsletter subscribers",
    members: 8420,
    growth: "+124 / week",
    source: "Website signup",
    updatedAt: "2026-06-15",
  },
  {
    id: "seg_vip",
    name: "VIP customers",
    members: 312,
    growth: "+8 / week",
    source: "Loyalty tier",
    updatedAt: "2026-06-14",
  },
  {
    id: "seg_inactive",
    name: "Inactive 30 days",
    members: 2140,
    growth: "+42 / week",
    source: "Behavior rule",
    updatedAt: "2026-06-15",
  },
  {
    id: "seg_churn",
    name: "Churn risk cohort",
    members: 486,
    growth: "AI scored",
    source: "Marketing Agent",
    updatedAt: "2026-06-15",
  },
  {
    id: "seg_electronics",
    name: "Electronics buyers",
    members: 1680,
    growth: "+56 / week",
    source: "Purchase history",
    updatedAt: "2026-06-13",
  },
];

export type MarketingCoupon = {
  id: string;
  code: string;
  name: string;
  discount: string;
  status: CouponStatus;
  redemptions: number;
  limit?: number;
  startsAt: string;
  endsAt: string;
};

export const couponsSeed: MarketingCoupon[] = [
  {
    id: "cpn_summer15",
    code: "SUMMER15",
    name: "Summer 15% off",
    discount: "15% off",
    status: "active",
    redemptions: 142,
    limit: 500,
    startsAt: "2026-06-01",
    endsAt: "2026-06-30",
  },
  {
    id: "cpn_flat500",
    code: "FLAT500",
    name: "৳500 off orders ৳3K+",
    discount: "৳500 fixed",
    status: "active",
    redemptions: 89,
    startsAt: "2026-06-01",
    endsAt: "2026-06-30",
  },
  {
    id: "cpn_vip20",
    code: "VIP20",
    name: "VIP exclusive 20%",
    discount: "20% off",
    status: "active",
    redemptions: 34,
    limit: 100,
    startsAt: "2026-06-01",
    endsAt: "2026-12-31",
  },
  {
    id: "cpn_flash",
    code: "FLASH24",
    name: "Flash Friday",
    discount: "10% off",
    status: "expired",
    redemptions: 210,
    startsAt: "2026-06-07",
    endsAt: "2026-06-07",
  },
];

export type EmailCampaign = {
  id: string;
  subject: string;
  template: string;
  status: CampaignStatus;
  recipients: number;
  openRate: number;
  clickRate: number;
  scheduledAt: string;
};

export const emailCampaignsSeed: EmailCampaign[] = [
  {
    id: "eml_001",
    subject: "Summer Sale — up to 40% off starts now",
    template: "Summer Hero v2",
    status: "running",
    recipients: 6200,
    openRate: 42,
    clickRate: 8.2,
    scheduledAt: "2026-06-01 10:00",
  },
  {
    id: "eml_002",
    subject: "We miss you — here's 15% to come back",
    template: "Win-back Standard",
    status: "running",
    recipients: 1800,
    openRate: 38,
    clickRate: 6.1,
    scheduledAt: "2026-06-10 09:00",
  },
  {
    id: "eml_003",
    subject: "New arrivals: Electronics & Gadgets",
    template: "Product Grid Launch",
    status: "scheduled",
    recipients: 8400,
    openRate: 0,
    clickRate: 0,
    scheduledAt: "2026-06-18 11:00",
  },
];

export type MarketingJourney = {
  id: string;
  name: string;
  trigger: string;
  steps: number;
  enrolled: number;
  completed: number;
  status: "active" | "draft" | "paused";
};

export const journeysSeed: MarketingJourney[] = [
  {
    id: "jrn_welcome",
    name: "Welcome series",
    trigger: "New subscriber",
    steps: 3,
    enrolled: 1240,
    completed: 890,
    status: "active",
  },
  {
    id: "jrn_cart",
    name: "Abandoned cart recovery",
    trigger: "Cart abandoned 1h",
    steps: 2,
    enrolled: 420,
    completed: 186,
    status: "active",
  },
  {
    id: "jrn_post",
    name: "Post-purchase nurture",
    trigger: "Order delivered",
    steps: 4,
    enrolled: 680,
    completed: 512,
    status: "active",
  },
  {
    id: "jrn_birthday",
    name: "Birthday offer",
    trigger: "Birthday date",
    steps: 1,
    enrolled: 0,
    completed: 0,
    status: "draft",
  },
];

export const aiMarketingInsights = [
  {
    title: "Segment opportunity",
    body: "1,240 electronics buyers haven't purchased in 60d — win-back email suggested",
  },
  {
    title: "Content suggestion",
    body: "Summer Sale email subject line A/B: '40% off' vs 'Biggest sale' — test recommended",
  },
  {
    title: "Churn alert",
    body: "486 contacts in churn risk cohort — SMS follow-up may lift conversion 12%",
  },
];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  running: "Running",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  email: "Email",
  sms: "SMS",
  push: "Push",
  multi: "Multi-channel",
  promotion: "Promotion",
};

export function formatBdt(amount: number) {
  return `৳${amount.toLocaleString("en-BD")}`;
}
