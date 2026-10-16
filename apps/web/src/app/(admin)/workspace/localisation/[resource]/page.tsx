"use client";

import { use } from "react";
import { notFound, redirect } from "next/navigation";
import { getLocalisationResource } from "@/lib/localisation/resources";
import { businessSettingsHref } from "@/lib/settings/business-settings-tabs";

type Props = {
  params: Promise<{ resource: string }>;
};

export default function LocalisationResourcePage({ params }: Props) {
  const { resource: resourceId } = use(params);
  const resource = getLocalisationResource(resourceId);
  if (!resource) notFound();
  redirect(businessSettingsHref("localisation", resource.id));
}
