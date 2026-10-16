import Link from "next/link";
import { Suspense } from "react";
import { CompanyRegisterForm } from "@/components/auth/company-register-form";

export default function RegisterPage() {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md rounded-none border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">AgainERP</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your company. You can add branches after signup.
          </p>
        </div>
        <Suspense fallback={null}>
          <CompanyRegisterForm />
        </Suspense>
        <div className="mt-6 border-t pt-6 text-center text-xs text-muted-foreground">
          <p>
            Already have an account?{" "}
            <Link href="/login" className="text-foreground underline">
              Sign in
            </Link>
          </p>
          <p className="mt-3">© AgainERP {year}. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
