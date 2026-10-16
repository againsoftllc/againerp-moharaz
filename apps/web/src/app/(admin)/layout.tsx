import { AdminAuthGate } from "@/components/auth/admin-auth-gate";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminThemeShell } from "@/components/providers/admin-theme-shell";
import { CenterEntitlementsSync } from "@/components/center/center-entitlements-sync";
import { CompanyFormatSync } from "@/components/workspace/company-format-sync";
import { SubscriptionStatusBanner } from "@/components/subscription-status-banner";
import { StorefrontUrlHydrator } from "@/components/providers/storefront-url-hydrator";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminThemeShell>
      <AdminAuthGate>
        <CompanyFormatSync>
          <CenterEntitlementsSync />
          <StorefrontUrlHydrator />
          <SubscriptionStatusBanner />
          <AdminShell>{children}</AdminShell>
        </CompanyFormatSync>

      </AdminAuthGate>
    </AdminThemeShell>
  );
}
