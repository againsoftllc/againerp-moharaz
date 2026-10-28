"use client";

import { redirect } from "next/navigation";

/** Accounting periods are a tab of Company now. */
export default function WorkspacePeriodsPage() {
  redirect("/workspace/setup?tab=periods");
}
