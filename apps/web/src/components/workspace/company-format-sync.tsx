"use client";

import { useEffect, type ReactNode } from "react";
import { fetchWorkspaceCompany } from "@/lib/api/workspace-company";
import { useCompanyFormatStore } from "@/lib/store/company-format-store";

/** Loads company localisation and re-renders admin UI when it changes. */
export function CompanyFormatSync({ children }: { children: ReactNode }) {
  const format = useCompanyFormatStore((s) => s.format);

  useEffect(() => {
    void fetchWorkspaceCompany().catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.lang = format.languageCode === "bn" ? "bn" : "en";
  }, [format.languageCode]);

  return <>{children}</>;
}
