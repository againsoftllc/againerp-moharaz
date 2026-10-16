"use client";

type Props = {
  title: string;
  description: string;
};

/** Shared stub screen inside HRM module chrome (square ERP UI). */
export function HrmSectionPage({ title, description }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <div className="mb-4 shrink-0">
        <p className="page-subtitle">AgainERP › HRM</p>
        <h1 className="page-title">{title}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-none border border-dashed border-border bg-muted/20 p-16 text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Module shell ready — data screens in the next phase
        </p>
      </div>
    </div>
  );
}
