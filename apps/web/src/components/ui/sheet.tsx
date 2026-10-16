"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/50", className)}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: "left" | "right";
    /** Screen-reader title (required by Radix Dialog). Defaults to "Panel". */
    title?: string;
    /** Allow drag-resizing the panel from its inner edge. */
    resizable?: boolean;
    /** Upper clamp when resizing (px). Defaults to 720. */
    resizeMaxWidth?: number;
    /** "inside" (default) is the shared X close on every drawer. "chevron" is kept as an alias of "inside". */
    closeButton?: "inside" | "chevron" | "none";
  }
>(
  (
    {
      className,
      children,
      side = "right",
      title = "Panel",
      resizable = false,
      resizeMaxWidth = 720,
      closeButton = "inside",
      style,
      onPointerDownOutside,
      onInteractOutside,
      onFocusOutside,
      ...props
    },
    ref,
  ) => {
    const [width, setWidth] = React.useState<number | null>(null);
    const [dragging, setDragging] = React.useState(false);

    const isExemptOutsideTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest(
          "[data-sonner-toast], [data-sonner-toaster], [data-sonner-loader], [data-aladin-chat], [data-ledger-print-overlay], [data-invoice-print-overlay], [data-media-library-modal], [data-portal-popover]",
        ),
      );
    };

    const startResize = React.useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);
        setDragging(true);

        const onMove = (ev: PointerEvent) => {
          const raw = side === "right" ? window.innerWidth - ev.clientX : ev.clientX;
          const max = Math.min(resizeMaxWidth, window.innerWidth - 48);
          setWidth(Math.min(Math.max(raw, 280), max));
        };
        const onUp = (ev: PointerEvent) => {
          try {
            handle.releasePointerCapture(ev.pointerId);
          } catch {
            /* already released */
          }
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
          handle.removeEventListener("pointercancel", onUp);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          setDragging(false);
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
      },
      [side, resizeMaxWidth],
    );

    return (
      <SheetPortal>
        <SheetOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "fixed z-50 flex h-full flex-col gap-4 border bg-background p-6 shadow-lg transition ease-in-out",
            side === "right" && "inset-y-0 right-0 w-full max-w-lg border-l border-input",
            side === "left" && "inset-y-0 left-0 w-full max-w-xs border-r border-input",
            (width != null || dragging) && "transition-none",
            className,
          )}
          style={
            width != null
              ? { ...style, width, maxWidth: `${width}px`, minWidth: 280 }
              : style
          }
          onPointerDownOutside={(e) => {
            if (isExemptOutsideTarget(e.target)) e.preventDefault();
            onPointerDownOutside?.(e);
          }}
          onInteractOutside={(e) => {
            if (isExemptOutsideTarget(e.target)) e.preventDefault();
            onInteractOutside?.(e);
          }}
          onFocusOutside={(e) => {
            if (isExemptOutsideTarget(e.target)) e.preventDefault();
            onFocusOutside?.(e);
          }}
          {...props}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {resizable && (
            <div
              aria-hidden
              role="separator"
              title="Drag to resize"
              onPointerDown={startResize}
              className={cn(
                "absolute inset-y-0 z-20 flex w-3 cursor-col-resize touch-none items-center justify-center",
                side === "right" ? "-left-1.5" : "-right-1.5",
              )}
            >
              <span
                className={cn(
                  "h-10 w-1 rounded-none bg-border transition-colors",
                  dragging ? "bg-primary" : "hover:bg-primary/50",
                )}
              />
            </div>
          )}
          {children}
          {closeButton === "chevron" || closeButton === "inside" ? (
            <DialogPrimitive.Close
              aria-label="Close"
              className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-none text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = "SheetContent";

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetPortal,
  SheetOverlay,
};
