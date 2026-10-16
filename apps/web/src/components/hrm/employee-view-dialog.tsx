"use client";

import { useEffect, useState } from "react";
import { Edit2 } from "lucide-react";
import {
  EMPLOYEE_ACCOUNT_ROLE_LABELS,
  EMPLOYEE_GENDER_LABELS,
  EMPLOYEE_LANGUAGES,
  EMPLOYEE_MARITAL_LABELS,
  EMPLOYEE_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  employeeAvatarUrl,
  type Employee,
  type EmployeeDocument,
} from "@/lib/mock-data/employees";
import { HRM_BRANCHES } from "@/lib/mock-data/hrm-org";
import {
  apiEmployeeDocumentToUi,
  listHrmEmployeeDocuments,
} from "@/lib/api/hrm-employee-documents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn, formatCurrency } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  onEdit?: (employee: Employee) => void;
  documentTypeName?: (id: string | null | undefined) => string;
};

function statusTone(status: Employee["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "terminated" || status === "inactive") return "destructive";
  if (status === "on_leave") return "secondary";
  return "outline";
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-right text-sm text-foreground", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="divide-y divide-border rounded-none border border-border text-sm">{children}</dl>
    </section>
  );
}

function money(n?: number) {
  if (n == null) return "—";
  return formatCurrency(n);
}

export function EmployeeViewDialog({
  open,
  onOpenChange,
  employee,
  onEdit,
  documentTypeName,
}: Props) {
  const [documents, setDocuments] = useState<EmployeeDocument[]>(employee?.documents ?? []);
  const [docsLoading, setDocsLoading] = useState(false);

  useEffect(() => {
    if (!open || !employee?.id) {
      setDocuments([]);
      return;
    }
    setDocuments(employee.documents ?? []);
    let cancelled = false;
    setDocsLoading(true);
    void (async () => {
      try {
        const rows = await listHrmEmployeeDocuments({ employee_id: employee.id });
        if (cancelled) return;
        const typeName = documentTypeName ?? ((id: string | null | undefined) => id ?? "—");
        setDocuments(rows.map((r) => apiEmployeeDocumentToUi(r, typeName)));
      } catch {
        if (!cancelled) setDocuments(employee.documents ?? []);
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, employee?.id, employee?.documents, documentTypeName]);

  const branchName =
    HRM_BRANCHES.find((b) => b.id === employee?.branchId)?.name ?? employee?.workLocation ?? "—";
  const avatar =
    employee?.avatarUrl ??
    (employee ? employeeAvatarUrl(employee.id, employee.gender) : undefined);
  const lang =
    EMPLOYEE_LANGUAGES.find((l) => l.value === employee?.account?.language)?.label ??
    employee?.account?.language ??
    "—";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={employee ? `Employee: ${employee.name}` : "Employee details"}
        resizable
        resizeMaxWidth={1100}
        closeButton="chevron"
        className="w-[min(100%,42rem)] min-w-[320px] max-w-[1100px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
        aria-describedby={undefined}
      >
        {!employee ? null : (
          <div className="flex h-full min-h-0 flex-col" data-view="hrm-employee-workdo">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 pr-10">
              <div className="flex min-w-0 items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatar}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-none border border-border object-cover"
                />
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={statusTone(employee.status)} className="rounded-none text-[10px] font-normal">
                      {EMPLOYEE_STATUS_LABELS[employee.status]}
                    </Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {employee.employeeCode}
                    </span>
                  </div>
                  <p className="truncate text-base font-semibold leading-snug">{employee.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {employee.designation} · {employee.department}
                  </p>
                </div>
              </div>
              {onEdit ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1 rounded-none px-2.5 text-xs"
                  onClick={() => {
                    onOpenChange(false);
                    onEdit(employee);
                  }}
                >
                  <Edit2 className="h-3 w-3" />
                  Edit
                </Button>
              ) : null}
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-border p-3 sm:grid-cols-4">
              <div className="rounded-none border border-border bg-muted/30 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Branch</p>
                <p className="mt-0.5 truncate text-xs font-medium">{branchName}</p>
              </div>
              <div className="rounded-none border border-border bg-muted/30 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</p>
                <p className="mt-0.5 truncate text-xs font-medium">
                  {EMPLOYMENT_TYPE_LABELS[employee.employmentType]}
                </p>
              </div>
              <div className="rounded-none border border-border bg-muted/30 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Join date</p>
                <p className="mt-0.5 truncate text-xs font-medium">{employee.joinDate}</p>
              </div>
              <div className="rounded-none border border-border bg-muted/30 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Base salary</p>
                <p className="mt-0.5 truncate text-xs font-medium">{money(employee.basicSalary)}</p>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
              <Section title="Personal">
                <Row label="Full name" value={employee.name} />
                <Row
                  label="Gender"
                  value={employee.gender ? EMPLOYEE_GENDER_LABELS[employee.gender] : "—"}
                />
                <Row label="Date of birth" value={employee.dateOfBirth ?? "—"} />
                <Row
                  label="Marital status"
                  value={
                    employee.maritalStatus
                      ? EMPLOYEE_MARITAL_LABELS[employee.maritalStatus]
                      : "—"
                  }
                />
                <Row label="Nationality" value={employee.nationality ?? "—"} />
                <Row label="Blood group" value={employee.bloodGroup ?? "—"} />
                <Row label="Email" value={employee.email} />
                <Row label="Phone" value={employee.phone} />
                <Row
                  label="Address"
                  value={
                    employee.address
                      ? [
                          employee.address.line1,
                          employee.address.line2,
                          employee.address.city,
                          employee.address.state,
                          employee.address.country,
                          employee.address.postalCode,
                        ]
                          .filter(Boolean)
                          .join(", ")
                      : "—"
                  }
                />
                <Row
                  label="Emergency"
                  value={
                    employee.emergencyContact
                      ? `${employee.emergencyContact.name} (${employee.emergencyContact.relationship}) · ${employee.emergencyContact.phone}`
                      : "—"
                  }
                />
              </Section>

              <Section title="Company">
                <Row label="Employee ID" value={employee.employeeCode} mono />
                <Row label="Biometric code" value={employee.biometricCode ?? "—"} mono />
                <Row label="Branch" value={branchName} />
                <Row label="Department" value={employee.department} />
                <Row label="Designation" value={employee.designation} />
                <Row label="Shift" value={employee.shift ?? "—"} />
                <Row label="Manager" value={employee.manager || "—"} />
                <Row label="Probation end" value={employee.probationEndDate ?? "—"} />
                <Row label="Confirmation" value={employee.confirmationDate ?? "—"} />
                <Row label="Last working day" value={employee.lastWorkingDay ?? "—"} />
                <Row
                  label="Hours / week"
                  value={
                    employee.hoursPerDay != null && employee.daysPerWeek != null
                      ? `${employee.hoursPerDay}h × ${employee.daysPerWeek}d`
                      : "—"
                  }
                />
              </Section>

              <Section title="Account">
                <Row
                  label="Login"
                  value={employee.account?.createLogin ? "Enabled" : "Disabled"}
                />
                <Row
                  label="Role"
                  value={
                    employee.account?.role
                      ? EMPLOYEE_ACCOUNT_ROLE_LABELS[employee.account.role]
                      : "—"
                  }
                />
                <Row label="Language" value={lang} />
                <Row
                  label="Account status"
                  value={employee.account?.accountStatus ?? "—"}
                />
              </Section>

              <Section title="Bank account">
                <Row label="Bank" value={employee.bank?.name ?? "—"} />
                <Row label="Account holder" value={employee.bank?.holder ?? "—"} />
                <Row label="Account no." value={employee.bank?.accountNo ?? "—"} mono />
                <Row label="BIC / SWIFT" value={employee.bank?.bic ?? "—"} mono />
                <Row label="Bank branch" value={employee.bank?.branch ?? "—"} />
                <Row label="Tax ID" value={employee.bank?.taxPayerId ?? "—"} mono />
                <Row label="Base salary" value={money(employee.basicSalary)} />
                <Row label="Rate / hour" value={money(employee.ratePerHour)} />
              </Section>

              <Section title="Documents">
                {docsLoading ? (
                  <Row label="Files" value="Loading…" />
                ) : documents.length > 0 ? (
                  documents.map((doc, idx) => (
                    <div
                      key={`${doc.id ?? doc.type}-${doc.fileName}-${idx}`}
                      className="flex items-start justify-between gap-3 px-3 py-2"
                    >
                      <dt className="shrink-0 text-xs text-muted-foreground">{doc.type}</dt>
                      <dd className="text-right text-sm text-foreground">
                        {doc.filePath ? (
                          <a
                            href={doc.filePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
                          >
                            {doc.fileName}
                          </a>
                        ) : (
                          doc.fileName || "—"
                        )}
                      </dd>
                    </div>
                  ))
                ) : (
                  <Row label="Files" value="No documents" />
                )}
              </Section>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
