import { apiFetch } from "@/lib/api/client";
import type {
  Employee,
  EmployeeAccountRole,
  EmployeeAccountStatus,
  EmployeeGender,
  EmployeeMaritalStatus,
  EmployeeStatus,
  EmploymentType,
} from "@/lib/mock-data/employees";

export type ApiHrmEmployee = {
  id: string;
  company_id: string;
  employee_code: string;
  name: string;
  email: string | null;
  biometric_emp_id: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  nationality: string | null;
  blood_group: string | null;
  branch_id: string | null;
  department_id: string | null;
  designation_id: string | null;
  shift_id: string | null;
  shift_name: string | null;
  attendance_policy_id: string | null;
  date_of_joining: string | null;
  probation_end_date: string | null;
  confirmation_date: string | null;
  last_working_day: string | null;
  base_salary: string | number | null;
  hours_per_day: string | number | null;
  days_per_week: string | number | null;
  rate_per_hour: string | number | null;
  employment_type: string | null;
  employee_status: string;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_number: string | null;
  bank_name: string | null;
  account_holder_name: string | null;
  account_number: string | null;
  bank_identifier_code: string | null;
  bank_branch: string | null;
  tax_payer_id: string | null;
  photo: string | null;
  create_login: boolean;
  account_role: string | null;
  language: string | null;
  account_status: string | null;
  auth_user_id: string | null;
  reporting_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiListResponse = {
  data: ApiHrmEmployee[];
  meta: { count: number; page: number; per_page: number };
  errors: string[];
};

type ApiItemResponse = {
  data: ApiHrmEmployee;
  errors: string[];
};

export type OrgNameLookup = {
  branchName: (id: string | null | undefined) => string;
  departmentName: (id: string | null | undefined) => string;
  designationName: (id: string | null | undefined) => string;
  managerName?: (id: string | null | undefined) => string;
};

const API_STATUSES = new Set(["active", "inactive", "terminated", "probation"]);
const MARITAL = new Set(["single", "married", "divorced", "widowed"]);
const ACCOUNT_ROLES = new Set(["employee", "hr", "admin"]);

function mapStatus(raw: string): EmployeeStatus {
  if (raw === "on_leave") return "active";
  if (API_STATUSES.has(raw)) return raw as EmployeeStatus;
  return "active";
}

function mapEmploymentType(raw: string | null): EmploymentType {
  if (
    raw === "full_time" ||
    raw === "part_time" ||
    raw === "temporary" ||
    raw === "contract"
  ) {
    return raw;
  }
  return "full_time";
}

function blankToUndef(value: string | null | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
}

function dateOrUndef(value: string | null | undefined): string | undefined {
  return blankToUndef(value);
}

function numOrUndef(value: string | number | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function apiEmployeeToEmployee(
  row: ApiHrmEmployee,
  org: OrgNameLookup,
): Employee {
  const status = mapStatus(row.employee_status);
  const salary = numOrUndef(row.base_salary);
  const marital =
    row.marital_status && MARITAL.has(row.marital_status)
      ? (row.marital_status as EmployeeMaritalStatus)
      : undefined;
  const role =
    row.account_role && ACCOUNT_ROLES.has(row.account_role)
      ? (row.account_role as EmployeeAccountRole)
      : undefined;
  const accountStatus =
    row.account_status === "active" || row.account_status === "inactive"
      ? (row.account_status as EmployeeAccountStatus)
      : undefined;

  return {
    id: row.id,
    employeeCode: row.employee_code,
    biometricCode: row.biometric_emp_id ?? undefined,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    department: org.departmentName(row.department_id),
    designation: org.designationName(row.designation_id),
    status,
    joinDate: row.date_of_joining ?? "",
    manager: org.managerName?.(row.reporting_to) ?? "",
    reportingToId: row.reporting_to ?? undefined,
    workLocation: org.branchName(row.branch_id),
    employmentType: mapEmploymentType(row.employment_type),
    gender: (row.gender as EmployeeGender | null) ?? undefined,
    dateOfBirth: row.date_of_birth ?? undefined,
    maritalStatus: marital,
    nationality: row.nationality ?? undefined,
    bloodGroup: row.blood_group ?? undefined,
    branchId: row.branch_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    designationId: row.designation_id ?? undefined,
    shift: row.shift_name ?? undefined,
    probationEndDate: row.probation_end_date ?? undefined,
    confirmationDate: row.confirmation_date ?? undefined,
    lastWorkingDay: row.last_working_day ?? undefined,
    hoursPerDay: numOrUndef(row.hours_per_day),
    daysPerWeek: numOrUndef(row.days_per_week),
    ratePerHour: numOrUndef(row.rate_per_hour),
    address: {
      line1: row.address_line_1 ?? "",
      line2: row.address_line_2 ?? undefined,
      city: row.city ?? "",
      state: row.state ?? "",
      country: row.country ?? "",
      postalCode: row.postal_code ?? "",
    },
    emergencyContact: {
      name: row.emergency_contact_name ?? "",
      relationship: row.emergency_contact_relationship ?? "",
      phone: row.emergency_contact_number ?? "",
    },
    bank: {
      name: row.bank_name ?? "",
      holder: row.account_holder_name ?? "",
      accountNo: row.account_number ?? "",
      bic: row.bank_identifier_code ?? "",
      branch: row.bank_branch ?? "",
      taxPayerId: row.tax_payer_id ?? undefined,
    },
    account: {
      createLogin: Boolean(row.create_login),
      role: role ?? "employee",
      language: row.language ?? "en",
      accountStatus: accountStatus ?? "active",
      passwordSet: Boolean(row.auth_user_id),
    },
    basicSalary: salary,
    avatarUrl: row.photo?.trim() || undefined,
  };
}

export function employeeToCreatePayload(employee: Employee) {
  return {
    company_id: "default",
    name: employee.name.trim(),
    email: blankToUndef(employee.email)?.toLowerCase(),
    employee_code: blankToUndef(employee.employeeCode),
    biometric_emp_id: blankToUndef(employee.biometricCode),
    phone: blankToUndef(employee.phone),
    date_of_birth: dateOrUndef(employee.dateOfBirth),
    gender: employee.gender || undefined,
    marital_status: employee.maritalStatus || undefined,
    nationality: blankToUndef(employee.nationality),
    blood_group: blankToUndef(employee.bloodGroup),
    branch_id: blankToUndef(employee.branchId),
    department_id: blankToUndef(employee.departmentId),
    designation_id: blankToUndef(employee.designationId),
    reporting_to: employee.reportingToId?.trim() || null,
    shift_name: blankToUndef(employee.shift),
    date_of_joining: dateOrUndef(employee.joinDate),
    probation_end_date: dateOrUndef(employee.probationEndDate),
    confirmation_date: dateOrUndef(employee.confirmationDate),
    last_working_day: dateOrUndef(employee.lastWorkingDay),
    base_salary: employee.basicSalary ?? undefined,
    hours_per_day: employee.hoursPerDay ?? undefined,
    days_per_week: employee.daysPerWeek ?? undefined,
    rate_per_hour: employee.ratePerHour ?? undefined,
    employment_type: employee.employmentType,
    employee_status: mapStatus(employee.status),
    address_line_1: blankToUndef(employee.address?.line1),
    address_line_2: blankToUndef(employee.address?.line2),
    city: blankToUndef(employee.address?.city),
    state: blankToUndef(employee.address?.state),
    country: blankToUndef(employee.address?.country),
    postal_code: blankToUndef(employee.address?.postalCode),
    emergency_contact_name: blankToUndef(employee.emergencyContact?.name),
    emergency_contact_relationship: blankToUndef(
      employee.emergencyContact?.relationship,
    ),
    emergency_contact_number: blankToUndef(employee.emergencyContact?.phone),
    bank_name: blankToUndef(employee.bank?.name),
    account_holder_name: blankToUndef(employee.bank?.holder),
    account_number: blankToUndef(employee.bank?.accountNo),
    bank_identifier_code: blankToUndef(employee.bank?.bic),
    bank_branch: blankToUndef(employee.bank?.branch),
    tax_payer_id: blankToUndef(employee.bank?.taxPayerId),
    photo: blankToUndef(employee.avatarUrl),
    create_login: Boolean(employee.account?.createLogin),
    account_role: employee.account?.role || undefined,
    language: blankToUndef(employee.account?.language),
    account_status: employee.account?.accountStatus || undefined,
  };
}

export function employeeToUpdatePayload(employee: Employee) {
  const { company_id: _c, employee_code: _code, ...rest } =
    employeeToCreatePayload(employee);
  return rest;
}

export async function listHrmEmployees(params?: {
  page?: number;
  per_page?: number;
  employee_status?: string;
  branch_id?: string;
  department_id?: string;
  q?: string;
}): Promise<{ rows: ApiHrmEmployee[]; total: number }> {
  const qs = new URLSearchParams();
  qs.set("company_id", "default");
  qs.set("page", String(params?.page ?? 1));
  qs.set("per_page", String(params?.per_page ?? 200));
  if (params?.employee_status) qs.set("employee_status", params.employee_status);
  if (params?.branch_id) qs.set("branch_id", params.branch_id);
  if (params?.department_id) qs.set("department_id", params.department_id);
  if (params?.q) qs.set("q", params.q);
  const res = await apiFetch<ApiListResponse>(
    `/api/v1/hrm/employees?${qs.toString()}`,
    { cache: "no-store" },
  );
  return { rows: res.data ?? [], total: res.meta?.count ?? res.data?.length ?? 0 };
}

export async function createHrmEmployee(employee: Employee): Promise<ApiHrmEmployee> {
  const res = await apiFetch<ApiItemResponse>("/api/v1/hrm/employees", {
    method: "POST",
    body: JSON.stringify(employeeToCreatePayload(employee)),
  });
  return res.data;
}

export async function updateHrmEmployee(
  id: string,
  employee: Employee,
): Promise<ApiHrmEmployee> {
  const res = await apiFetch<ApiItemResponse>(
    `/api/v1/hrm/employees/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify(employeeToUpdatePayload(employee)),
    },
  );
  return res.data;
}

export async function deleteHrmEmployee(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/employees/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

export function buildOrgNameLookup(input: {
  branches: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  designations: { id: string; name: string }[];
  employees?: { id: string; name: string }[];
}): OrgNameLookup {
  const branchMap = new Map(input.branches.map((b) => [b.id, b.name]));
  const deptMap = new Map(input.departments.map((d) => [d.id, d.name]));
  const desMap = new Map(input.designations.map((d) => [d.id, d.name]));
  const empMap = new Map((input.employees ?? []).map((e) => [e.id, e.name]));
  return {
    branchName: (id) => (id ? branchMap.get(id) ?? "" : ""),
    departmentName: (id) => (id ? deptMap.get(id) ?? "" : ""),
    designationName: (id) => (id ? desMap.get(id) ?? "" : ""),
    managerName: (id) => (id ? empMap.get(id) ?? "" : ""),
  };
}
