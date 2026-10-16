"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/native-select";
import {
  APPROVAL_STATUS_LABELS,
  LABEL_OPTIONS,
  type CollabWorkspaceSummary,
} from "@/lib/api/collaboration";
import { cn, formatTimeAgo } from "@/lib/utils";

type Props = {
  productStatus: string;
  productUpdatedAt?: string | null;
  summary: CollabWorkspaceSummary | null;
  loading?: boolean;
  canWrite?: boolean;
  onApprovalChange?: (status: string) => void;
  onLabelToggle?: (label: string, active: boolean) => void;
  onAssignedChange?: (userId: string) => void;
};

function MetaBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-input bg-card p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="text-xs">{children}</div>
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  user: "User",
  ai: "AI",
  api: "API",
  import: "Import",
};

export function ItemWorkspaceSidebar({
  productStatus,
  productUpdatedAt,
  summary,
  loading,
  canWrite,
  onApprovalChange,
  onLabelToggle,
}: Props) {
  const ownership = summary?.ownership;
  const approval = summary?.approval;
  const activeLabels = new Set(summary?.labels.map((l) => l.label) ?? []);

  return (
    <aside className="w-full shrink-0 space-y-3 lg:w-64 xl:w-72">
      <MetaBlock title="Item Status">
        <Badge variant="secondary" className="capitalize">
          {productStatus}
        </Badge>
      </MetaBlock>

      <MetaBlock title="Created By">
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <>
            <p className="font-medium">
              {ownership?.created_by ? `User ${ownership.created_by.slice(0, 8)}…` : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Source: {SOURCE_LABELS[ownership?.source ?? "user"] ?? ownership?.source}
            </p>
            {ownership?.created_at ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatTimeAgo(ownership.created_at)}
              </p>
            ) : null}
          </>
        )}
      </MetaBlock>

      <MetaBlock title="Last Updated">
        <p className="font-medium">
          {productUpdatedAt ? formatTimeAgo(productUpdatedAt) : "—"}
        </p>
      </MetaBlock>

      <MetaBlock title="Assigned To">
        <p className="font-medium">
          {ownership?.assigned_to ? `User ${ownership.assigned_to.slice(0, 8)}…` : "Unassigned"}
        </p>
      </MetaBlock>

      <MetaBlock title="Labels">
        <div className="flex flex-wrap gap-1">
          {summary?.labels.length ? (
            summary.labels.map((label) => (
              <Badge
                key={label.id}
                variant="outline"
                className="text-[10px]"
                style={label.color ? { borderColor: label.color, color: label.color } : undefined}
              >
                {label.label_display}
                {canWrite && onLabelToggle ? (
                  <button
                    type="button"
                    className="ml-1 opacity-60 hover:opacity-100"
                    aria-label={`Remove ${label.label_display}`}
                    onClick={() => onLabelToggle(label.label, false)}
                  >
                    ×
                  </button>
                ) : null}
              </Badge>
            ))
          ) : (
            <p className="text-muted-foreground">No labels</p>
          )}
        </div>
        {canWrite && onLabelToggle ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {LABEL_OPTIONS.filter((opt) => !activeLabels.has(opt.id)).map((opt) => (
              <Button
                key={opt.id}
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => onLabelToggle(opt.id, true)}
              >
                + {opt.label}
              </Button>
            ))}
          </div>
        ) : null}
      </MetaBlock>

      <MetaBlock title="Approval Status">
        {canWrite && onApprovalChange ? (
          <Select
            value={approval?.status ?? "draft"}
            onChange={(e) => onApprovalChange(e.target.value)}
            className="h-8 text-xs"
          >
            {Object.entries(APPROVAL_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        ) : (
          <Badge
            variant="outline"
            className={cn(
              "capitalize",
              approval?.status === "published" && "border-emerald-500/50 text-emerald-600",
              approval?.status === "review" && "border-amber-500/50 text-amber-600",
            )}
          >
            {APPROVAL_STATUS_LABELS[approval?.status ?? "draft"] ?? approval?.status ?? "Draft"}
          </Badge>
        )}
      </MetaBlock>
    </aside>
  );
}
