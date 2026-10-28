"use client";

import { redirect } from "next/navigation";

/** Branches are not a screen of their own: the company's locations are Company › Business Locations. */
export default function WorkspaceBranchesPage() {
  redirect("/workspace/setup?tab=warehouses");
}
