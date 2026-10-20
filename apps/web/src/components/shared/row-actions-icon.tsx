"use client";

import { forwardRef } from "react";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared row actions / options trigger icon: the settings cog (every datatable's row menu uses it; it replaced the ≡ icon). */
export function RowActionsIcon({ className }: { className?: string }) {
  return <Settings className={cn("h-3.5 w-3.5", className)} strokeWidth={2} aria-hidden />;
}

type TriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

/** Ghost trigger — no focus ring; open/pressed = icon color only. */
export const RowActionsTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  function RowActionsTrigger({ className, type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label="Actions"
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none p-0",
          "text-emerald-600 outline-none dark:text-emerald-400",
          "hover:text-emerald-700 dark:hover:text-emerald-300",
          "focus:outline-none focus-visible:outline-none focus-visible:ring-0",
          "data-[state=open]:text-emerald-700 dark:data-[state=open]:text-emerald-300",
          "active:text-emerald-700",
          className,
        )}
        {...props}
      >
        <RowActionsIcon className="h-3.5 w-3.5" />
      </button>
    );
  },
);
