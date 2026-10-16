"use client";

import Link from "next/link";
import { Crown, Phone, Mail, MapPin } from "lucide-react";
import { cn, formatCurrency, formatDate, formatQuantity } from "@/lib/utils";
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import {
  CUSTOMER_GROUP_LABELS,
  CUSTOMER_STATUS_LABELS,
  type Customer,
} from "@/lib/mock-data/customers";

function loyaltyPill(tier: string) {
  if (tier === "platinum" || tier === "vip")
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  if (tier === "gold")
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

function riskBadge(level: string) {
  if (level === "high") return "bg-destructive/10 text-destructive";
  if (level === "medium") return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
}

type Props = { customers: Customer[] };

export function CustomerMobileCards({ customers }: Props) {
  if (customers.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground lg:hidden">
        No customers match your filters.
      </p>
    );
  }

  return (
    <div className="space-y-3 lg:hidden">
      {customers.map((c) => {
        const initials = c.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();

        return (
          <div
            key={c.id}
            className="rounded-xl border border-input bg-card p-4 shadow-sm"
          >
            <div className="flex items-start gap-1">
              <Link
                href={`/customers/${c.id}`}
                className="min-w-0 flex-1 transition-all hover:opacity-90"
              >
            {/* Row 1: avatar + name + badges */}
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-sm">{c.name}</span>
                  {c.status === "vip" && (
                    <Crown className="h-3.5 w-3.5 text-yellow-500" />
                  )}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize",
                      loyaltyPill(c.loyaltyTier),
                    )}
                  >
                    {c.loyaltyTier}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize",
                      c.status === "active"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : c.status === "blocked"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {CUSTOMER_STATUS_LABELS[c.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {c.customerId} · {CUSTOMER_GROUP_LABELS[c.group]}
                </p>
              </div>
            </div>

            {/* Row 2: contact info */}
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" />
                {c.phone}
              </div>
              <div className="flex items-center gap-1 truncate">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.email}</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {c.city}
              </div>
              {c.lastOrderDate && (
                <div className="flex items-center gap-1">
                  <span>Last order:</span>
                  <span>{formatDate(c.lastOrderDate)}</span>
                </div>
              )}
            </div>

            {/* Row 3: stats */}
            <div className="mt-3 flex flex-wrap gap-3 border-t border-input pt-3">
              <div className="text-center">
                <p className="text-xs font-bold">{c.totalOrders}</p>
                <p className="text-[10px] text-muted-foreground">Orders</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold">{formatCurrency(c.totalSpend)}</p>
                <p className="text-[10px] text-muted-foreground">Total Spend</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold">{formatQuantity(c.rewardPoints)}</p>
                <p className="text-[10px] text-muted-foreground">Points</p>
              </div>
              <div className="ml-auto text-right">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-semibold",
                    riskBadge(c.riskLevel),
                  )}
                >
                  Risk {c.riskScore}%
                </span>
              </div>
            </div>
              </Link>
              <ActivityTriggerButton
                entity={{
                  type: "customer",
                  id: c.id,
                  label: c.name,
                  subtitle: c.customerId,
                }}
                className="h-8 w-8 shrink-0"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
