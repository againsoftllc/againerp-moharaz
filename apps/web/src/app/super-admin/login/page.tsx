import { Suspense } from "react";
import { SuperAdminLoginForm } from "@/components/auth/super-admin-login-form";

export default function SuperAdminLoginPage() {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">AgainERP</h1>
          <p className="mt-1 text-sm text-muted-foreground">Super admin sign in</p>
        </div>
        <Suspense fallback={null}>
          <SuperAdminLoginForm />
        </Suspense>
        <div className="mt-6 border-t pt-6 text-center">
          <p className="text-xs text-muted-foreground">© AgainERP {year}. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
