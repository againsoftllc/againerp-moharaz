"use client";

import { ReviewsNav } from "@/components/reviews/reviews-nav";

type Props = { title: string; description: string };

export function ReviewPlaceholderPage({ title, description }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <p className="page-subtitle">AgainERP › Catalog › Reviews</p>
        <h1 className="page-title">{title}</h1>
      </div>
      <ReviewsNav compact />
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-input bg-muted/20">
        <div className="text-center">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
