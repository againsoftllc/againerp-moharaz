"use client";

import { splitCommentBody } from "@/lib/activity/mentions";
import { cn } from "@/lib/utils";

export function CommentBody({ body, className }: { body: string; className?: string }) {
  const parts = splitCommentBody(body);

  return (
    <p className={cn("text-[11px] leading-relaxed text-foreground", className)}>
      {parts.map((part, index) =>
        part.type === "mention" ? (
          <span
            key={`${part.value}-${index}`}
            className="rounded bg-primary/10 px-0.5 font-medium text-primary"
          >
            @{part.value}
          </span>
        ) : (
          <span key={`text-${index}`}>{part.value}</span>
        ),
      )}
    </p>
  );
}
