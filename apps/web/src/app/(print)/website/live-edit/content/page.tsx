import { Suspense } from "react";
import { ContentLiveEditShell } from "@/components/website/live-edit/content-live-edit-shell";

/** Full-viewport content-page live editor — no admin sidebar (print group). */
export default function WebsiteContentLiveEditPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <ContentLiveEditShell />
    </Suspense>
  );
}
