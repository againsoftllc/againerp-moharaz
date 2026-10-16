"use client";

import type {
  Customer,
  CustomerOrderSummary,
  CustomerRewardEvent,
  CustomerTimelineEvent,
  CustomerWalletTransaction,
  RiskLevel,
} from "@/lib/mock-data/customers";
import {
  CUSTOMER_GROUP_LABELS,
  CUSTOMER_STATUS_LABELS,
} from "@/lib/mock-data/customers";
import { cn, formatCurrency, formatDate, formatDateTime, formatQuantity } from "@/lib/utils";
import { useCustomerFeatureFlags } from "@/lib/customers/use-customer-settings";

export function PartnerStatusPill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "brand";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-none border px-1.5 py-0.5 text-[11px] font-medium capitalize",
        tone === "neutral" && "border-border/70 bg-muted/40 text-muted-foreground",
        tone === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
        tone === "warning" &&
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
        tone === "danger" &&
          "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
        tone === "info" &&
          "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
        tone === "brand" &&
          "border-[#00a09d]/30 bg-[#00a09d]/10 text-[#00a09d]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PartnerKpiGrid({
  items,
}: {
  items: { label: string; value: React.ReactNode; sub?: string; alert?: boolean }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-none border border-border/70 bg-background/60 px-2.5 py-2",
            item.alert && "border-destructive/30 bg-destructive/5",
          )}
        >
          <p className="text-[11px] text-muted-foreground">{item.label}</p>
          <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-foreground">
            {item.value}
          </p>
          {item.sub ? <p className="text-[10px] text-muted-foreground">{item.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function PartnerTabEmpty({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-sm border border-dashed border-border/80 bg-background/40 px-4 py-8 text-center">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-[12px] text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export function PartnerSectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {action}
    </div>
  );
}

function riskTone(level: RiskLevel): "success" | "warning" | "danger" {
  if (level === "high") return "danger";
  if (level === "medium") return "warning";
  return "success";
}

function orderStatusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  const s = status.toLowerCase();
  if (s.includes("deliver") || s.includes("complete") || s.includes("paid")) return "success";
  if (s.includes("cancel") || s.includes("fail") || s.includes("refund")) return "danger";
  if (s.includes("pending") || s.includes("due") || s.includes("partial")) return "warning";
  if (s.includes("process") || s.includes("ship")) return "info";
  return "neutral";
}

export function PartnerOrderRows({ orders }: { orders: CustomerOrderSummary[] }) {
  if (orders.length === 0) {
    return (
      <PartnerTabEmpty
        title="No orders yet"
        description="Orders for this customer will appear here once sales activity starts."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-none border border-border/70 bg-background/50">
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] gap-2 border-b border-border/60 bg-muted/30 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Order</span>
        <span>Date</span>
        <span>Status</span>
        <span>Payment</span>
        <span className="text-right">Amount</span>
      </div>
      <ul className="divide-y divide-border/50">
        {orders.map((order) => (
          <li
            key={`${order.source ?? "order"}-${order.id}`}
            className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] items-center gap-2 px-2.5 py-2 text-[13px]"
          >
            <span className="truncate font-medium text-foreground">{order.orderNumber}</span>
            <span className="truncate text-muted-foreground">
              {formatDate(order.date)}
            </span>
            <PartnerStatusPill tone={orderStatusTone(order.status)}>{order.status}</PartnerStatusPill>
            <PartnerStatusPill tone={orderStatusTone(order.paymentStatus)}>
              {order.paymentStatus}
            </PartnerStatusPill>
            <span className="text-right tabular-nums text-foreground">
              {formatCurrency(order.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PartnerWalletRows({ rows }: { rows: CustomerWalletTransaction[] }) {
  if (rows.length === 0) {
    return (
      <PartnerTabEmpty
        title="No wallet activity"
        description="Credits and debits will show here when wallet transactions exist."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-sm border border-border/70 bg-background/50">
      <ul className="divide-y divide-border/50">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 px-2.5 py-2 text-[13px]">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{row.label}</p>
              <p className="text-[11px] text-muted-foreground">
                {formatDateTime(row.at)}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 tabular-nums font-medium",
                row.type === "credit"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-foreground",
              )}
            >
              {row.type === "credit" ? "+" : "−"}
              {formatCurrency(Math.abs(row.amount))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PartnerRewardRows({ rows }: { rows: CustomerRewardEvent[] }) {
  if (rows.length === 0) {
    return (
      <PartnerTabEmpty
        title="No points history"
        description="Example: order complete → +125 earned · checkout discount → −200 redeemed · expiry rule → −50 expired."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-none border border-border/70 bg-background/50">
      <ul className="divide-y divide-border/50">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 px-2.5 py-2 text-[13px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate font-medium text-foreground">{row.label}</p>
                <PartnerStatusPill
                  tone={
                    row.type === "earned"
                      ? "success"
                      : row.type === "redeemed"
                        ? "brand"
                        : "warning"
                  }
                >
                  {row.type}
                </PartnerStatusPill>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {formatDateTime(row.at)}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 tabular-nums font-medium",
                row.type === "earned"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : row.type === "redeemed"
                    ? "text-[#00a09d]"
                    : "text-amber-600 dark:text-amber-400",
              )}
            >
              {row.type === "earned" ? "+" : "−"}
              {formatQuantity(Math.abs(row.points))} pts
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function historyRoleTone(role?: string): "brand" | "warning" | "neutral" {
  const r = (role || "").toLowerCase();
  if (r === "customer") return "warning";
  if (r === "admin") return "brand";
  return "neutral";
}

function historyRoleLabel(event: CustomerTimelineEvent): string {
  const role = (event.role || "").toLowerCase();
  if (role === "customer") return "Customer";
  if (role === "admin") return "Admin";
  if (role === "system") return "System";
  const actor = (event.actor || "").toLowerCase();
  if (actor === "system") return "System";
  if (actor.includes("customer")) return "Customer";
  return "Admin";
}

export function PartnerHistoryRows({ rows }: { rows: CustomerTimelineEvent[] }) {
  const sorted = [...rows].sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });

  if (sorted.length === 0) {
    return (
      <PartnerTabEmpty
        title="No history yet"
        description="Admin and customer profile updates, support activity, and status changes appear here."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-none border border-border/70 bg-background/50">
      <ul className="divide-y divide-border/50">
        {sorted.map((row) => {
          const roleLabel = historyRoleLabel(row);
          return (
            <li key={row.id} className="flex items-start justify-between gap-3 px-2.5 py-2.5 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <p className="font-medium text-foreground">{row.title}</p>
                  <PartnerStatusPill tone={historyRoleTone(roleLabel.toLowerCase())}>
                    {roleLabel}
                  </PartnerStatusPill>
                  <PartnerStatusPill className="capitalize">{row.type.replace(/_/g, " ")}</PartnerStatusPill>
                </div>
                {row.description ? (
                  <p className="mt-0.5 line-clamp-3 text-[12px] text-muted-foreground">
                    {row.description}
                  </p>
                ) : null}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {row.actor}
                  {" · "}
                  {formatDateTime(row.at)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PartnerOverviewPanel({ customer }: { customer: Customer }) {
  const flags = useCustomerFeatureFlags();
  const groupLabel =
    CUSTOMER_GROUP_LABELS[customer.group as keyof typeof CUSTOMER_GROUP_LABELS] ??
    customer.group;

  const kpiItems = [
    ...(flags.tabOrders
      ? [
          { label: "Total Orders", value: customer.totalOrders, sub: "Lifetime" },
          { label: "Total Spend", value: formatCurrency(customer.totalSpend), sub: "Lifetime" },
          { label: "Avg Order", value: formatCurrency(customer.avgOrderValue), sub: "Per order" },
          {
            label: "Return Rate",
            value: `${customer.returnRate}%`,
            sub: "Of orders",
            alert: customer.returnRate > 15,
          },
          {
            label: "Last Order",
            value: customer.lastOrderDate
              ? formatDate(customer.lastOrderDate)
              : "—",
            sub: "Date",
          },
        ]
      : []),
    ...(flags.wallet
      ? [{ label: "Wallet", value: formatCurrency(customer.walletBalance), sub: "Balance" }]
      : []),
    ...(flags.rewardPoints
      ? [
          {
            label: "Points",
            value: formatQuantity(customer.rewardPoints),
            sub: "Loyalty",
          },
        ]
      : []),
    ...(flags.openingBalance
      ? [
          {
            label: "Opening Balance",
            value: formatCurrency(customer.openingBalance ?? 0),
            sub: "On books",
          },
        ]
      : []),
    ...(flags.creditLimit
      ? [
          {
            label: "Credit Limit",
            value: formatCurrency(customer.creditLimit ?? 0),
            sub: "Max due",
          },
        ]
      : []),
    {
      label: "Account Manager",
      value: customer.assignedStaff || "—",
      sub: "Assigned",
    },
  ];

  const recentHistory = flags.tabHistory
    ? [...(customer.timeline ?? [])]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 5)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <PartnerStatusPill tone="brand">{CUSTOMER_STATUS_LABELS[customer.status]}</PartnerStatusPill>
        <PartnerStatusPill>{groupLabel}</PartnerStatusPill>
        {flags.rewardPoints || flags.tabLoyalty ? (
          <PartnerStatusPill tone="info" className="capitalize">
            {customer.loyaltyTier}
          </PartnerStatusPill>
        ) : null}
        <PartnerStatusPill tone={riskTone(customer.riskLevel)}>
          Risk {customer.riskLevel} ({customer.riskScore})
        </PartnerStatusPill>
        <span className="text-[12px] text-muted-foreground">
          Since {formatDate(customer.customerSince)}
        </span>
      </div>

      {kpiItems.length > 0 ? <PartnerKpiGrid items={kpiItems} /> : null}

      {flags.tabOrders ? (
        <div>
          <PartnerSectionTitle title="Recent Orders" />
          <PartnerOrderRows orders={customer.recentOrders.slice(0, 5)} />
        </div>
      ) : null}

      {flags.tabHistory ? (
        <div>
          <PartnerSectionTitle title="Recent History" />
          <PartnerHistoryRows rows={recentHistory} />
        </div>
      ) : null}
    </div>
  );
}

export function PartnerCasesPlaceholder() {
  return (
    <PartnerTabEmpty
      title="No case data available"
      description="Use the Cases tab from a saved customer record."
    />
  );
}
