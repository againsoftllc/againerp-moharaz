"use client";

import { useSubscriptionStatus } from "@/lib/store/subscription-status-store";

const MESSAGES: Record<string, string> = {
  suspended: "This company's account has been suspended. Contact support to reactivate it.",
  cancelled: "This company's subscription has been cancelled.",
  trial_expired: "Your free trial has ended. Upgrade your plan to keep using AgainERP.",
  subscription_expired: "Your subscription has expired. Renew to keep using AgainERP.",
};

export function SubscriptionStatusBanner() {
  const inactiveStatus = useSubscriptionStatus((s) => s.inactiveStatus);
  if (!inactiveStatus) return null;

  return (
    <div className="w-full bg-destructive px-4 py-2 text-center text-xs font-medium text-destructive-foreground">
      {MESSAGES[inactiveStatus] ?? "This account is not active. Contact support."}
    </div>
  );
}
