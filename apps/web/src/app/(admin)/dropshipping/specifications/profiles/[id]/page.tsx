"use client";

import { use } from "react";
import { SpecificationProfileBuilder } from "@/components/specifications/specification-profile-builder";

type Props = {
  params: Promise<{ id: string }>;
};

export default function SpecificationProfileBuilderPage({ params }: Props) {
  const { id } = use(params);

  return (
    <div className="flex min-h-[calc(100vh-2.75rem-1.5rem)] flex-col lg:min-h-[calc(100vh-2.75rem-2rem)]">
      <SpecificationProfileBuilder profileId={id} />
    </div>
  );
}
