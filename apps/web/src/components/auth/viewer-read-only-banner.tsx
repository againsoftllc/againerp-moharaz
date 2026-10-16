"use client";

import { Eye } from "lucide-react";
import { useAdminIsViewer } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function ViewerReadOnlyBanner({ className }: Props) {
  const isViewer = useAdminIsViewer();

  if (!isViewer) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex shrink-0 items-center gap-2 border-b border-sky-500/25 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-900 dark:text-sky-200",
        className,
      )}
    >
      <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        <span className="font-medium">Viewer mode</span>
        <span className="text-sky-800/80 dark:text-sky-300/80"> — read-only access; create and edit controls are hidden.</span>
      </span>
    </div>
  );
}
