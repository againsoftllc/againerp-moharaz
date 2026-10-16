import { Suspense } from "react";
import { CategoryLiveEditShell } from "@/components/website/live-edit/category-live-edit-shell";

/** Full-viewport category live editor — no admin sidebar (print group). */
export default function WebsiteCategoryLiveEditPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading…</div>}>
      <CategoryLiveEditShell />
    </Suspense>
  );
}
