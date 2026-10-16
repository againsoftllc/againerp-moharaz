"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Crown,
  Edit2,
  Mail,
  MapPin,
  Phone,
  ShoppingBag,
  User,
  Wallet,
  Star,
  Paperclip,
  Package,
  PhoneCall,
  MessageSquare,
  Bell,
  UserPlus,
  Tag,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  TrendingUp,
} from "lucide-react";
import { useCustomerStore } from "@/lib/store/customer-store";
import {
  CUSTOMER_GROUP_LABELS,
  CUSTOMER_STATUS_LABELS,
  type Customer,
  type CustomerStatus,
  type LoyaltyTier,
} from "@/lib/mock-data/customers";
import { cn, formatCurrency, formatDate, formatQuantity } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerAiInsightsPanel } from "@/components/customers/customer-ai-insights-panel";
import { CustomerChatter } from "@/components/customers/customer-chatter";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Lifecycle stages ─────────────────────────────────────────────────────────

const LIFECYCLE_STAGES = [
  { key: "new", label: "New" },
  { key: "active", label: "Active" },
  { key: "loyal", label: "Loyal" },
  { key: "vip", label: "VIP" },
  { key: "at_risk", label: "At Risk" },
];

function getLifecycleStage(c: { totalOrders: number; riskLevel: string; status: string }) {
  if (c.status === "vip") return "vip";
  if (c.riskLevel === "high") return "at_risk";
  if (c.totalOrders >= 10) return "loyal";
  if (c.totalOrders >= 2) return "active";
  return "new";
}

function LifecycleBar({ stage }: { stage: string }) {
  const idx = LIFECYCLE_STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="flex items-center gap-0">
      {LIFECYCLE_STAGES.map((s, i) => {
        const passed = i <= idx && stage !== "at_risk";
        const isAtRisk = stage === "at_risk";
        const isActive = s.key === stage;
        return (
          <div key={s.key} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={cn(
                "h-1.5 w-full",
                i === 0 ? "rounded-l-full" : "",
                i === LIFECYCLE_STAGES.length - 1 ? "rounded-r-full" : "",
                isAtRisk && isActive ? "bg-destructive" : passed ? "bg-primary" : "bg-muted",
              )}
            />
            <span
              className={cn(
                "text-[9px] font-medium",
                isActive
                  ? isAtRisk ? "text-destructive" : "text-primary"
                  : passed ? "text-primary/70" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-input bg-card">
      <div className="flex items-center gap-2 border-b border-input px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function loyaltyBadgeClass(tier: LoyaltyTier) {
  if (tier === "platinum" || tier === "vip")
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  if (tier === "gold")
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

function statusBadgeVariant(status: string): "success" | "warning" | "muted" | "outline" {
  if (status === "active") return "success";
  if (status === "vip") return "warning";
  if (status === "blocked") return "warning";
  return "muted";
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Props = {
  customerId: string;
  customer?: Customer | null;
  loading?: boolean;
  onStatusChange?: (id: string, status: CustomerStatus) => void | Promise<void>;
};

export function CustomerDetailWorkspace({
  customerId,
  customer: customerProp,
  loading: loadingProp = false,
}: Props) {
  const storeCustomer = useCustomerStore((s) => s.getById(customerId));
  const addComment = useCustomerStore((s) => s.addComment);
  const addTimelineEntry = useCustomerStore((s) => s.addTimelineEntry);
  const customer = customerProp ?? storeCustomer;
  const loading = loadingProp && !customer;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-muted-foreground">
        <p className="text-sm">Loading customer…</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-muted-foreground">
        <p className="text-sm">Customer not found.</p>
        <Link href="/customers" className="mt-2 text-xs text-primary hover:underline">
          ← Back to All Customers
        </Link>
      </div>
    );
  }

  const initials = customer.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const lifecycleStage = getLifecycleStage(customer);

  const handleAddComment = (body: string, isInternal: boolean) => {
    addComment(customer.id, {
      author: "Admin",
      authorInitials: "AD",
      body,
      isInternal,
      at: new Date().toISOString(),
    });
    addTimelineEntry(customer.id, {
      type: "note",
      title: isInternal ? "Internal note added" : "Message sent",
      description: body.slice(0, 60) + (body.length > 60 ? "…" : ""),
      actor: "Admin",
      actorInitials: "AD",
      at: new Date().toISOString(),
    });
    toast.success(isInternal ? "Note added" : "Message sent");
  };

  return (
    <div className="space-y-4">
      {/* ── Back + Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/customers"
            className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All Customers
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{customer.name}</h1>
            {customer.status === "vip" && <Crown className="h-5 w-5 text-yellow-500" />}
            <Badge variant={statusBadgeVariant(customer.status)} className="capitalize text-xs">
              {CUSTOMER_STATUS_LABELS[customer.status]}
            </Badge>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${loyaltyBadgeClass(customer.loyaltyTier)}`}
            >
              {customer.loyaltyTier}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {customer.customerId} · {CUSTOMER_GROUP_LABELS[customer.group]} · {customer.city}
            {customer.assignedStaff && ` · ${customer.assignedStaff}`}
          </p>
        </div>

        {/* Quick Action Buttons — HubSpot style */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => toast.info("Call customer")}
          >
            <PhoneCall className="h-3.5 w-3.5" /> Call
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => toast.info("Send message")}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Message
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => toast.info("Schedule activity")}
          >
            <Bell className="h-3.5 w-3.5" /> Activity
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => toast.info("Create order for customer")}
          >
            <Package className="h-3.5 w-3.5" /> New Order
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => toast.info("Edit customer")}>
                <Edit2 className="mr-2 h-3.5 w-3.5" /> Edit details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info("Add tag")}>
                <Tag className="mr-2 h-3.5 w-3.5" /> Add tag
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info("Assign staff")}>
                <UserPlus className="mr-2 h-3.5 w-3.5" /> Assign staff
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info("View full order history")}>
                <ShoppingBag className="mr-2 h-3.5 w-3.5" /> Order history
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Lifecycle bar (HubSpot pipeline feel) ── */}
      <div className="rounded-xl border border-input bg-card px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">Customer Lifecycle Stage</p>
          <span className="text-xs font-medium capitalize text-primary">
            {LIFECYCLE_STAGES.find((s) => s.key === lifecycleStage)?.label}
          </span>
        </div>
        <LifecycleBar stage={lifecycleStage} />
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        {/* ══ LEFT COLUMN ══ */}
        <div className="space-y-4">

          {/* ── Profile Card ── */}
          <SectionCard
            title="Customer Profile"
            icon={User}
            action={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => toast.info("Edit profile")}
              >
                <Edit2 className="h-3 w-3" /> Edit
              </Button>
            }
          >
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                {initials}
              </div>
              <div className="min-w-0 flex-1 divide-y divide-input">
                <InfoRow label="Customer ID" value={<span className="font-mono text-primary">{customer.customerId}</span>} />
                <InfoRow
                  label="Phone"
                  value={
                    <a href={`tel:${customer.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                      <Phone className="h-3 w-3" />
                      {customer.phone}
                    </a>
                  }
                />
                <InfoRow
                  label="Email"
                  value={
                    <a href={`mailto:${customer.email}`} className="flex items-center gap-1 text-primary hover:underline">
                      <Mail className="h-3 w-3" />
                      {customer.email}
                    </a>
                  }
                />
                <InfoRow label="Group" value={<span className="capitalize">{CUSTOMER_GROUP_LABELS[customer.group]}</span>} />
                <InfoRow
                  label="Loyalty"
                  value={
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold capitalize ${loyaltyBadgeClass(customer.loyaltyTier)}`}>
                      {customer.loyaltyTier}
                    </span>
                  }
                />
                <InfoRow label="Customer Since" value={formatDate(customer.customerSince)} />
                <InfoRow label="Assigned Staff" value={customer.assignedStaff ?? <span className="text-muted-foreground">Unassigned</span>} />
                {customer.tags.length > 0 && (
                  <div className="flex items-start justify-between gap-4 py-1.5 text-xs">
                    <span className="shrink-0 text-muted-foreground">Tags</span>
                    <div className="flex flex-wrap justify-end gap-1">
                      {customer.tags.map((tag) => (
                        <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* ── Statistics ── */}
          <SectionCard title="Customer Intelligence" icon={TrendingUp}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Total Orders", value: customer.totalOrders, sub: "Lifetime" },
                { label: "Total Spend", value: formatCurrency(customer.totalSpend), sub: "Lifetime" },
                { label: "Avg Order", value: formatCurrency(customer.avgOrderValue), sub: "Per order" },
                { label: "Return Rate", value: `${customer.returnRate}%`, sub: "% of orders", alert: customer.returnRate > 15 },
                { label: "Wallet Balance", value: formatCurrency(customer.walletBalance), sub: "Credits" },
                { label: "Reward Points", value: formatQuantity(customer.rewardPoints), sub: "Points" },
                {
                  label: "Last Purchase",
                  value: customer.lastOrderDate
                    ? formatDate(customer.lastOrderDate)
                    : "—",
                  sub: "Date",
                },
                {
                  label: "Predicted LTV",
                  value: `${formatCurrency(Math.round(customer.aiInsights.predictedLtv / 1000))}K`,
                  sub: "AI forecast",
                  highlight: true,
                },
              ].map(({ label, value, sub, alert, highlight }) => (
                <div
                  key={label}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    alert ? "border-destructive/30 bg-destructive/5" : "border-input",
                    highlight ? "border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/20" : "",
                  )}
                >
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className={cn("mt-0.5 text-sm font-bold", highlight && "text-violet-600 dark:text-violet-400")}>
                    {value}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{sub}</p>
                </div>
              ))}
            </div>

            {/* Retention probability bar */}
            <div className="mt-3 rounded-lg border border-input p-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium">Retention Probability</span>
                <span className={cn(
                  "font-bold",
                  customer.aiInsights.retentionProbability >= 70 ? "text-emerald-600 dark:text-emerald-400"
                  : customer.aiInsights.retentionProbability >= 40 ? "text-yellow-600 dark:text-yellow-400"
                  : "text-destructive",
                )}>
                  {customer.aiInsights.retentionProbability}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    customer.aiInsights.retentionProbability >= 70 ? "bg-emerald-500"
                    : customer.aiInsights.retentionProbability >= 40 ? "bg-yellow-500"
                    : "bg-destructive",
                  )}
                  style={{ width: `${customer.aiInsights.retentionProbability}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                AI-predicted probability of customer remaining active in next 90 days
              </p>
            </div>
          </SectionCard>

          {/* ── Addresses ── */}
          {customer.addresses.length > 0 && (
            <SectionCard
              title="Addresses"
              icon={MapPin}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => toast.info("Add address")}
                >
                  + Add
                </Button>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {customer.addresses.map((addr) => (
                  <div key={addr.id} className="rounded-lg border border-input p-3 text-xs">
                    <div className="mb-1.5 flex items-center gap-2">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <span className="font-semibold">{addr.label}</span>
                      {addr.isDefault && (
                        <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] text-primary">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      {addr.address}
                      <br />
                      {addr.city}, {addr.region}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* ── Recent Orders (Shopify style) ── */}
          {customer.recentOrders.length > 0 && (
            <SectionCard
              title="Recent Orders"
              icon={Package}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => toast.info("Create order")}
                >
                  + New Order
                </Button>
              }
            >
              <div className="space-y-2">
                {customer.recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href="/sales"
                    className="flex w-full items-center gap-3 rounded-lg border border-input px-3 py-2.5 text-xs transition-colors hover:bg-muted/40"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Package className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-primary">{order.orderNumber}</p>
                      <p className="text-muted-foreground">{formatDate(order.date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(order.amount)}</p>
                      <div className="flex items-center gap-1 justify-end">
                        <Badge
                          variant={order.paymentStatus === "paid" ? "success" : "outline"}
                          className="text-[9px] capitalize"
                        >
                          {order.paymentStatus}
                        </Badge>
                        <span className="capitalize text-muted-foreground">{order.status}</span>
                      </div>
                    </div>
                  </Link>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1 h-7 w-full text-xs"
                  onClick={() => toast.info("View all orders for customer")}
                >
                  View all orders
                </Button>
              </div>
            </SectionCard>
          )}

          {/* ── Wallet + Rewards side by side ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Wallet */}
            {customer.walletTransactions.length > 0 && (
              <SectionCard title="Wallet" icon={Wallet}>
                <div className="mb-3 flex items-center justify-between rounded-lg bg-cyan-50 p-3 dark:bg-cyan-950/20">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Balance</p>
                    <p className="text-lg font-bold text-cyan-600 dark:text-cyan-400">
                      {formatCurrency(customer.walletBalance)}
                    </p>
                  </div>
                  <Wallet className="h-6 w-6 text-cyan-500/50" />
                </div>
                <div className="space-y-1.5">
                  {customer.walletTransactions.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                          t.type === "credit"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                        )}
                      >
                        {t.type === "credit" ? "+" : "-"}{formatCurrency(t.amount)}
                      </span>
                      <span className="flex-1 truncate text-muted-foreground">{t.label}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Rewards */}
            {customer.rewardEvents.length > 0 && (
              <SectionCard title="Rewards" icon={Star}>
                <div className="mb-3 flex items-center justify-between rounded-lg bg-yellow-50 p-3 dark:bg-yellow-950/20">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Points</p>
                    <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                      {formatQuantity(customer.rewardPoints)}
                    </p>
                  </div>
                  <Star className="h-6 w-6 text-yellow-500/50" />
                </div>
                <div className="space-y-1.5">
                  {customer.rewardEvents.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                          r.type === "earned"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : r.type === "expired"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                        )}
                      >
                        {r.type === "earned" ? "+" : "-"}{r.points} pts
                      </span>
                      <span className="flex-1 truncate text-muted-foreground">{r.label}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>

          {/* ── Attachments ── */}
          {customer.attachments.length > 0 && (
            <SectionCard
              title="Attachments"
              icon={Paperclip}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => toast.info("Upload attachment")}
                >
                  + Upload
                </Button>
              }
            >
              <div className="space-y-2">
                {customer.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-3 rounded-lg border border-input px-3 py-2.5 text-xs"
                  >
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">{att.name}</p>
                      <p className="text-muted-foreground capitalize">{att.type.replace("_", " ")} · {att.size}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => toast.info("Download")}
                    >
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* ── Open Activities ── */}
          {customer.activities.filter((a) => a.status === "open").length > 0 && (
            <SectionCard title="Open Activities" icon={CheckCircle2}>
              <div className="space-y-2">
                {customer.activities
                  .filter((a) => a.status === "open")
                  .map((a) => (
                    <div
                      key={a.id}
                      className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs dark:border-blue-800 dark:bg-blue-950/20"
                    >
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                      <div className="flex-1">
                        <p className="font-medium">{a.title}</p>
                        <p className="text-muted-foreground">
                          {a.assignee ? `Assigned to ${a.assignee}` : "Unassigned"}
                          {a.dueDate ? ` · Due ${formatDate(a.dueDate)}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => toast.success("Activity marked done")}
                      >
                        Done
                      </Button>
                    </div>
                  ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* ══ RIGHT COLUMN ══ */}
        <div className="space-y-4">
          {/* AI Insights */}
          <CustomerAiInsightsPanel insights={customer.aiInsights} />

          {/* Again-style Chatter / Timeline */}
          <CustomerChatter
            timeline={customer.timeline}
            comments={customer.comments}
            activities={customer.activities}
            onAddComment={handleAddComment}
          />
        </div>
      </div>
    </div>
  );
}
