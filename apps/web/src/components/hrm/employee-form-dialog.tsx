"use client";

import type { Employee } from "@/lib/mock-data/employees";
import { EmployeeForm } from "@/components/hrm/employee-form";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  employee?: Employee | null;
  existingEmployees: Employee[];
  onSaved?: (employee: Employee) => void | Promise<void>;
  org?: {
    branches: { id: string; name: string }[];
    departments: { id: string; name: string; branchId: string }[];
    designations: { id: string; name: string; departmentId: string }[];
  };
  documentTypes?: { id: string; name: string }[];
};

export function EmployeeFormDialog({
  open,
  onOpenChange,
  mode = "create",
  employee,
  existingEmployees,
  onSaved,
  org,
  documentTypes,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={
          mode === "create"
            ? "Add employee"
            : `Edit employee${employee?.name ? `: ${employee.name}` : ""}`
        }
        resizable
        resizeMaxWidth={1100}
        closeButton="chevron"
        className="w-[min(100%,48rem)] min-w-[320px] max-w-[1100px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-3">
          <EmployeeForm
            mode={mode}
            initialEmployee={employee}
            existingEmployees={existingEmployees}
            org={org}
            documentTypes={documentTypes}
            onClose={() => onOpenChange(false)}
            onSave={async (saved) => {
              await onSaved?.(saved);
              onOpenChange(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
