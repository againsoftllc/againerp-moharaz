"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { useModuleSettingsStore } from "@/lib/store/module-settings-store";
import {
  ERP_REPORT_GROUPS,
  isErpReportGroupVisible,
} from "@/lib/reports/erp-reports";

export default function ReportsHubPage() {
  const [query, setQuery] = useState("");
  const moduleEnabled = useModuleSettingsStore((s) => s.enabled);
  const permissions = useAdminAuth((s) => s.permissions);
  const role = useAdminAuth((s) => s.user?.role);
  const enabledModules = useAdminAuth((s) => s.enabledModules);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ERP_REPORT_GROUPS.filter((group) =>
      isErpReportGroupVisible(group, { moduleEnabled, enabledModules, permissions, role }),
    )
      .map((group) => ({
        ...group,
        reports: needle
          ? group.reports.filter(
              (report) =>
                report.label.toLowerCase().includes(needle) ||
                report.description.toLowerCase().includes(needle) ||
                group.title.toLowerCase().includes(needle),
            )
          : group.reports,
      }))
      .filter((group) => group.reports.length > 0);
  }, [query, moduleEnabled, enabledModules, permissions, role]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <ListGridHeaderStart title="Reports" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reports…"
          className="h-8 max-w-xs rounded-none"
          aria-label="Search reports"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="text-xs text-muted-foreground">
          Reports from every enabled module. Turn a module off in Workspace and its reports
          disappear here.
        </p>
        {groups.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            {query.trim()
              ? "No reports match that search."
              : "No reports to show. Enable a module in Workspace to see its reports."}
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {groups.map((group) => (
              <section key={group.id}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </h2>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.reports.map((report) => (
                    <Link
                      key={report.id}
                      href={report.href}
                      className="rounded-none border border-border bg-background px-4 py-3 hover:bg-muted/30"
                    >
                      <p className="text-sm font-medium text-foreground">{report.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{report.description}</p>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
