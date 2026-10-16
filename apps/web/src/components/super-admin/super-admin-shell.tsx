"use client";

import { SuperAdminModuleNavbar } from "@/components/super-admin/super-admin-module-nav";

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <SuperAdminModuleNavbar />
      <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
