"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import {
  apiEmployeeToEmployee,
  buildOrgNameLookup,
  listHrmEmployees,
} from "@/lib/api/hrm-employees";
import { listHrmBranches } from "@/lib/api/hrm-branches";
import { listHrmDepartments } from "@/lib/api/hrm-departments";
import { listHrmDesignations } from "@/lib/api/hrm-designations";
import {
  employeeAvatarUrl,
  type Employee,
} from "@/lib/mock-data/employees";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type OrgNode = {
  id: string;
  name: string;
  designation: string;
  department: string;
  email?: string;
  phone?: string;
  status?: string;
  employeeId?: string;
  avatarUrl: string;
  children: OrgNode[];
};

const ROOT_NAME = "Organization";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function isActiveStatus(status?: string) {
  return status === "active" || status === "probation" || !status;
}

function buildOrgTree(employees: Employee[]): OrgNode {
  const active = employees.filter((e) => e.status !== "terminated");

  const root: OrgNode = {
    id: "org_root",
    name: ROOT_NAME,
    designation: "Root",
    department: "Leadership",
    status: "active",
    avatarUrl: employeeAvatarUrl("admin-root"),
    children: [],
  };

  const nodeById = new Map<string, OrgNode>();
  const parentOf = new Map<string, string>();

  for (const emp of active) {
    nodeById.set(emp.id, {
      id: emp.id,
      name: emp.name,
      designation: emp.designation || "—",
      department: emp.department || "—",
      email: emp.email,
      phone: emp.phone,
      status: emp.status,
      employeeId: emp.id,
      avatarUrl: emp.avatarUrl ?? employeeAvatarUrl(emp.id, emp.gender),
      children: [],
    });
  }

  const isAncestor = (ancestorId: string, nodeId: string): boolean => {
    let cur: string | undefined = nodeId;
    const guard = new Set<string>();
    while (cur) {
      if (cur === ancestorId) return true;
      if (guard.has(cur)) return true;
      guard.add(cur);
      cur = parentOf.get(cur);
    }
    return false;
  };

  for (const emp of active) {
    const node = nodeById.get(emp.id)!;
    const managerId = emp.reportingToId?.trim();
    let parent =
      managerId && nodeById.has(managerId) ? nodeById.get(managerId)! : root;
    if (parent.id === node.id || isAncestor(node.id, parent.id)) {
      parent = root;
    }
    parent.children.push(node);
    parentOf.set(node.id, parent.id);
  }

  const sortRecursive = (n: OrgNode) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name));
    n.children.forEach(sortRecursive);
  };
  sortRecursive(root);

  return root;
}

function OrgAvatar({
  src,
  alt,
  online,
  size = 56,
}: {
  src: string;
  alt: string;
  online?: boolean;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-none border border-border bg-muted"
        style={{ width: size, height: size }}
      >
        {failed ? (
          <span className="text-xs font-semibold text-muted-foreground">{initials(alt)}</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            width={size}
            height={size}
            className="h-full w-full object-cover"
            loading="eager"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        )}
      </span>
      {online ? (
        <span
          className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-none border-2 border-background bg-emerald-500"
          aria-hidden
        />
      ) : null}
    </span>
  );
}

function OrgPersonCard({
  node,
  selected,
  expanded,
  hasChildren,
  onSelect,
  onToggleExpand,
}: {
  node: OrgNode;
  selected: boolean;
  expanded: boolean;
  hasChildren: boolean;
  onSelect: (node: OrgNode) => void;
  onToggleExpand: (e: MouseEvent) => void;
}) {
  return (
    <div
      data-org-card
      className={cn(
        "relative flex w-[150px] flex-col items-center rounded-none border bg-card px-3 pb-5 pt-3 text-center shadow-sm",
        selected || expanded
          ? "border-2 border-sky-400 shadow-md"
          : "border-border",
      )}
    >
      <button
        type="button"
        className="flex w-full flex-col items-center outline-none"
        onClick={() => onSelect(node)}
      >
        <OrgAvatar
          src={node.avatarUrl}
          alt={node.name}
          online={isActiveStatus(node.status)}
          size={56}
        />
        <span className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {node.name}
        </span>
        <span className="mt-0.5 line-clamp-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          {node.designation}
        </span>
      </button>

      {hasChildren ? (
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={onToggleExpand}
          className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-none bg-emerald-500 text-white shadow-sm hover:bg-emerald-600"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  );
}

function OrgTreeNode({
  node,
  selectedId,
  onSelect,
  collapsed,
  onToggle,
  depth = 0,
}: {
  node: OrgNode;
  selectedId: string | null;
  onSelect: (node: OrgNode) => void;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  depth?: number;
}) {
  if (depth > 20) return null;

  const kids = node.children;
  const hasChildren = kids.length > 0;
  const expanded = hasChildren && !collapsed.has(node.id);

  return (
    <div className="flex flex-col items-center">
      <OrgPersonCard
        node={node}
        selected={selectedId === node.id}
        expanded={expanded}
        hasChildren={hasChildren}
        onSelect={onSelect}
        onToggleExpand={(e) => {
          e.stopPropagation();
          onToggle(node.id);
        }}
      />

      {expanded ? (
        <>
          <div className="h-6 w-px bg-border" aria-hidden />
          <div className="flex items-start">
            {kids.map((child, index) => (
              <div
                key={`${child.id}-${depth}`}
                className="relative flex flex-col items-center px-3"
              >
                <div className="relative h-6 w-full" aria-hidden>
                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border" />
                  {kids.length > 1 && index > 0 ? (
                    <div className="absolute left-0 top-0 h-px w-1/2 bg-border" />
                  ) : null}
                  {kids.length > 1 && index < kids.length - 1 ? (
                    <div className="absolute right-0 top-0 h-px w-1/2 bg-border" />
                  ) : null}
                </div>
                <OrgTreeNode
                  node={child}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  depth={depth + 1}
                />
              </div>
            ))}
          </div>
        </>
      ) : hasChildren ? (
        <div className="h-3" aria-hidden />
      ) : null}
    </div>
  );
}

export function HrmOrgChart() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<OrgNode | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [branchRows, deptRows, desigRows, empRes] = await Promise.all([
        listHrmBranches(),
        listHrmDepartments(),
        listHrmDesignations(),
        listHrmEmployees({ page: 1, per_page: 200 }),
      ]);
      const lookup = buildOrgNameLookup({
        branches: branchRows.map((r) => ({
          id: String(r.id),
          name: String(r.name ?? ""),
        })),
        departments: deptRows.map((r) => ({
          id: String(r.id),
          name: String(r.name ?? ""),
        })),
        designations: desigRows.map((r) => ({
          id: String(r.id),
          name: String(r.name ?? ""),
        })),
        employees: empRes.rows.map((r) => ({ id: r.id, name: r.name })),
      });
      setEmployees(empRes.rows.map((row) => apiEmployeeToEmployee(row, lookup)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load org chart");
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const tree = useMemo(() => buildOrgTree(employees), [employees]);
  const headcount = useMemo(
    () => employees.filter((e) => e.status !== "terminated").length,
    [employees],
  );

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return <ContentDataSkeleton label="Loading organization chart…" />;
  }

  return (
    <div
      data-page="hrm-org-chart-tree"
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-auto bg-background"
    >
      <div className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-3 py-2">
        <div>
          <p className="page-subtitle">AgainERP › HRM › Workforce</p>
          <h1 className="page-title">Organization Chart</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Built from employee reporting lines — set Reporting manager on the employee profile
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 rounded-none">
            <Users className="h-3 w-3" />
            {headcount} people
          </Badge>
          <Button asChild variant="outline" size="sm" className="rounded-none">
            <Link href="/hrm/employees">Employees</Link>
          </Button>
        </div>
      </div>

      <div className="bg-muted/20 p-8 dark:bg-transparent">
        {headcount === 0 ? (
          <div className="rounded-none border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No employees yet. Add employees and set their reporting manager to build the chart.
          </div>
        ) : (
          <div className="flex min-w-max justify-center rounded-none border border-border bg-card p-8 pb-14">
            <OrgTreeNode
              node={tree}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              collapsed={collapsed}
              onToggle={toggle}
            />
          </div>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[360px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
        >
          {selected ? (
            <>
              <div className="flex items-start gap-3 border-b border-border px-4 py-3">
                <OrgAvatar
                  src={selected.avatarUrl}
                  alt={selected.name}
                  online={isActiveStatus(selected.status)}
                  size={56}
                />
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{selected.name}</h2>
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    {selected.designation}
                  </p>
                </div>
              </div>
              <div className="space-y-3 overflow-y-auto px-4 py-4 text-sm">
                <Row label="Department" value={selected.department} />
                {selected.email ? <Row label="Email" value={selected.email} /> : null}
                {selected.phone ? <Row label="Phone" value={selected.phone} /> : null}
                {selected.status ? (
                  <Row
                    label="Status"
                    value={
                      <Badge variant="outline" className="rounded-none capitalize">
                        {selected.status.replace(/_/g, " ")}
                      </Badge>
                    }
                  />
                ) : null}
                <Row label="Direct reports" value={String(selected.children.length)} />
              </div>
              {selected.employeeId ? (
                <div className="mt-auto border-t border-border p-3">
                  <Button asChild className="w-full rounded-none" size="sm">
                    <Link href={`/hrm/employees?view=${selected.employeeId}`}>
                      Open employee profile
                    </Link>
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 border-b border-border/60 pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-medium">{value}</span>
    </div>
  );
}
