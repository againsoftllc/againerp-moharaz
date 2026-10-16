"use client";

import type { ReactNode } from "react";
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import type { ActivityEntityRef } from "@/lib/activity/types";

type Props = {
  entity: ActivityEntityRef;
  children?: ReactNode;
};

/** Activity trigger + optional overflow menu on mobile list cards. */
export function MobileCardActions({ entity, children }: Props) {
  return (
    <div className="flex shrink-0 items-start gap-0">
      <ActivityTriggerButton entity={entity} className="h-8 w-8" />
      {children}
    </div>
  );
}
