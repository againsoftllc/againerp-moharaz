"use client";

import { Calendar, LayoutGrid, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  subtitle?: string;
  editMode?: boolean;
  layoutSaved?: boolean;
  onToggleEdit?: () => void;
  onSaveLayout?: () => void;
  className?: string;
};

export function DashboardHeader({
  title,
  subtitle,
  editMode,
  layoutSaved,
  onToggleEdit,
  onSaveLayout,
  className,
}: Props) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="min-h-9 gap-1.5" aria-label="Date filter">
          <Calendar className="h-3.5 w-3.5" aria-hidden />
          Last 30 days
        </Button>
        {onToggleEdit ? (
          <Button
            type="button"
            variant={editMode ? "default" : "outline"}
            size="sm"
            className="min-h-9 gap-1.5"
            onClick={onToggleEdit}
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
            {editMode ? "Done" : "Customize"}
          </Button>
        ) : null}
        {editMode && onSaveLayout ? (
          <Button type="button" size="sm" className="min-h-9 gap-1.5" onClick={onSaveLayout}>
            <Save className="h-3.5 w-3.5" aria-hidden />
            Save layout
          </Button>
        ) : null}
        {layoutSaved ? (
          <Badge variant="secondary" className="text-[10px]">
            Layout saved (prototype)
          </Badge>
        ) : null}
      </div>
    </header>
  );
}
