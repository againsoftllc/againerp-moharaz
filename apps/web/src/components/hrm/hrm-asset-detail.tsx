"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import {
  ASSET_CONDITION_LABEL,
  ASSET_STATUS_LABEL,
  formatAssetCost,
  type AssetCondition,
  type AssetStatus,
  type CompanyAsset,
} from "@/lib/mock-data/hrm-assets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

export type AssetDetailTab = "assignments" | "maintenance" | "depreciation";

function statusBadgeClass(status: AssetStatus) {
  switch (status) {
    case "available":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "assigned":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "under_maintenance":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function conditionBadgeClass(condition: AssetCondition) {
  switch (condition) {
    case "new":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "good":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "fair":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    default:
      return "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300";
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

export function HrmAssetDetail({
  row,
  tab,
  onTabChange,
  canWrite,
  onEdit,
  onClose,
}: {
  row: CompanyAsset;
  tab: AssetDetailTab;
  onTabChange: (t: AssetDetailTab) => void;
  canWrite: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const serialDisplay = row.secondaryCode || row.serialNumber || "—";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{row.name}</h2>
          <p className="text-xs text-muted-foreground">{row.assetType}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <Button type="button" size="sm" className={cn("h-8", GREEN_BTN)} onClick={onEdit}>
              <Pencil className="size-3.5" />
              Edit
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-none"
            onClick={onClose}
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <div className="border border-border bg-card p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-foreground">{row.name}</div>
                <div className="text-xs text-muted-foreground">{row.assetType}</div>
              </div>
              <Badge
                variant="outline"
                className={cn("rounded-none text-[10px]", statusBadgeClass(row.status))}
              >
                {ASSET_STATUS_LABEL[row.status]}
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Asset Code">{row.assetCode}</Field>
              <Field label="Serial Number">{serialDisplay}</Field>
              <Field label="Purchase Date">{row.purchaseDate}</Field>
              <Field label="Purchase Cost">{formatAssetCost(row.purchaseCost)}</Field>
              <Field label="Condition">
                <Badge
                  variant="outline"
                  className={cn("rounded-none text-[10px]", conditionBadgeClass(row.condition))}
                >
                  {ASSET_CONDITION_LABEL[row.condition]}
                </Badge>
              </Field>
              <Field label="Location">{row.location}</Field>
              <Field label="Supplier">{row.supplier || "—"}</Field>
              <Field label="Warranty">
                {row.warrantyLabel || row.warrantyExpiry ? (
                  <div>
                    <div>{row.warrantyLabel || "Warranty"}</div>
                    {row.warrantyExpiry ? (
                      <div className="text-[11px] text-muted-foreground">
                        Expires: {row.warrantyExpiry}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  "—"
                )}
              </Field>
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <div className="text-[11px] text-muted-foreground">Description</div>
              <p className="mt-1 text-sm text-foreground">{row.description || "—"}</p>
            </div>
          </div>

          <div className="border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Current Assignment</h3>
            {row.assignedTo ? (
              <div className="space-y-3">
                <Field label="Assigned To">{row.assignedTo}</Field>
                <Field label="Check-Out Date">{row.checkOutDate || "—"}</Field>
                <Field label="Notes">{row.assignmentNotes || "—"}</Field>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No current assignment.</p>
            )}
          </div>
        </div>

        <div className="border border-border bg-card">
          <div className="flex gap-1 border-b border-border bg-muted/40 p-1">
            {(
              [
                ["assignments", "Assignments"],
                ["maintenance", "Maintenance"],
                ["depreciation", "Depreciation"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onTabChange(key)}
                className={cn(
                  "rounded-none px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === "assignments" ? (
              <div>
                <h4 className="mb-3 text-sm font-semibold text-foreground">Assignment History</h4>
                {row.assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assignment history.</p>
                ) : (
                  <div className="overflow-x-auto border border-border">
                    <table className="w-full min-w-[480px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Employee</th>
                          <th className="px-3 py-2 font-medium">Check-Out Date</th>
                          <th className="px-3 py-2 font-medium">Return Date</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.assignments.map((a) => (
                          <tr key={a.id} className="border-b border-border last:border-b-0">
                            <td className="px-3 py-2">{a.employee}</td>
                            <td className="px-3 py-2 tabular-nums">{a.checkOutDate}</td>
                            <td className="px-3 py-2 tabular-nums">{a.returnDate || "—"}</td>
                            <td className="px-3 py-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-none text-[10px]",
                                  a.status === "assigned"
                                    ? statusBadgeClass("assigned")
                                    : "border-border bg-muted/40 text-muted-foreground",
                                )}
                              >
                                {a.status === "assigned" ? "Assigned" : "Returned"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {tab === "maintenance" ? (
              <div>
                <h4 className="mb-3 text-sm font-semibold text-foreground">Maintenance Records</h4>
                {row.maintenance.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No maintenance records.</p>
                ) : (
                  <div className="overflow-x-auto border border-border">
                    <table className="w-full min-w-[520px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Date</th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 font-medium">Cost</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.maintenance.map((m) => (
                          <tr key={m.id} className="border-b border-border last:border-b-0">
                            <td className="px-3 py-2 tabular-nums">{m.date}</td>
                            <td className="px-3 py-2">{m.type}</td>
                            <td className="px-3 py-2 tabular-nums">{formatAssetCost(m.cost)}</td>
                            <td className="px-3 py-2 capitalize">
                              {m.status.replace("_", " ")}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{m.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {tab === "depreciation" ? (
              <div>
                <h4 className="mb-3 text-sm font-semibold text-foreground">
                  Depreciation Schedule
                </h4>
                {row.depreciation.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No depreciation data.</p>
                ) : (
                  <div className="overflow-x-auto border border-border">
                    <table className="w-full min-w-[480px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Year</th>
                          <th className="px-3 py-2 font-medium">Opening Value</th>
                          <th className="px-3 py-2 font-medium">Depreciation</th>
                          <th className="px-3 py-2 font-medium">Closing Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.depreciation.map((d) => (
                          <tr key={d.id} className="border-b border-border last:border-b-0">
                            <td className="px-3 py-2 tabular-nums">{d.year}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatAssetCost(d.openingValue)}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-red-600 dark:text-red-400">
                              {formatAssetCost(d.depreciation)}
                            </td>
                            <td className="px-3 py-2 tabular-nums font-medium">
                              {formatAssetCost(d.closingValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
