"use client";

import { redirect } from "next/navigation";

/** Document numbering is a tab of Company now. */
export default function WorkspaceSequencesPage() {
  redirect("/workspace/setup?tab=sequences");
}
