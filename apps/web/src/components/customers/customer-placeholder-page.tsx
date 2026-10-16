"use client";

import { CustomersNav } from "@/components/customers/customers-nav";

type Props = {
  title: string;
  description: string;
};

export function CustomerPlaceholderPage({ title, description }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <p className="page-subtitle">AgainERP › Customers</p>
        <h1 className="page-title">{title}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <CustomersNav compact />
      <div className="rounded-lg border border-dashed border-input p-16 text-center">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">Prototype screen — coming next phase</p>
      </div>
    </div>
  );
}
