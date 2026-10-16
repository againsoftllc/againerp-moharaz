"use client";

import { ConfiguratorAdminPage } from "@/components/configurator/admin/configurator-admin-page";
import { ConfiguratorAnalyticsDashboard } from "@/components/configurator/admin/configurator-analytics-dashboard";

export default function ConfiguratorAnalyticsPage() {
  return (
    <ConfiguratorAdminPage
      section="Analytics"
      title="Configurator Analytics"
      description="Build volume, template performance, rule violations, and profile usage metrics."
    >
      <ConfiguratorAnalyticsDashboard />
    </ConfiguratorAdminPage>
  );
}
