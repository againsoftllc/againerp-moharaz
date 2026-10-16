"use client";

import { use } from "react";
import { AttributeProfileEditForm } from "@/components/attributes/attribute-profile-edit-form";

type Props = {
  params: Promise<{ id: string }>;
};

export default function EditAttributePage({ params }: Props) {
  const { id } = use(params);
  return <AttributeProfileEditForm profileId={id} />;
}
