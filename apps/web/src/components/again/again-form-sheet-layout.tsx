"use client";

import { cn } from "@/lib/utils";
import { AGAIN_DRAWER_FIELD_SHEET_CLASS } from "@/components/again/again-drawer";

/**
 * Again form sheet layout — maps to standard ERP form DOM:
 *
 * | ERP pattern   | Again component   | Where used                          |
 * |---------------|-------------------|-------------------------------------|
 * | sheet bg      | AgainFormSheetBg  | Drawer scroll area (gray/dark pad)  |
 * | sheet         | AgainFormSheet    | Card — all field content            |
 * | title block   | AgainFormTitle    | Photo + name + email/phone          |
 * | field group   | AgainFormGroup    | Two-column Address / Job / Tags     |
 * | notebook      | AgainFormNotebook | Contacts / Sales / Invoicing tabs   |
 */

/**
 * Outer padded area behind the sheet card (light gray / dark charcoal).
 * Same tint as `AGAIN_DRAWER_FIELD_SHEET_CLASS` (Sales, Service, …) so every
 * Again drawer's field area shares one background — kept as a separate export
 * only because this one adds `min-h-full` for the Contacts card layout.
 */
export const AGAIN_FORM_SHEET_BG_CLASS = cn("again_form_sheet_bg min-h-full", AGAIN_DRAWER_FIELD_SHEET_CLASS);

/** Inner sheet card — fields, groups, and notebook live here. */
export const AGAIN_FORM_SHEET_CLASS =
  "again_form_sheet relative w-full max-w-full rounded-sm border border-border/60 bg-card px-6 py-5 shadow-sm";

export function AgainFormSheetBg({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(AGAIN_FORM_SHEET_BG_CLASS, className)} data-component="again_form_sheet_bg">
      {children}
    </div>
  );
}

export function AgainFormSheet({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(AGAIN_FORM_SHEET_CLASS, className)} data-component="again_form_sheet">
      {children}
    </div>
  );
}

/** Title row: avatar/photo left, name + quick fields right. */
export function AgainFormTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("again_form_title mb-5 flex gap-5", className)} data-component="again_form_title">
      {children}
    </div>
  );
}

/** Two-column group wrapper (Address | Job Position / Website / Tags). */
export function AgainFormGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("again_form_group mb-4 grid gap-x-12 gap-y-4 lg:grid-cols-2", className)}
      data-component="again_form_group"
    >
      {children}
    </div>
  );
}

export type AgainNotebookTab<T extends string = string> = {
  id: T;
  label: string;
  /** Optional count / alert shown after the label (e.g. unread replies). */
  badge?: number | string;
  badgeTone?: "neutral" | "warning" | "danger" | "info";
};

/** Tabbed notebook — active tab uses Again purple top border. */
export function AgainFormNotebook<T extends string>({
  tabs,
  active,
  onChange,
  children,
  className,
  contentClassName,
}: {
  tabs: AgainNotebookTab<T>[];
  active: T;
  onChange: (id: T) => void;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("again_form_notebook flex min-h-0 flex-col border-t border-border", className)} data-component="again_form_notebook">
      <div className="flex shrink-0 flex-nowrap gap-0 overflow-x-auto border-b border-border bg-muted/20 [-ms-overflow-style:none] [scrollbar-width:none] dark:bg-muted/10 [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 border-t-2 px-2.5 py-1 text-[12px] font-medium whitespace-nowrap transition-colors",
              active === t.id
                ? "border-[#714B67] bg-card text-foreground dark:text-[#e8dce6]"
                : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground",
            )}
          >
            {t.label}
            {t.badge != null && t.badge !== "" && Number(t.badge) !== 0 ? (
              <span
                className={cn(
                  "inline-flex min-w-[1.1rem] items-center justify-center rounded-none border px-1 py-0 text-[10px] font-semibold leading-4",
                  (t.badgeTone ?? "warning") === "warning" &&
                    "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
                  t.badgeTone === "danger" &&
                    "border-red-300 bg-red-100 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
                  t.badgeTone === "info" &&
                    "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
                  t.badgeTone === "neutral" &&
                    "border-border bg-muted text-muted-foreground",
                )}
              >
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className={cn("again_form_notebook_content min-h-0 bg-card px-4 py-4 sm:px-6", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
