"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { listHrmEmployees, type ApiHrmEmployee } from "@/lib/api/hrm-employees";
import { fetchServiceJobs, type ServiceJob } from "@/lib/api/service-jobs";
import { cn } from "@/lib/utils";

export default function ServiceTechniciansPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<ApiHrmEmployee[]>([]);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [staff, jobList] = await Promise.all([
        listHrmEmployees({ per_page: 200 }),
        fetchServiceJobs(),
      ]);
      setEmployees(staff.rows);
      setJobs(jobList.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load technicians");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const byId = new Map<string, { assigned: number; completed: number; open: number }>();
    for (const job of jobs) {
      const key = job.technician_id || job.technician_name || "";
      if (!key) continue;
      const row = byId.get(key) ?? { assigned: 0, completed: 0, open: 0 };
      row.assigned += 1;
      if (job.status === "completed") row.completed += 1;
      else if (!["cancelled", "rejected"].includes(job.status)) row.open += 1;
      byId.set(key, row);
    }
    return byId;
  }, [jobs]);

  const q = search.trim().toLowerCase();
  const rows = employees.filter((emp) => {
    if (emp.employee_status && emp.employee_status !== "active") return false;
    if (!q) return true;
    return (
      emp.name.toLowerCase().includes(q) ||
      (emp.employee_code || "").toLowerCase().includes(q) ||
      (emp.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div
        data-component="product-grid-filters"
        className="product-grid-filters flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-2"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ListGridHeaderStart title="Technicians">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-[26px] w-[26px] shrink-0 rounded-none"
                  aria-label="Settings"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[11rem]">
                <DropdownMenuItem onClick={() => void load()} disabled={loading}>
                  <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
                  Refresh
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ListGridHeaderStart>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="h-[26px] w-[200px] rounded-none"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 border-b border-border bg-muted/30 text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Technician</th>
              <th className="px-3 py-1.5 font-medium">Code</th>
              <th className="px-3 py-1.5 text-right font-medium">Assigned</th>
              <th className="px-3 py-1.5 text-right font-medium">Open</th>
              <th className="px-3 py-1.5 text-right font-medium">Completed</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                  Technicians come from HRM employees. Add staff there, then assign them on a job card.
                </td>
              </tr>
            ) : (
              rows.map((emp) => {
                const counts = stats.get(emp.id) ?? stats.get(emp.name) ?? {
                  assigned: 0,
                  completed: 0,
                  open: 0,
                };
                return (
                  <tr key={emp.id} className="border-b border-border">
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => router.push(`/service/jobs`)}
                      >
                        {emp.name}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 font-mono">{emp.employee_code}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{counts.assigned}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{counts.open}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{counts.completed}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
