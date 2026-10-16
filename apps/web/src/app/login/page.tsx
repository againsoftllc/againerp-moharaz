import { Suspense } from "react";
import Link from "next/link";
import { AdminLoginForm } from "@/components/auth/admin-login-form";

export default function AdminLoginPage() {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md rounded-none border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">AgainERP</h1>
          <p className="mt-1 text-sm text-muted-foreground">Admin sign in</p>
        </div>
        <Suspense fallback={null}>
          <AdminLoginForm />
        </Suspense>
        <div className="mt-6 border-t pt-6 text-center text-xs text-muted-foreground">
          <p>
            New company?{" "}
            <Link href="/register" className="text-foreground underline">
              Register
            </Link>
          </p>
          <p className="mt-3">© AgainERP {year}. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
