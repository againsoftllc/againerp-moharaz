export type AiAgentStatus = "active" | "idle" | "disabled";

export type AiAgent = {
  id: string;
  name: string;
  domain: string;
  status: AiAgentStatus;
  tools: number;
  runsToday: number;
  model: string;
  description: string;
};

export type AiProviderStatus = "healthy" | "degraded" | "offline";

export type AiProvider = {
  id: string;
  name: string;
  models: string[];
  status: AiProviderStatus;
  latencyMs: number;
  spendPct: number;
};

export type AiRiskTier = "low" | "medium" | "high" | "critical";

export type AiTool = {
  id: string;
  name: string;
  agent: string;
  category: string;
  risk: AiRiskTier;
  description: string;
};

export type AiApprovalStatus = "pending" | "approved" | "rejected";

export type AiApproval = {
  id: string;
  agent: string;
  tool: string;
  summary: string;
  reason: string;
  risk: AiRiskTier;
  status: AiApprovalStatus;
  requestedAt: string;
  entity: string;
  resolvedAt?: string;
  resolvedBy?: string;
};

export type AiAuditLog = {
  id: string;
  action: string;
  agent: string;
  user: string;
  summary: string;
  tokens: number;
  at: string;
};

export const AI_OS_TABS = [
  "dashboard",
  "approvals",
  "agents",
  "tools",
  "providers",
  "audit",
] as const;

export type AiOsTab = (typeof AI_OS_TABS)[number];

export const AI_OS_TAB_LABELS: Record<AiOsTab, string> = {
  dashboard: "Dashboard",
  approvals: "Approvals",
  agents: "Agents",
  tools: "Tools",
  providers: "Providers",
  audit: "Audit Logs",
};

export const aiOsKpis = [
  {
    label: "Token spend (month)",
    value: "1.24M",
    sub: "62% of 2M budget",
    pct: 62,
  },
  {
    label: "Pending approvals",
    value: 7,
    sub: "3 high-risk",
    alert: true,
  },
  {
    label: "Active tasks",
    value: 4,
    sub: "2 async · 2 queued",
  },
  {
    label: "Agent runs (today)",
    value: 186,
    sub: "+12% vs yesterday",
    up: true,
  },
];

export const tokenUsageChart = [
  { day: "Mon", tokens: 142000 },
  { day: "Tue", tokens: 168000 },
  { day: "Wed", tokens: 155000 },
  { day: "Thu", tokens: 201000 },
  { day: "Fri", tokens: 178000 },
  { day: "Sat", tokens: 92000 },
  { day: "Sun", tokens: 104000 },
];

export const agentActivityChart = [
  { agent: "Catalog", runs: 48 },
  { agent: "Analytics", runs: 42 },
  { agent: "Marketing", runs: 31 },
  { agent: "SEO", runs: 28 },
  { agent: "Inventory", runs: 22 },
  { agent: "Sales", runs: 15 },
];

export const domainAgents = [
  {
    id: "catalog_agent",
    name: "Catalog Agent",
    domain: "Product Master",
    status: "active" as AiAgentStatus,
    tools: 12,
    runsToday: 48,
    model: "gpt-4o-mini",
    description: "Product copy, tags, attributes, publish proposals",
  },
  {
    id: "inventory_agent",
    name: "Inventory Agent",
    domain: "Inventory",
    status: "active" as AiAgentStatus,
    tools: 8,
    runsToday: 22,
    model: "gpt-4o-mini",
    description: "Forecast, reorder, adjustment proposals",
  },
  {
    id: "purchase_agent",
    name: "Purchase Agent",
    domain: "Purchase",
    status: "idle" as AiAgentStatus,
    tools: 6,
    runsToday: 5,
    model: "claude-sonnet",
    description: "RFQ draft, PO suggest, vendor match",
  },
  {
    id: "sales_agent",
    name: "Sales Agent",
    domain: "Sales",
    status: "active" as AiAgentStatus,
    tools: 9,
    runsToday: 15,
    model: "gpt-4o",
    description: "Quote draft, discount suggest, follow-up",
  },
  {
    id: "crm_agent",
    name: "CRM Agent",
    domain: "CRM",
    status: "active" as AiAgentStatus,
    tools: 10,
    runsToday: 19,
    model: "gpt-4o-mini",
    description: "Lead score, churn, next-best-action",
  },
  {
    id: "marketing_agent",
    name: "Marketing Agent",
    domain: "Marketing",
    status: "active" as AiAgentStatus,
    tools: 11,
    runsToday: 31,
    model: "gpt-4o",
    description: "Campaign suggest, segments, content draft",
  },
  {
    id: "seo_agent",
    name: "SEO Agent",
    domain: "SEO",
    status: "active" as AiAgentStatus,
    tools: 8,
    runsToday: 28,
    model: "gpt-4o-mini",
    description: "Meta, schema, audit, keyword suggest",
  },
  {
    id: "support_agent",
    name: "Support Agent",
    domain: "Helpdesk",
    status: "idle" as AiAgentStatus,
    tools: 7,
    runsToday: 8,
    model: "claude-haiku",
    description: "Ticket summarize, KB suggest, reply draft",
  },
  {
    id: "developer_agent",
    name: "Developer Agent",
    domain: "Platform",
    status: "disabled" as AiAgentStatus,
    tools: 5,
    runsToday: 0,
    model: "—",
    description: "Schema read, doc RAG, migration plan",
  },
  {
    id: "analytics_agent",
    name: "Analytics Agent",
    domain: "Analytics",
    status: "active" as AiAgentStatus,
    tools: 6,
    runsToday: 42,
    model: "gpt-4o",
    description: "Reports, forecasts, anomaly narrative",
  },
];

export const pendingApprovals = [
  {
    id: "apr_001",
    agent: "Catalog Agent",
    tool: "catalog.propose_product_update",
    summary: "Update price: ৳599 → ৳649 (+8.3%)",
    reason: "Competitor avg ৳655; margin remains 22%",
    risk: "medium" as AiRiskTier,
    status: "pending" as AiApprovalStatus,
    requestedAt: "2026-06-15 10:42",
    entity: "Premium Cotton T-Shirt",
  },
  {
    id: "apr_002",
    agent: "Inventory Agent",
    tool: "inventory.propose_reorder",
    summary: "Reorder 120 units · Wireless Earbuds Pro",
    reason: "Stock below safety level; 14-day velocity rising",
    risk: "high" as AiRiskTier,
    status: "pending" as AiApprovalStatus,
    requestedAt: "2026-06-15 09:18",
    entity: "SKU WEB-PRO-002",
  },
  {
    id: "apr_003",
    agent: "Marketing Agent",
    tool: "marketing.draft_campaign",
    summary: "Summer Sale email campaign draft",
    reason: "Segment: inactive 30d customers (2,140)",
    risk: "low" as AiRiskTier,
    status: "pending" as AiApprovalStatus,
    requestedAt: "2026-06-15 08:55",
    entity: "Campaign draft",
  },
  {
    id: "apr_004",
    agent: "SEO Agent",
    tool: "seo.propose_meta_update",
    summary: "Meta title update for /electronics",
    reason: "Missing primary keyword; CTR below category avg",
    risk: "low" as AiRiskTier,
    status: "pending" as AiApprovalStatus,
    requestedAt: "2026-06-14 16:30",
    entity: "Electronics category",
  },
];

export const aiToolsCatalog = [
  {
    id: "product_description",
    name: "Product Description",
    agent: "Catalog",
    category: "Catalog",
    risk: "low" as AiRiskTier,
    description: "Generate rich product descriptions from bullet points",
  },
  {
    id: "blog_writer",
    name: "Blog Writer",
    agent: "Marketing",
    category: "Content",
    risk: "low" as AiRiskTier,
    description: "Draft blog posts from topic and tone",
  },
  {
    id: "seo_generator",
    name: "SEO Generator",
    agent: "SEO",
    category: "SEO",
    risk: "low" as AiRiskTier,
    description: "Full SEO content optimization suggestions",
  },
  {
    id: "meta_generator",
    name: "Meta Generator",
    agent: "SEO",
    category: "SEO",
    risk: "low" as AiRiskTier,
    description: "Title, description, keywords for any URL",
  },
  {
    id: "product_tags",
    name: "Product Tags",
    agent: "Catalog",
    category: "Catalog",
    risk: "low" as AiRiskTier,
    description: "Auto-tag products for search and filters",
  },
  {
    id: "review_summary",
    name: "Review Summary",
    agent: "Catalog",
    category: "Catalog",
    risk: "low" as AiRiskTier,
    description: "Summarize customer reviews and sentiment",
  },
  {
    id: "customer_support",
    name: "Customer Support",
    agent: "Support",
    category: "Support",
    risk: "medium" as AiRiskTier,
    description: "Draft replies and suggest KB articles",
  },
  {
    id: "translation",
    name: "Translation",
    agent: "Catalog",
    category: "Content",
    risk: "low" as AiRiskTier,
    description: "Translate product content to Bengali or English",
  },
  {
    id: "image_generation",
    name: "Image Generation",
    agent: "Marketing",
    category: "Creative",
    risk: "medium" as AiRiskTier,
    description: "Generate product lifestyle images",
  },
  {
    id: "banner_generator",
    name: "Banner Generator",
    agent: "Marketing",
    category: "Creative",
    risk: "low" as AiRiskTier,
    description: "Campaign banners for web and social",
  },
  {
    id: "sales_forecast",
    name: "Sales Forecast",
    agent: "Analytics",
    category: "Analytics",
    risk: "low" as AiRiskTier,
    description: "Revenue and order volume projections",
  },
  {
    id: "inventory_forecast",
    name: "Inventory Forecast",
    agent: "Inventory",
    category: "Analytics",
    risk: "medium" as AiRiskTier,
    description: "Stock-out risk and reorder recommendations",
  },
  {
    id: "product_recommendation",
    name: "Product Recommendation",
    agent: "Analytics",
    category: "Merchandising",
    risk: "low" as AiRiskTier,
    description: "Cross-sell and upsell suggestions",
  },
];

export const aiProviders = [
  {
    id: "openai",
    name: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini"],
    status: "healthy" as AiProviderStatus,
    latencyMs: 420,
    spendPct: 58,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    models: ["claude-sonnet", "claude-haiku"],
    status: "healthy" as AiProviderStatus,
    latencyMs: 510,
    spendPct: 32,
  },
  {
    id: "google",
    name: "Google Gemini",
    models: ["gemini-2.0-flash"],
    status: "degraded" as AiProviderStatus,
    latencyMs: 890,
    spendPct: 8,
  },
  {
    id: "local",
    name: "Local (Ollama)",
    models: ["llama3.2"],
    status: "offline" as AiProviderStatus,
    latencyMs: 0,
    spendPct: 2,
  },
];

export const aiAuditLogs = [
  {
    id: "log_001",
    action: "ai.action.proposed",
    agent: "Catalog Agent",
    user: "admin@urbanwear.bd",
    summary: "Proposed price update for prod_0042",
    tokens: 1840,
    at: "2026-06-15 10:42:18",
  },
  {
    id: "log_002",
    action: "ai.task.completed",
    agent: "SEO Agent",
    user: "manager@urbanwear.bd",
    summary: "Generated meta for 12 category pages",
    tokens: 6200,
    at: "2026-06-15 10:15:03",
  },
  {
    id: "log_003",
    action: "ai.action.executed",
    agent: "Marketing Agent",
    user: "admin@urbanwear.bd",
    summary: "Applied campaign draft to Summer Sale",
    tokens: 3100,
    at: "2026-06-15 09:48:44",
  },
  {
    id: "log_004",
    action: "ai.action.rejected",
    agent: "Inventory Agent",
    user: "ops@urbanwear.bd",
    summary: "Rejected reorder proposal — budget cap",
    tokens: 920,
    at: "2026-06-15 09:22:11",
  },
  {
    id: "log_005",
    action: "ai.budget.alert",
    agent: "Chief Agent",
    user: "system",
    summary: "Token budget reached 60% for June",
    tokens: 0,
    at: "2026-06-15 08:00:00",
  },
  {
    id: "log_006",
    action: "ai.action.proposed",
    agent: "Sales Agent",
    user: "sales@urbanwear.bd",
    summary: "Suggested 8% discount on bulk order ORD-1042",
    tokens: 2100,
    at: "2026-06-14 17:55:30",
  },
];

export const chiefAgentSuggestions = [
  "Summarize today's operations",
  "Which products need reorder this week?",
  "Draft summer sale campaign",
  "Explain margin drop last month",
  "Generate SEO for new arrivals",
];
