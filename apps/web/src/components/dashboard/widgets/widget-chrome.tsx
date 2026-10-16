"use client";

import { GripVertical, MoreHorizontal, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  widgetId?: string;
  editMode?: boolean;
  onRemove?: () => void;
  onRefresh?: () => void;
  className?: string;
  children: React.ReactNode;
};

/** WS-CONTENT-WIDGET — platform-owned widget chrome. */
export function WidgetChrome({
  title,
  widgetId,
  editMode,
  onRemove,
  onRefresh,
  className,
  children,
}: Props) {
  return (
    <article
      data-component="WS-CONTENT-WIDGET"
      data-widget-id={widgetId}
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm",
        editMode && "ring-2 ring-primary/30 ring-offset-1 ring-offset-background",
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-1 border-b px-3 py-2">
        {editMode ? (
          <span
            className="cursor-grab text-muted-foreground active:cursor-grabbing"
            title="Drag to reorder (prototype)"
            aria-hidden
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <h3 className="min-w-0 flex-1 truncate text-xs font-medium">{title}</h3>
        <div className="flex shrink-0 items-center gap-0.5">
          {onRefresh ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onRefresh}
              aria-label={`Refresh ${title}`}
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`More options for ${title}`}>
            <MoreHorizontal className="h-3 w-3" />
          </Button>
          {editMode && onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onRemove}
              aria-label={`Remove ${title}`}
            >
              <X className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
      </header>
      <div className="relative min-h-0 flex-1 overflow-auto p-3">{children}</div>
      {editMode ? (
        <span
          className="absolute bottom-1 right-1 h-3 w-3 cursor-se-resize rounded-sm border border-primary bg-primary/20"
          title="Resize (prototype)"
          aria-hidden
        />
      ) : null}
    </article>
  );
}
