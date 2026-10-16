"use client";

import { use } from "react";
import { CustomersListScreen } from "@/components/customers/customers-list-screen";

export default function CustomerDrawerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <CustomersListScreen openCustomerId={id} />;
}
