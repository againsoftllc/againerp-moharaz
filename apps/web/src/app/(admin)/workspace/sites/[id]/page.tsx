"use client";

import { use } from "react";
import { SiteSettingsForm } from "@/components/settings/site-settings-form";

type Props = {
  params: Promise<{ id: string }>;
};

export default function SiteSettingsPage({ params }: Props) {
  const { id } = use(params);
  return <SiteSettingsForm siteId={id} />;
}
