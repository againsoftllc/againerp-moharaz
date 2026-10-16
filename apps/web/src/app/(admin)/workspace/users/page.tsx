"use client";

import { redirect } from "next/navigation";

export default function SystemUsersPage() {
  redirect("/workspace/business?tab=permission");
}
