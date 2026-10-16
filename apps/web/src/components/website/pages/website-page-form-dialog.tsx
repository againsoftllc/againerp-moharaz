"use client";

import type { WebsiteManagedPage } from "@/lib/website/pages/types";
import { WebsitePageForm } from "@/components/website/pages/website-page-form";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  page?: WebsiteManagedPage | null;
  onSaved?: () => void;
};

export function WebsitePageFormDialog({
  open,
  onOpenChange,
  mode = "create",
  page,
  onSaved,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={
          mode === "create"
            ? "Add page"
            : `Edit page${page?.name ? `: ${page.name}` : ""}`
        }
        resizable
        resizeMaxWidth={900}
        closeButton="chevron"
        className="w-[min(100%,40rem)] min-w-[320px] max-w-[900px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-3">
          <WebsitePageForm
            mode={mode}
            page={page}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
