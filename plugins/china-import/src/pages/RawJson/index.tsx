"use client";

import { RawJsonViewer, StateBlock, buttonClassName } from "../../components";

export function RawJsonPage({
  value,
  onBack,
}: {
  value: unknown;
  onBack: () => void;
}) {
  if (value == null) {
    return (
      <div className="space-y-3">
        <button type="button" className={buttonClassName("secondary")} onClick={onBack}>
          Back
        </button>
        <StateBlock title="No JSON selected" description="Open a product detail first." />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button type="button" className={buttonClassName("secondary")} onClick={onBack}>
        Back
      </button>
      <RawJsonViewer value={value} title="Raw JSON Viewer" />
    </div>
  );
}
