"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Briefcase, Eye, Search } from "lucide-react";
import { listJobPostingsView } from "@/lib/api/hrm-recruitment";
import {
  JOB_TYPE_LABEL,
  formatSalaryRange,
  type JobPosting,
} from "@/lib/mock-data/hrm-job-postings";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function HrmCareerBoard() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<JobPosting[]>([]);
  const [search, setSearch] = useState("");
  const [viewRow, setViewRow] = useState<JobPosting | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listJobPostingsView();
      setRows(data.filter((row) => row.status === "published" || row.isPublished));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load career jobs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (row) =>
          row.title.toLowerCase().includes(q) ||
          row.code.toLowerCase().includes(q) ||
          row.location.toLowerCase().includes(q) ||
          row.department.toLowerCase().includes(q) ||
          JOB_TYPE_LABEL[row.jobType].toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [rows, search]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4" data-page="hrm-career">
        <ContentDataSkeleton rows={8} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4" data-page="hrm-career">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="page-subtitle">AgainERP › HRM › Recruitment</p>
          <h1 className="page-title">Career</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Published openings — read-only career board preview
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs…"
            className="h-8 rounded-none pl-7 text-xs"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-none border border-border bg-card p-8 text-center">
          <Briefcase className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No published jobs match your search.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row) => (
            <article
              key={row.id}
              className="flex flex-col rounded-none border border-border bg-card p-4"
            >
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted-foreground">{row.code}</p>
                  <h2 className="text-sm font-semibold">{row.title}</h2>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-none text-[10px] font-normal capitalize"
                >
                  {row.status}
                </Badge>
              </div>
              <dl className="mb-3 space-y-1 text-xs text-muted-foreground">
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0">Location</dt>
                  <dd className="text-foreground">{row.location || "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0">Type</dt>
                  <dd className="text-foreground">{JOB_TYPE_LABEL[row.jobType]}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0">Dept</dt>
                  <dd className="text-foreground">{row.department || "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0">Salary</dt>
                  <dd className="text-foreground">
                    {formatSalaryRange(row.minSalary, row.maxSalary)}
                  </dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-none text-xs"
                  onClick={() => setViewRow(row)}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  View
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 rounded-none bg-foreground text-background text-xs hover:bg-foreground/90"
                  asChild
                >
                  <Link href={`/hrm/recruitment/candidates?job=${encodeURIComponent(row.id)}`}>
                    Apply
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          title="Job details"
          className="w-[480px] min-w-[160px] max-w-[720px] rounded-none p-0"
        >
          {viewRow ? (
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-border px-4 py-3 text-left">
                <SheetTitle className="text-base">{viewRow.title}</SheetTitle>
                <SheetDescription>
                  {viewRow.code} · {viewRow.location || "—"} · {JOB_TYPE_LABEL[viewRow.jobType]}
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-3 overflow-auto p-4 text-sm">
                {[
                  ["Department", viewRow.department || "—"],
                  ["Branch", viewRow.branch || "—"],
                  ["Positions", String(viewRow.numberOfPositions)],
                  ["Deadline", viewRow.deadline || "—"],
                  ["Salary", formatSalaryRange(viewRow.minSalary, viewRow.maxSalary)],
                  ["Experience", `${viewRow.minExperience}–${viewRow.maxExperience} yrs`],
                  ["Skills", viewRow.requiredSkills || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[110px_1fr] gap-2 border-b border-border py-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                {viewRow.description ? (
                  <div>
                    <p className="mb-1 text-muted-foreground">Description</p>
                    <p className="whitespace-pre-wrap">{viewRow.description}</p>
                  </div>
                ) : null}
                {viewRow.requirements ? (
                  <div>
                    <p className="mb-1 text-muted-foreground">Requirements</p>
                    <p className="whitespace-pre-wrap">{viewRow.requirements}</p>
                  </div>
                ) : null}
                {viewRow.benefits ? (
                  <div>
                    <p className="mb-1 text-muted-foreground">Benefits</p>
                    <p className="whitespace-pre-wrap">{viewRow.benefits}</p>
                  </div>
                ) : null}
              </div>
              <div className="border-t border-border p-4">
                <Button
                  type="button"
                  className={cn("w-full rounded-none")}
                  asChild
                >
                  <Link href={`/hrm/recruitment/candidates?job=${encodeURIComponent(viewRow.id)}`}>
                    Apply for this role
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
