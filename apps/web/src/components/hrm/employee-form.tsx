"use client";

import { useEffect, useMemo, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  EMPLOYEE_ACCOUNT_ROLE_LABELS,
  EMPLOYEE_BLOOD_GROUPS,
  EMPLOYEE_DOCUMENT_TYPES,
  EMPLOYEE_GENDER_LABELS,
  EMPLOYEE_LANGUAGES,
  EMPLOYEE_MARITAL_LABELS,
  EMPLOYEE_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  employeeAvatarUrl,
  nextBiometricCode,
  nextEmployeeCode,
  type Employee,
  type EmployeeAccountRole,
  type EmployeeAccountStatus,
  type EmployeeDocument,
  type EmployeeGender,
  type EmployeeMaritalStatus,
  type EmployeeStatus,
  type EmploymentType,
} from "@/lib/mock-data/employees";
import {
  HRM_BRANCHES,
  HRM_DEPARTMENTS,
  HRM_DESIGNATIONS,
  HRM_SHIFTS,
  type HrmBranch,
  type HrmDepartment,
  type HrmDesignation,
} from "@/lib/mock-data/hrm-org";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  apiEmployeeDocumentToUi,
  listHrmEmployeeDocuments,
} from "@/lib/api/hrm-employee-documents";
import {
  createCatalogMediaBatch,
  uploadCatalogMediaFiles,
  useCatalogMedia,
} from "@/lib/api/use-catalog-media";
import { cn } from "@/lib/utils";

/** Workdo employee create/edit tabs */
const TABS = [
  { id: "personal", label: "Personal" },
  { id: "company", label: "Company" },
  { id: "account", label: "Account" },
  { id: "bank", label: "Bank account" },
  { id: "documents", label: "Documents" },
] as const;

type TabId = (typeof TABS)[number]["id"];

type FormState = {
  employeeCode: string;
  biometricCode: string;
  name: string;
  email: string;
  phone: string;
  gender: EmployeeGender | "";
  dateOfBirth: string;
  maritalStatus: EmployeeMaritalStatus | "";
  nationality: string;
  bloodGroup: string;
  status: EmployeeStatus;
  joinDate: string;
  probationEndDate: string;
  confirmationDate: string;
  lastWorkingDay: string;
  manager: string;
  reportingToId: string;
  employmentType: EmploymentType;
  branchId: string;
  departmentId: string;
  designationId: string;
  shift: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  emergencyName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
  bankName: string;
  bankHolder: string;
  accountNo: string;
  bic: string;
  bankBranch: string;
  taxPayerId: string;
  basicSalary: string;
  hoursPerDay: string;
  daysPerWeek: string;
  ratePerHour: string;
  createLogin: boolean;
  accountRole: EmployeeAccountRole;
  language: string;
  accountStatus: EmployeeAccountStatus;
  password: string;
  passwordConfirm: string;
  avatarUrl: string;
  documents: EmployeeDocument[];
  docType: string;
  docFileName: string;
  docFilePath: string;
};

function emptyForm(code: string, biometric: string): FormState {
  return {
    employeeCode: code,
    biometricCode: biometric,
    name: "",
    email: "",
    phone: "",
    gender: "",
    dateOfBirth: "",
    maritalStatus: "",
    nationality: "Bangladeshi",
    bloodGroup: "",
    status: "active",
    joinDate: new Date().toISOString().slice(0, 10),
    probationEndDate: "",
    confirmationDate: "",
    lastWorkingDay: "",
    manager: "",
    reportingToId: "",
    employmentType: "full_time",
    branchId: HRM_BRANCHES[0]?.id ?? "",
    departmentId: "",
    designationId: "",
    shift: "General",
    addressLine1: "",
    addressLine2: "",
    city: "Dhaka",
    state: "Dhaka",
    country: "Bangladesh",
    postalCode: "",
    emergencyName: "",
    emergencyRelationship: "",
    emergencyPhone: "",
    bankName: "",
    bankHolder: "",
    accountNo: "",
    bic: "",
    bankBranch: "",
    taxPayerId: "",
    basicSalary: "",
    hoursPerDay: "8",
    daysPerWeek: "5",
    ratePerHour: "",
    createLogin: true,
    accountRole: "employee",
    language: "en",
    accountStatus: "active",
    password: "",
    passwordConfirm: "",
    avatarUrl: "",
    documents: [],
    docType: "NID",
    docFileName: "",
    docFilePath: "",
  };
}

function fromEmployee(employee: Employee): FormState {
  return {
    employeeCode: employee.employeeCode,
    biometricCode: employee.biometricCode ?? "",
    name: employee.name,
    email: employee.email,
    phone: employee.phone,
    gender: employee.gender ?? "",
    dateOfBirth: employee.dateOfBirth ?? "",
    maritalStatus: employee.maritalStatus ?? "",
    nationality: employee.nationality ?? "Bangladeshi",
    bloodGroup: employee.bloodGroup ?? "",
    status: employee.status,
    joinDate: employee.joinDate,
    probationEndDate: employee.probationEndDate ?? "",
    confirmationDate: employee.confirmationDate ?? "",
    lastWorkingDay: employee.lastWorkingDay ?? "",
    manager: employee.manager,
    reportingToId: employee.reportingToId ?? "",
    employmentType: employee.employmentType,
    branchId: employee.branchId ?? "",
    departmentId: employee.departmentId ?? "",
    designationId: employee.designationId ?? "",
    shift: employee.shift ?? "General",
    addressLine1: employee.address?.line1 ?? "",
    addressLine2: employee.address?.line2 ?? "",
    city: employee.address?.city ?? "Dhaka",
    state: employee.address?.state ?? "Dhaka",
    country: employee.address?.country ?? "Bangladesh",
    postalCode: employee.address?.postalCode ?? "",
    emergencyName: employee.emergencyContact?.name ?? "",
    emergencyRelationship: employee.emergencyContact?.relationship ?? "",
    emergencyPhone: employee.emergencyContact?.phone ?? "",
    bankName: employee.bank?.name ?? "",
    bankHolder: employee.bank?.holder ?? "",
    accountNo: employee.bank?.accountNo ?? "",
    bic: employee.bank?.bic ?? "",
    bankBranch: employee.bank?.branch ?? "",
    taxPayerId: employee.bank?.taxPayerId ?? "",
    basicSalary: employee.basicSalary != null ? String(employee.basicSalary) : "",
    hoursPerDay: employee.hoursPerDay != null ? String(employee.hoursPerDay) : "8",
    daysPerWeek: employee.daysPerWeek != null ? String(employee.daysPerWeek) : "5",
    ratePerHour: employee.ratePerHour != null ? String(employee.ratePerHour) : "",
    createLogin: employee.account?.createLogin ?? true,
    accountRole: employee.account?.role ?? "employee",
    language: employee.account?.language ?? "en",
    accountStatus: employee.account?.accountStatus ?? "active",
    password: "",
    passwordConfirm: "",
    avatarUrl: employee.avatarUrl ?? "",
    documents: employee.documents ? [...employee.documents] : [],
    docType: "NID",
    docFileName: "",
    docFilePath: "",
  };
}

type Props = {
  mode: "create" | "edit";
  initialEmployee?: Employee | null;
  existingEmployees: Employee[];
  onClose: () => void;
  onSave: (employee: Employee) => void | Promise<void>;
  /** Live org masters; falls back to mock HRM_* when omitted. */
  org?: {
    branches: HrmBranch[];
    departments: HrmDepartment[];
    designations: HrmDesignation[];
  };
  /** Live document types for Documents tab; falls back to EMPLOYEE_DOCUMENT_TYPES. */
  documentTypes?: { id: string; name: string }[];
};

export function EmployeeForm({
  mode,
  initialEmployee,
  existingEmployees,
  onClose,
  onSave,
  org,
  documentTypes,
}: Props) {
  const branches = org?.branches?.length ? org.branches : HRM_BRANCHES;
  const allDepartments = org?.departments?.length ? org.departments : HRM_DEPARTMENTS;
  const allDesignations = org?.designations?.length
    ? org.designations
    : HRM_DESIGNATIONS;

  const docTypeOptions = useMemo(() => {
    if (documentTypes && documentTypes.length > 0) {
      return documentTypes.map((t) => ({ value: t.id, label: t.name }));
    }
    return EMPLOYEE_DOCUMENT_TYPES.map((t) => ({ value: t, label: t }));
  }, [documentTypes]);

  const [tab, setTab] = useState<TabId>("personal");
  const [form, setForm] = useState<FormState>(() => {
    const base =
      mode === "edit" && initialEmployee
        ? fromEmployee(initialEmployee)
        : emptyForm(nextEmployeeCode(existingEmployees), nextBiometricCode(existingEmployees));
    return {
      ...base,
      docType: base.docType || docTypeOptions[0]?.value || "NID",
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<"avatar" | "document">("avatar");
  const [avatarMediaId, setAvatarMediaId] = useState<string | null>(null);
  const [docMediaId, setDocMediaId] = useState<string | null>(null);
  const { items: mediaItems, refetch: refetchMedia } = useCatalogMedia();
  const employeeKey = mode === "edit" ? initialEmployee?.id ?? "edit" : "create";

  // Reset only when opening a different employee / create session — not when
  // parent re-fetches the employee list (that was wiping Documents mid-edit).
  useEffect(() => {
    setTab("personal");
    setError(null);
    setAvatarMediaId(null);
    setDocMediaId(null);
    const base =
      mode === "edit" && initialEmployee
        ? fromEmployee(initialEmployee)
        : emptyForm(nextEmployeeCode(existingEmployees), nextBiometricCode(existingEmployees));
    setForm({
      ...base,
      docType: base.docType || docTypeOptions[0]?.value || "NID",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed by employeeKey only
  }, [employeeKey]);

  // Load persisted documents into the edit form (list row often has empty docs).
  useEffect(() => {
    if (mode !== "edit" || !initialEmployee?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listHrmEmployeeDocuments({ employee_id: initialEmployee.id });
        if (cancelled) return;
        const typeName = (id: string | null | undefined) =>
          documentTypes?.find((t) => t.id === id)?.name ?? id ?? "—";
        const docs = rows.map((r) => apiEmployeeDocumentToUi(r, typeName));
        setForm((prev) => ({ ...prev, documents: docs }));
      } catch {
        /* keep whatever is already on the form */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, initialEmployee?.id, documentTypes]);

  // Once real document types load, replace mock labels like "NID" with API ids.
  useEffect(() => {
    if (!documentTypes?.length) return;
    setForm((prev) => {
      const stillValid = documentTypes.some((t) => t.id === prev.docType);
      if (stillValid) return prev;
      const byName = documentTypes.find(
        (t) => t.name.toLowerCase() === prev.docType.toLowerCase() || t.name === "National ID",
      );
      const nextType = byName?.id ?? documentTypes[0]!.id;
      return {
        ...prev,
        docType: nextType,
        documents: prev.documents.map((doc) => {
          if (documentTypes.some((t) => t.id === doc.documentTypeId)) return doc;
          const match = documentTypes.find(
            (t) =>
              t.name.toLowerCase() === (doc.documentTypeId || doc.type || "").toLowerCase() ||
              t.name.toLowerCase() === doc.type.toLowerCase(),
          );
          return match
            ? { ...doc, documentTypeId: match.id, type: match.name }
            : { ...doc, documentTypeId: documentTypes[0]!.id, type: documentTypes[0]!.name };
        }),
      };
    });
  }, [documentTypes]);

  useEffect(() => {
    const url = form.avatarUrl.trim();
    if (!url) {
      setAvatarMediaId(null);
      return;
    }
    const match = mediaItems.find((item) => item.url === url);
    if (match) setAvatarMediaId(match.id);
  }, [form.avatarUrl, mediaItems]);

  const departments = useMemo(
    () => allDepartments.filter((d) => d.branchId === form.branchId),
    [allDepartments, form.branchId],
  );
  const designations = useMemo(
    () => allDesignations.filter((d) => d.departmentId === form.departmentId),
    [allDesignations, form.departmentId],
  );
  const managerOptions = useMemo(
    () =>
      existingEmployees
        .filter((e) => e.id !== initialEmployee?.id && e.status !== "terminated")
        .map((e) => ({ value: e.id, label: `${e.name} (${e.designation})` })),
    [existingEmployees, initialEmployee?.id],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const tabIndex = TABS.findIndex((t) => t.id === tab);
  const previewAvatar =
    form.avatarUrl.trim() ||
    employeeAvatarUrl(form.employeeCode || form.name || "new", form.gender || undefined);

  const validateCurrent = (): string | null => {
    if (tab === "personal") {
      if (!form.name.trim()) return "Full name is required";
      if (!form.email.trim()) return "Email is required";
      if (!form.phone.trim()) return "Phone is required";
    }
    if (tab === "company") {
      if (!form.biometricCode.trim()) return "Employee code (biometric) is required";
      if (!form.branchId) return "Branch is required";
      if (!form.departmentId) return "Department is required";
      if (!form.designationId) return "Designation is required";
      if (!form.joinDate) return "Joining date is required";
    }
    if (tab === "account" && form.createLogin && mode === "create") {
      if (!form.password.trim()) return "Password is required for login account";
      if (form.password !== form.passwordConfirm) return "Passwords do not match";
    }
    return null;
  };

  const goNext = () => {
    const err = validateCurrent();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (tabIndex < TABS.length - 1) setTab(TABS[tabIndex + 1].id);
  };

  const goPrev = () => {
    setError(null);
    if (tabIndex > 0) setTab(TABS[tabIndex - 1].id);
  };

  const addDocument = (override?: { fileName: string; filePath: string }) => {
    const filePath = (override?.filePath ?? form.docFilePath).trim() || (override?.fileName ?? form.docFileName).trim();
    const fileName =
      (override?.fileName ?? form.docFileName).trim() ||
      filePath.split("/").pop() ||
      "document";
    if (!filePath) {
      setError("Select a document from Media Library");
      return false;
    }
    if (!form.docType.trim()) {
      setError("Select a document type");
      return false;
    }
    const typeLabel =
      docTypeOptions.find((o) => o.value === form.docType)?.label ?? form.docType;
    setError(null);
    setForm((prev) => ({
      ...prev,
      documents: [
        ...prev.documents,
        {
          documentTypeId: prev.docType,
          type: typeLabel,
          fileName,
          filePath,
        },
      ],
      docFileName: "",
      docFilePath: "",
    }));
    setDocMediaId(null);
    return true;
  };

  const removeDocument = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = async () => {
    // If user picked a file but forgot "Add document", include it automatically.
    let documents = form.documents;
    if (form.docFilePath.trim() || form.docFileName.trim()) {
      const filePath = form.docFilePath.trim() || form.docFileName.trim();
      const fileName =
        form.docFileName.trim() || filePath.split("/").pop() || "document";
      const typeLabel =
        docTypeOptions.find((o) => o.value === form.docType)?.label ?? form.docType;
      if (form.docType.trim() && filePath) {
        documents = [
          ...documents,
          {
            documentTypeId: form.docType,
            type: typeLabel,
            fileName,
            filePath,
          },
        ];
      }
    }

    for (const t of TABS) {
      setTab(t.id);
      let err: string | null = null;
      if (t.id === "personal") {
        if (!form.name.trim()) err = "Full name is required";
        else if (!form.email.trim()) err = "Email is required";
        else if (!form.phone.trim()) err = "Phone is required";
      } else if (t.id === "company") {
        if (!form.branchId) err = "Branch is required";
        else if (!form.departmentId) err = "Department is required";
        else if (!form.designationId) err = "Designation is required";
        else if (!form.joinDate) err = "Joining date is required";
        else if (!form.biometricCode.trim()) err = "Employee code (biometric) is required";
      } else if (t.id === "account" && form.createLogin && mode === "create") {
        if (!form.password.trim()) err = "Password is required for login account";
        else if (form.password !== form.passwordConfirm) err = "Passwords do not match";
      }
      if (err) {
        setError(err);
        return;
      }
    }

    const dept = allDepartments.find((d) => d.id === form.departmentId);
    const des = allDesignations.find((d) => d.id === form.designationId);
    const branch = branches.find((b) => b.id === form.branchId);
    const salary = Number(form.basicSalary) || 0;
    const hours = Number(form.hoursPerDay) || 8;
    const days = Number(form.daysPerWeek) || 5;
    const rate =
      Number(form.ratePerHour) || (salary ? Math.round(salary / (hours * days * 4)) : 0);

    const managerEmp = existingEmployees.find((e) => e.id === form.reportingToId);
    const employee: Employee = {
      id: mode === "edit" && initialEmployee ? initialEmployee.id : `emp_${Date.now()}`,
      employeeCode: form.employeeCode,
      biometricCode: form.biometricCode.trim() || undefined,
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      department: dept?.name ?? "",
      designation: des?.name ?? "",
      status: form.status === "on_leave" ? "active" : form.status,
      joinDate: form.joinDate,
      manager: managerEmp?.name ?? "",
      reportingToId: form.reportingToId || undefined,
      workLocation: branch?.name ?? "",
      employmentType: form.employmentType,
      gender: form.gender || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      maritalStatus: form.maritalStatus || undefined,
      nationality: form.nationality.trim() || undefined,
      bloodGroup: form.bloodGroup || undefined,
      branchId: form.branchId || undefined,
      departmentId: form.departmentId || undefined,
      designationId: form.designationId || undefined,
      shift: form.shift || undefined,
      probationEndDate: form.probationEndDate || undefined,
      confirmationDate: form.confirmationDate || undefined,
      lastWorkingDay: form.lastWorkingDay || undefined,
      address: {
        line1: form.addressLine1.trim(),
        line2: form.addressLine2.trim() || undefined,
        city: form.city.trim(),
        state: form.state.trim(),
        country: form.country.trim(),
        postalCode: form.postalCode.trim(),
      },
      emergencyContact: {
        name: form.emergencyName.trim(),
        relationship: form.emergencyRelationship.trim(),
        phone: form.emergencyPhone.trim(),
      },
      bank: {
        name: form.bankName.trim(),
        holder: form.bankHolder.trim(),
        accountNo: form.accountNo.trim(),
        bic: form.bic.trim(),
        branch: form.bankBranch.trim(),
        taxPayerId: form.taxPayerId.trim() || undefined,
      },
      account: {
        createLogin: form.createLogin,
        role: form.accountRole,
        language: form.language,
        accountStatus: form.accountStatus,
        passwordSet:
          mode === "create"
            ? form.createLogin && !!form.password
            : initialEmployee?.account?.passwordSet || !!form.password,
      },
      basicSalary: salary || undefined,
      hoursPerDay: hours,
      daysPerWeek: days,
      ratePerHour: rate || undefined,
      documents,
      avatarUrl: form.avatarUrl.trim() || undefined,
    };

    setSaving(true);
    setError(null);
    try {
      await onSave(employee);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div className="flex h-full min-h-0 flex-col" data-form="hrm-employee-workdo">
      <div className="shrink-0 border-b border-border px-1">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                "shrink-0 border-b-2 px-3 py-2 text-xs font-medium outline-none",
                tab === t.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setError(null);
                setTab(t.id);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-4">
        {tab === "personal" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-2 rounded-none border border-border bg-muted/20 p-3">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewAvatar}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-none border border-border object-cover"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <Label className="text-xs text-muted-foreground">Profile photo</Label>
                  {form.avatarUrl.trim() ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-none"
                        onClick={() => {
                          setMediaPickerTarget("avatar");
                          void refetchMedia();
                          setMediaLibraryOpen(true);
                        }}
                      >
                        <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                        Change photo
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-none text-muted-foreground"
                        onClick={() => {
                          set("avatarUrl", "");
                          setAvatarMediaId(null);
                        }}
                      >
                        <X className="mr-1 h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMediaPickerTarget("avatar");
                        void refetchMedia();
                        setMediaLibraryOpen(true);
                      }}
                      className="w-full rounded-none border border-dashed border-input bg-background/60 px-3 py-4 text-left text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                    >
                      Click to open Media Library — select existing files or upload new ones
                    </button>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Same Media Library as products. One image is used as the profile photo.
                  </p>
                </div>
              </div>
            </div>
            <Field label="Full name *">
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="rounded-none"
                placeholder="Employee full name"
              />
            </Field>
            <Field label="Email *">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className="rounded-none"
                placeholder="Also used as login username"
              />
            </Field>
            <Field label="Phone *">
              <Input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Date of birth">
              <Input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set("dateOfBirth", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Gender">
              <FilterSelect
                value={form.gender || "all"}
                onChange={(v) => set("gender", v === "all" ? "" : (v as EmployeeGender))}
                options={[
                  { value: "all", label: "Select gender" },
                  ...Object.entries(EMPLOYEE_GENDER_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  })),
                ]}
                className="w-full"
                width="w-full"
              />
            </Field>
            <Field label="Marital status">
              <FilterSelect
                value={form.maritalStatus || "all"}
                onChange={(v) =>
                  set("maritalStatus", v === "all" ? "" : (v as EmployeeMaritalStatus))
                }
                options={[
                  { value: "all", label: "Select status" },
                  ...Object.entries(EMPLOYEE_MARITAL_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  })),
                ]}
                className="w-full"
                width="w-full"
              />
            </Field>
            <Field label="Nationality">
              <Input
                value={form.nationality}
                onChange={(e) => set("nationality", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Blood group">
              <FilterSelect
                value={form.bloodGroup || "all"}
                onChange={(v) => set("bloodGroup", v === "all" ? "" : v)}
                options={[
                  { value: "all", label: "Select blood group" },
                  ...EMPLOYEE_BLOOD_GROUPS.map((g) => ({ value: g, label: g })),
                ]}
                className="w-full"
                width="w-full"
              />
            </Field>
            <Field label="Address line 1" className="sm:col-span-2">
              <Input
                value={form.addressLine1}
                onChange={(e) => set("addressLine1", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Address line 2" className="sm:col-span-2">
              <Input
                value={form.addressLine2}
                onChange={(e) => set("addressLine2", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} className="rounded-none" />
            </Field>
            <Field label="State / Province">
              <Input value={form.state} onChange={(e) => set("state", e.target.value)} className="rounded-none" />
            </Field>
            <Field label="Country">
              <Input
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Postal code">
              <Input
                value={form.postalCode}
                onChange={(e) => set("postalCode", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Emergency contact name">
              <Input
                value={form.emergencyName}
                onChange={(e) => set("emergencyName", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Relationship">
              <Input
                value={form.emergencyRelationship}
                onChange={(e) => set("emergencyRelationship", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Emergency phone" className="sm:col-span-2">
              <Input
                value={form.emergencyPhone}
                onChange={(e) => set("emergencyPhone", e.target.value)}
                className="rounded-none"
              />
            </Field>
          </div>
        ) : null}

        {tab === "company" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Employee ID (auto)">
              <Input value={form.employeeCode} disabled className="rounded-none font-mono text-xs" />
            </Field>
            <Field label="Employee code (biometric) *">
              <Input
                value={form.biometricCode}
                onChange={(e) => set("biometricCode", e.target.value)}
                className="rounded-none font-mono text-xs"
                placeholder="Maps to biometric device"
              />
            </Field>
            <Field label="Branch *">
              <FilterSelect
                value={form.branchId || "all"}
                onChange={(v) => {
                  const branchId = v === "all" ? "" : v;
                  setForm((prev) => ({
                    ...prev,
                    branchId,
                    departmentId: "",
                    designationId: "",
                  }));
                }}
                options={[
                  { value: "all", label: "Select branch" },
                  ...branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
                className="w-full"
                width="w-full"
              />
            </Field>
            <Field label="Department *">
              <FilterSelect
                value={form.departmentId || "all"}
                onChange={(v) => {
                  const departmentId = v === "all" ? "" : v;
                  setForm((prev) => ({
                    ...prev,
                    departmentId,
                    designationId: "",
                  }));
                }}
                options={[
                  { value: "all", label: "Select department" },
                  ...departments.map((d) => ({ value: d.id, label: d.name })),
                ]}
                className="w-full"
                width="w-full"
              />
            </Field>
            <Field label="Designation *">
              <FilterSelect
                value={form.designationId || "all"}
                onChange={(v) => set("designationId", v === "all" ? "" : v)}
                options={[
                  { value: "all", label: "Select designation" },
                  ...designations.map((d) => ({ value: d.id, label: d.name })),
                ]}
                className="w-full"
                width="w-full"
              />
            </Field>
            <Field label="Shift">
              <FilterSelect
                value={form.shift}
                onChange={(v) => set("shift", v)}
                options={HRM_SHIFTS.map((s) => ({ value: s, label: s }))}
                className="w-full"
                width="w-full"
              />
            </Field>
            <Field label="Employment type">
              <FilterSelect
                value={form.employmentType}
                onChange={(v) => set("employmentType", v as EmploymentType)}
                options={Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
                className="w-full"
                width="w-full"
              />
            </Field>
            <Field label="Status">
              <FilterSelect
                value={form.status}
                onChange={(v) => set("status", v as EmployeeStatus)}
                options={Object.entries(EMPLOYEE_STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
                className="w-full"
                width="w-full"
              />
            </Field>
            <Field label="Joining date *">
              <Input
                type="date"
                value={form.joinDate}
                onChange={(e) => set("joinDate", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Probation end date">
              <Input
                type="date"
                value={form.probationEndDate}
                onChange={(e) => set("probationEndDate", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Confirmation date">
              <Input
                type="date"
                value={form.confirmationDate}
                onChange={(e) => set("confirmationDate", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Last working day">
              <Input
                type="date"
                value={form.lastWorkingDay}
                onChange={(e) => set("lastWorkingDay", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Reporting manager" className="sm:col-span-2">
              <FilterSelect
                value={form.reportingToId || "all"}
                onChange={(v) => {
                  const id = v === "all" ? "" : v;
                  const mgr = existingEmployees.find((e) => e.id === id);
                  setForm((prev) => ({
                    ...prev,
                    reportingToId: id,
                    manager: mgr?.name ?? "",
                  }));
                }}
                options={[
                  { value: "all", label: "No manager (top level)" },
                  ...managerOptions,
                ]}
                className="w-full"
                width="w-full"
              />
            </Field>
            <Field label="Hours per day">
              <Input
                type="number"
                value={form.hoursPerDay}
                onChange={(e) => set("hoursPerDay", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Days per week">
              <Input
                type="number"
                value={form.daysPerWeek}
                onChange={(e) => set("daysPerWeek", e.target.value)}
                className="rounded-none"
              />
            </Field>
          </div>
        ) : null}

        {tab === "account" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2 flex items-center gap-2 rounded-none border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.createLogin}
                onChange={(e) => set("createLogin", e.target.checked)}
                className="rounded-none"
              />
              Create login account (email used as username)
            </label>
            <Field label="Account type / role">
              <FilterSelect
                value={form.accountRole}
                onChange={(v) => set("accountRole", v as EmployeeAccountRole)}
                options={Object.entries(EMPLOYEE_ACCOUNT_ROLE_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
                className="w-full"
                width="w-full"
              />
            </Field>
            <Field label="Language">
              <FilterSelect
                value={form.language}
                onChange={(v) => set("language", v)}
                options={EMPLOYEE_LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
                className="w-full"
                width="w-full"
              />
            </Field>
            <Field label="Account status">
              <FilterSelect
                value={form.accountStatus}
                onChange={(v) => set("accountStatus", v as EmployeeAccountStatus)}
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                className="w-full"
                width="w-full"
              />
            </Field>
            <Field label="Login email">
              <Input value={form.email || "—"} disabled className="rounded-none text-xs" />
            </Field>
            {form.createLogin ? (
              <>
                <Field label={mode === "create" ? "Password *" : "New password (optional)"}>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    className="rounded-none"
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Confirm password">
                  <Input
                    type="password"
                    value={form.passwordConfirm}
                    onChange={(e) => set("passwordConfirm", e.target.value)}
                    className="rounded-none"
                    autoComplete="new-password"
                  />
                </Field>
              </>
            ) : null}
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              Account tab matches Workdo user provisioning — password is mock-only in this prototype.
            </p>
          </div>
        ) : null}

        {tab === "bank" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bank name">
              <Input
                value={form.bankName}
                onChange={(e) => set("bankName", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Account holder name">
              <Input
                value={form.bankHolder}
                onChange={(e) => set("bankHolder", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Account number">
              <Input
                value={form.accountNo}
                onChange={(e) => set("accountNo", e.target.value)}
                className="rounded-none font-mono text-xs"
              />
            </Field>
            <Field label="Bank identifier code (BIC / SWIFT)">
              <Input
                value={form.bic}
                onChange={(e) => set("bic", e.target.value)}
                className="rounded-none font-mono text-xs"
              />
            </Field>
            <Field label="Bank branch">
              <Input
                value={form.bankBranch}
                onChange={(e) => set("bankBranch", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Tax payer ID">
              <Input
                value={form.taxPayerId}
                onChange={(e) => set("taxPayerId", e.target.value)}
                className="rounded-none font-mono text-xs"
              />
            </Field>
            <Field label="Base salary (BDT)">
              <Input
                type="number"
                value={form.basicSalary}
                onChange={(e) => set("basicSalary", e.target.value)}
                className="rounded-none"
              />
            </Field>
            <Field label="Rate per hour">
              <Input
                type="number"
                value={form.ratePerHour}
                onChange={(e) => set("ratePerHour", e.target.value)}
                className="rounded-none"
              />
            </Field>
          </div>
        ) : null}

        {tab === "documents" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Document type">
                <FilterSelect
                  value={form.docType}
                  onChange={(v) => set("docType", v)}
                  options={docTypeOptions}
                  className="w-full"
                  width="w-full"
                />
              </Field>
              <Field label="File">
                <button
                  type="button"
                  onClick={() => {
                    setMediaPickerTarget("document");
                    void refetchMedia();
                    setMediaLibraryOpen(true);
                  }}
                  className="w-full rounded-none border border-dashed border-input bg-muted/20 px-3 py-3 text-left text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  Click to open Media Library — prefer Upload for a real PDF (seed “PDF” items are placeholders)
                </button>
              </Field>
            </div>
            {form.documents.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No documents yet — pick a type, then select a PDF/image from Media Library.
              </p>
            ) : (
              <div className="divide-y divide-border border border-border">
                {form.documents.map((doc, idx) => (
                  <div key={`${doc.type}-${doc.fileName}-${idx}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{doc.type}</span>
                      <span className="text-muted-foreground"> · </span>
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
                        <span className="text-muted-foreground">{doc.fileName}</span>
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-none text-xs"
                      onClick={() => removeDocument(idx)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={onClose}>
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          {tabIndex > 0 ? (
            <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={goPrev}>
              Previous
            </Button>
          ) : null}
          {tabIndex < TABS.length - 1 ? (
            <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={goNext}>
              Next
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="rounded-none"
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving
              ? "Saving…"
              : mode === "create"
                ? "Create employee"
                : "Save changes"}
          </Button>
        </div>
      </div>
    </div>

    <MediaLibraryModal
      open={mediaLibraryOpen}
      onOpenChange={(open) => {
        setMediaLibraryOpen(open);
        if (open) void refetchMedia();
      }}
      items={mediaItems}
      mode="single"
      title={mediaPickerTarget === "avatar" ? "Select profile photo" : "Select employee document"}
      accept={mediaPickerTarget === "avatar" ? ["image"] : ["image", "document"]}
      initialSelectedIds={
        mediaPickerTarget === "avatar"
          ? avatarMediaId
            ? [avatarMediaId]
            : []
          : docMediaId
            ? [docMediaId]
            : []
      }
      onSelect={(items) => {
        const picked = items[0];
        if (!picked) return;
        if (mediaPickerTarget === "avatar") {
          setAvatarMediaId(picked.id);
          set("avatarUrl", picked.url);
          return;
        }
        const fileName = picked.name || picked.url.split("/").pop() || "document";
        const filePath = picked.url;
        const isDemoPlaceholder =
          /placehold\.co|picsum\.photos/i.test(filePath) ||
          (!filePath.includes("/uploads/") && /\.pdf$/i.test(fileName) && !filePath.toLowerCase().endsWith(".pdf"));
        if (isDemoPlaceholder) {
          toast.message("Demo media selected", {
            description:
              "Library seed files are placeholders. Use Upload tab to add a real PDF for National ID.",
          });
        }
        setDocMediaId(picked.id);
        // Auto-add to the documents list (no extra "Add document" click required).
        setForm((prev) => {
          const typeLabel =
            docTypeOptions.find((o) => o.value === prev.docType)?.label ?? prev.docType;
          return {
            ...prev,
            documents: [
              ...prev.documents,
              {
                documentTypeId: prev.docType,
                type: typeLabel,
                fileName,
                filePath,
              },
            ],
            docFileName: "",
            docFilePath: "",
          };
        });
        setError(null);
      }}
      onUploadFiles={async (files) => {
        const uploaded = await uploadCatalogMediaFiles(files);
        await refetchMedia();
        return uploaded;
      }}
      onImportItems={async (items) => {
        const saved = await createCatalogMediaBatch(items);
        await refetchMedia();
        return saved;
      }}
    />
    </>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
