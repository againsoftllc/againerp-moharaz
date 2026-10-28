"use client";

import { redirect } from "next/navigation";

export default function LocalisationIndexPage() {
  redirect("/workspace/setup?tab=localization");
}
