"use client";

import { use } from "react";
import { notFound, redirect } from "next/navigation";
import { findCategory } from "@/lib/settings/settings-schema";
import {
  businessSettingsHref,
  isBusinessSettingsTabId,
  MOVED_BUSINESS_TABS,
} from "@/lib/settings/business-settings-tabs";

type Props = { params: Promise<{ category: string }> };

export default function BusinessSettingsCategoryPage({ params }: Props) {
  const { category } = use(params);
  const found = findCategory("business", category);
  if (!found) notFound();
  const moved = MOVED_BUSINESS_TABS[category];
  if (moved) redirect(moved);
  redirect(businessSettingsHref(isBusinessSettingsTabId(category) ? category : "customers"));
}
