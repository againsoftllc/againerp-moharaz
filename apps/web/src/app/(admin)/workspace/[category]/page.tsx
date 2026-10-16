"use client";

import { use } from "react";
import { notFound, redirect } from "next/navigation";
import { findCategory } from "@/lib/settings/settings-schema";
import {
  businessSettingsHref,
  type BusinessSettingsTabId,
} from "@/lib/settings/business-settings-tabs";

type Props = { params: Promise<{ category: string }> };

export default function BusinessSettingsCategoryPage({ params }: Props) {
  const { category } = use(params);
  const found = findCategory("business", category);
  if (!found) notFound();
  redirect(businessSettingsHref(category as BusinessSettingsTabId));
}
