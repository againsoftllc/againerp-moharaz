"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/** Right-side record drawer — desktop max 60% viewport width (non-resizable). */
export const AGAIN_DRAWER_CONTENT_CLASS =
  "w-full max-w-none gap-0 overflow-hidden border-l border-border bg-background p-0 text-foreground sm:max-w-[60vw] sm:min-w-[min(480px,100vw)] [&>button.absolute]:hidden";

/** Scrollable area — add padding/bg via `AgainFormSheetBg` (Contacts) or sales sheet class. */
export const AGAIN_DRAWER_BODY_CLASS =
  "min-h-0 flex-1 overflow-y-auto text-foreground";

/**
 * Record form background — fields directly on tinted sheet (no inner card).
 * Shared across every Again drawer (Sales, Contacts, Service, …) for one consistent look.
 */
export const AGAIN_DRAWER_FIELD_SHEET_CLASS =
  "bg-[#eceff3] px-4 py-4 dark:bg-muted/20 sm:px-6";

/** @deprecated Use `AGAIN_DRAWER_FIELD_SHEET_CLASS` — kept as an alias for existing imports. */
export const AGAIN_DRAWER_SALES_SHEET_CLASS = AGAIN_DRAWER_FIELD_SHEET_CLASS;

/**
 * Drawer action buttons (Discard, Cancel, …).
 * Always square corners (`rounded-none`) — never pills or rounded-md.
 */
export const AGAIN_DRAWER_ACTION_BTN =
  "h-8 rounded-none border border-border/80 bg-muted/50 px-3 text-[13px] font-normal text-foreground hover:bg-muted";

/**
 * Primary drawer action (Save, Confirm, Send, …).
 * Purple brand fill with square corners — match `AGAIN_DRAWER_ACTION_BTN` shape.
 */
export const AGAIN_DRAWER_PRIMARY_BTN =
  "h-8 rounded-none px-3 text-[13px] font-normal text-white hover:opacity-90 disabled:opacity-50";

export const AGAIN_DRAWER_MODULE_LABEL_CLASS = "text-[12px] font-medium text-[#00a09d]";
export const AGAIN_DRAWER_RECORD_LABEL_CLASS =
  "truncate text-[13px] font-medium text-foreground";
/** Brand purple for primary drawer buttons. */
export const AGAIN_DRAWER_PRIMARY_COLOR = "#714B67";

const DEFAULT_DRAWER_WIDTH = 480;
const DEFAULT_MIN_WIDTH = 280;
const DEFAULT_MAX_RATIO = 0.85;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function readStoredWidth(key: string | undefined, fallback: number): number {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export type DrawerResizeHandleProps = {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
};

/**
 * Drag-to-resize state for a right-side drawer (left edge handle).
 * Width persists to localStorage when `storageKey` is given.
 */
export function useDrawerResize({
  defaultWidth = DEFAULT_DRAWER_WIDTH,
  defaultWidthRatio,
  minWidth = DEFAULT_MIN_WIDTH,
  maxWidthRatio = DEFAULT_MAX_RATIO,
  getMaxWidth,
  storageKey,
  enabled = true,
}: {
  defaultWidth?: number;
  /** Open at this share of the screen width (e.g. 0.6) until the user has dragged it; wins over `defaultWidth`. */
  defaultWidthRatio?: number;
  minWidth?: number;
  /** Max as fraction of viewport width (default 0.85). Ignored when getMaxWidth is set. */
  maxWidthRatio?: number;
  /** Custom max width in px (e.g. cap a nested drawer to its parent). */
  getMaxWidth?: () => number;
  storageKey?: string;
  enabled?: boolean;
}) {
  const [width, setWidth] = useState(defaultWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const getMaxRef = useRef(getMaxWidth);
  getMaxRef.current = getMaxWidth;

  useEffect(() => {
    if (!enabled) return;
    const fromRatio =
      defaultWidthRatio && typeof window !== "undefined"
        ? Math.max(minWidth, Math.round(window.innerWidth * defaultWidthRatio))
        : defaultWidth;
    setWidth(readStoredWidth(storageKey, fromRatio));
  }, [enabled, storageKey, defaultWidth, defaultWidthRatio, minWidth]);

  const maxWidth = useCallback(() => {
    if (getMaxRef.current) return getMaxRef.current();
    return typeof window !== "undefined"
      ? Math.floor(window.innerWidth * maxWidthRatio)
      : 1200;
  }, [maxWidthRatio]);

  const persistWidth = useCallback(
    (next: number) => {
      if (!storageKey || typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey, String(Math.round(next)));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startWidth: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const delta = dragRef.current.startX - e.clientX;
    const next = clamp(
      dragRef.current.startWidth + delta,
      minWidth,
      Math.max(minWidth, maxWidth()),
    );
    setWidth(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setWidth((w) => {
      persistWidth(w);
      return w;
    });
  };

  const handleProps: DrawerResizeHandleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };

  return { width, handleProps };
}

/** Left-edge drag handle — place inside a relatively positioned drawer. */
export function DrawerResizeHandle({
  className,
  ...handleProps
}: DrawerResizeHandleProps & { className?: string }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize drawer"
      title="Drag to resize"
      className={cn(
        "absolute inset-y-0 left-0 z-30 hidden w-2 cursor-col-resize touch-none hover:bg-[#00a09d]/15 active:bg-[#00a09d]/25 sm:block",
        className,
      )}
      {...handleProps}
    >
      <span className="pointer-events-none absolute left-0.5 top-1/2 h-12 w-1 -translate-y-1/2 rounded-none bg-border" />
    </div>
  );
}

type AgainDrawerPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  nested?: boolean;
  contentClassName?: string;
  children: React.ReactNode;
  /** Drag the left edge to resize width (desktop). */
  resizable?: boolean;
  /** Initial width in px when resizable (default 480). */
  defaultWidth?: number;
  /** Initial width as a share of the screen (0.6 = 60%) - for drawers that hold a lot of information. */
  defaultWidthRatio?: number;
  minWidth?: number;
  /** Max as fraction of viewport width (default 0.85). */
  maxWidthRatio?: number;
  /** Persist width in localStorage under this key. */
  widthStorageKey?: string;
  /** Draft-save hooks (see docs/ERP-UI-COMMON.md #10) — side effects only, do not preventDefault. */
  onPointerDownOutside?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
};

export function AgainDrawerPanel({
  open,
  onOpenChange,
  title,
  nested,
  contentClassName,
  children,
  resizable = false,
  defaultWidth = DEFAULT_DRAWER_WIDTH,
  defaultWidthRatio,
  minWidth = DEFAULT_MIN_WIDTH,
  maxWidthRatio = DEFAULT_MAX_RATIO,
  widthStorageKey,
  onPointerDownOutside,
  onInteractOutside,
  onEscapeKeyDown,
}: AgainDrawerPanelProps) {
  const { width, handleProps } = useDrawerResize({
    defaultWidth,
    defaultWidthRatio,
    minWidth,
    maxWidthRatio,
    storageKey: widthStorageKey,
    enabled: resizable,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={title}
        side="right"
        onPointerDownOutside={onPointerDownOutside}
        onInteractOutside={onInteractOutside}
        onEscapeKeyDown={onEscapeKeyDown}
        className={cn(
          AGAIN_DRAWER_CONTENT_CLASS,
          nested && "z-[260]",
          resizable && "sm:!max-w-none sm:!min-w-0",
          contentClassName,
        )}
        style={
          resizable
            ? {
                width: `min(100vw, ${Math.round(width)}px)`,
                maxWidth: "100vw",
              }
            : undefined
        }
      >
        {resizable ? <DrawerResizeHandle {...handleProps} /> : null}
        {children}
      </SheetContent>
    </Sheet>
  );
}

export function AgainDrawerLayout({ children }: { children: React.ReactNode }) {
  return <div className="relative flex h-full min-h-0 flex-col bg-background">{children}</div>;
}

export function AgainDrawerScrollBody({
  children,
  className,
  scrollRef,
}: {
  children: React.ReactNode;
  className?: string;
  /** To read / restore the scroll position (a drawer that reopens from a draft goes back to where the user was). */
  scrollRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={scrollRef} className={cn(AGAIN_DRAWER_BODY_CLASS, className)}>
      {children}
    </div>
  );
}

export function AgainDrawerControlBar({
  children,
  trailing,
  className,
}: {
  children: React.ReactNode;
  /** Right-aligned actions (e.g. Save). */
  trailing?: React.ReactNode;
  /** e.g. `px-4 sm:px-6` to line the bar up with the drawer's content margin. */
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/80 px-3 py-1", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
      {trailing ? <div className="ml-auto flex shrink-0 items-center gap-1">{trailing}</div> : null}
    </div>
  );
}

export function AgainDrawerActionBar({
  children,
  trailing,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/80 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

/** Size of every button in the control bar (the sales order drawer's bar is the reference). */
export const AGAIN_DRAWER_BAR_BTN_SIZE = "h-6 px-2 text-[11px]";
const BAR_BTN_DISABLED = "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-muted/50";

export type AgainDrawerButtonVariant = "primary" | "action" | "success" | "danger";

/**
 * The control-bar button. One look for every drawer (docs/common/drawercommon.md, "Button types"):
 * - `primary`  Save / Create / Confirm - purple fill (one per bar)
 * - `action`   Print, Draft, Discard, Cancel, Preview ... - plain, bordered, grey
 * - `success`  a positive bulk action (Generate, Approve) - green fill
 * - `danger`   a destructive action (Delete Unused, Reject) - red fill
 * Always square, always `type="button"`.
 */
export const AgainDrawerButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: AgainDrawerButtonVariant }
>(function AgainDrawerButton({ variant = "action", className, style, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap text-center leading-none",
        variant === "action" ? AGAIN_DRAWER_ACTION_BTN : AGAIN_DRAWER_PRIMARY_BTN,
        variant === "success" && "bg-emerald-600",
        variant === "danger" && "bg-red-600",
        AGAIN_DRAWER_BAR_BTN_SIZE,
        BAR_BTN_DISABLED,
        className,
      )}
      style={variant === "primary" ? { backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR, ...style } : style}
    >
      {children}
    </button>
  );
});

/**
 * Segmented switch in the control bar: Quotation | Sales Order, Draft | Active | Closed. The current one is filled teal
 * (#00a09d); pass `onChange` to let the user switch, leave it out to show the state only.
 */
export function AgainDrawerSwitch<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange?: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("ml-2 inline-flex h-6 shrink-0 rounded-none border border-border/80", className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={!onChange}
          onClick={() => option.value !== value && onChange?.(option.value)}
          aria-pressed={option.value === value}
          className={cn(
            "px-2 text-[11px] font-medium transition-colors disabled:cursor-default",
            option.value === value ? "bg-[#00a09d] text-white" : "bg-transparent text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The squared X at the far right of the control bar (put it in `AgainDrawerControlBar`'s `trailing`). */
export function AgainDrawerCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-none" aria-label="Close" onClick={onClick}>
      <X className="h-3.5 w-3.5" />
    </Button>
  );
}
