"use client";

import { use } from "react";
import { redirect } from "next/navigation";
import { getLocalisationHref } from "@/lib/localisation/resources";

type Props = {
  params: Promise<{ resource: string }>;
};

export default function LocalisationResourcePage({ params }: Props) {
  use(params);
  redirect(getLocalisationHref());
}
